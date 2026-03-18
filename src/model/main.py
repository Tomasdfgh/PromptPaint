"""
Model service — FastAPI app that owns the SDXL pipeline.
Runs on its own CUDA container, stays up across Flask restarts.

Endpoints:
  GET  /health
  POST /generate   → streams newline-delimited JSON (progress + final image)
  POST /intervene  → swaps embedding mid-generation
  POST /encode     → returns embeddings for a prompt (for future use)
"""

import asyncio
import base64
import io
import json
import threading
from contextlib import asynccontextmanager

import numpy as np
import torch
from fastapi import FastAPI
from fastapi.responses import StreamingResponse
from PIL import Image
from pydantic import BaseModel

from pipeline import load_pipeline, get_pipeline
from features.embedding import encode_prompt, mix_embeddings, directional_embedding
from features.stencil import apply_stencil, remove_stencil, mask_from_brush_strokes


# ---------------------------------------------------------------------------
# App lifecycle
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    load_pipeline()
    yield

app = FastAPI(lifespan=lifespan)


# ---------------------------------------------------------------------------
# Per-session generation state — one GenerationState per connected client
# ---------------------------------------------------------------------------

class GenerationState:
    def __init__(self):
        self._lock        = threading.Lock()
        self.running      = False
        self.cancel_flag  = False
        self._embedding   = None   # (seq, pooled) — swappable mid-loop
        self.current_step = 0

    def start(self, embedding):
        with self._lock:
            self.running      = True
            self.cancel_flag  = False
            self._embedding   = embedding
            self.current_step = 0

    def set_embedding(self, emb):
        with self._lock:
            self._embedding = emb

    def get_embedding(self):
        with self._lock:
            return self._embedding

    def request_cancel(self):
        with self._lock:
            self.cancel_flag = True

    def is_cancelled(self):
        with self._lock:
            return self.cancel_flag


# Dict keyed by session_id (Socket.IO sid passed from the Flask backend)
sessions: dict[str, GenerationState] = {}
sessions_lock = threading.Lock()


def _get_session(session_id: str) -> GenerationState | None:
    with sessions_lock:
        return sessions.get(session_id)

def _create_session(session_id: str) -> GenerationState:
    state = GenerationState()
    with sessions_lock:
        sessions[session_id] = state
    return state

def _delete_session(session_id: str):
    with sessions_lock:
        sessions.pop(session_id, None)


# ---------------------------------------------------------------------------
# Request models
# ---------------------------------------------------------------------------

class GenerateRequest(BaseModel):
    session_id:          str   = "default"
    mode:                str   = "standard"
    prompt:              str   = ""
    negative_prompt:     str   = ""
    prompt_a:            str   = ""
    prompt_b:            str   = ""
    from_concept:        str   = ""
    to_concept:          str   = ""
    intervention_prompt: str   = ""
    alpha:               float = 0.5
    scale:               float = 1.0
    steps:               int   = 20
    guide_scale:         float = 7.0
    single_stroke:       int   = 100
    overcoat:            int   = 70
    width:               int   = 1024
    height:              int   = 1024
    intervention_step:   int   = 15
    strokes:             list  = []
    prompts:             list  = []

class InterveneRequest(BaseModel):
    session_id: str = "default"
    prompt:     str = ""

class CancelRequest(BaseModel):
    session_id: str = "default"

class EncodeRequest(BaseModel):
    prompt: str


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _latents_to_b64(latents: torch.Tensor, pipe) -> str:
    with torch.no_grad():
        # SDXL VAE produces NaN in float16 — upcast to float32 for decode
        image = pipe.vae.decode(
            latents.to(torch.float32) / pipe.vae.config.scaling_factor,
            return_dict=False,
        )[0]
    image = (image / 2 + 0.5).clamp(0, 1)
    image = torch.nan_to_num(image, nan=0.0)  # safety net
    image = image.squeeze(0).permute(1, 2, 0).float().cpu().numpy()
    image = (image * 255).round().astype(np.uint8)
    buf = io.BytesIO()
    Image.fromarray(image).save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode()

def _event(data: dict) -> str:
    return json.dumps(data) + "\n"


# ---------------------------------------------------------------------------
# Generation loop (runs in a thread, yields via a queue)
# ---------------------------------------------------------------------------

def _generation_loop(req: GenerateRequest, queue: asyncio.Queue, loop: asyncio.AbstractEventLoop):
    pipe     = get_pipeline()
    mode     = req.mode
    state    = _get_session(req.session_id)

    try:
        # Encode negative prompt
        neg_emb, neg_pooled = encode_prompt(req.negative_prompt, pipe)

        # Encode positive prompt(s) based on mode
        if mode == "standard":
            pos_emb, pos_pooled = encode_prompt(req.prompt, pipe)

        elif mode == "mixing":
            # prompts: [{text, weight}, ...] — supports 2 or more
            prompt_list = req.prompts if req.prompts else [
                {"text": req.prompt_a, "weight": 1 - req.alpha},
                {"text": req.prompt_b, "weight": req.alpha},
            ]
            print(f"[mixing] {len(prompt_list)} prompts: {[(p['text'][:30], p['weight']) for p in prompt_list]}")
            embeddings = [encode_prompt(p["text"], pipe) for p in prompt_list]
            weights    = [float(p["weight"]) for p in prompt_list]
            pos_emb, pos_pooled = mix_embeddings(embeddings, weights)

        elif mode == "directional":
            base    = encode_prompt(req.prompt,       pipe)
            from_c  = encode_prompt(req.from_concept, pipe)
            to_c    = encode_prompt(req.to_concept,   pipe)
            pos_emb, pos_pooled = directional_embedding(base, from_c, to_c, req.scale)

        elif mode == "intervention":
            pos_emb, pos_pooled = encode_prompt(req.prompt, pipe)
            int_emb, int_pooled = encode_prompt(req.intervention_prompt, pipe)

        elif mode == "stencil":
            emb_a, pooled_a = encode_prompt(req.prompt_a, pipe)
            emb_b, pooled_b = encode_prompt(req.prompt_b, pipe)
            mask = mask_from_brush_strokes(req.strokes, image_size=req.width).to(pipe.device)
            apply_stencil(pipe.unet, emb_a, emb_b, mask)
            pos_emb, pos_pooled = emb_a, pooled_a  # UNet call uses emb_a; processor handles split

        else:
            asyncio.run_coroutine_threadsafe(
                queue.put(_event({"type": "error", "message": f"Unknown mode: {mode}"})), loop
            )
            return

        state.start((pos_emb, pos_pooled))

        # Scheduler + latents
        pipe.scheduler.set_timesteps(req.steps, device=pipe.device)
        timesteps = pipe.scheduler.timesteps

        latent_shape = (1, pipe.unet.config.in_channels, req.height // 8, req.width // 8)
        latents = torch.randn(latent_shape, device=pipe.device, dtype=torch.float16)
        latents = latents * pipe.scheduler.init_noise_sigma

        add_time_ids = torch.tensor(
            [[req.height, req.width, 0, 0, req.height, req.width]],
            dtype=torch.float16, device=pipe.device,
        )

        # Emit initial noise so the canvas clears immediately
        asyncio.run_coroutine_threadsafe(
            queue.put(_event({
                "type":    "progress",
                "step":    0,
                "total":   req.steps,
                "preview": _latents_to_b64(latents, pipe),
            })), loop
        )

        for i, t in enumerate(timesteps):
            if state.is_cancelled():
                asyncio.run_coroutine_threadsafe(
                    queue.put(_event({"type": "cancelled"})), loop
                )
                return

            state.current_step = i

            # Pick embeddings for this step
            if mode == "intervention" and i >= req.intervention_step:
                cur_emb, cur_pooled = state.get_embedding() or (int_emb, int_pooled)
            elif mode == "stencil":
                cur_emb, cur_pooled = pos_emb, pos_pooled
            else:
                cur_emb, cur_pooled = state.get_embedding() or (pos_emb, pos_pooled)

            # CFG: batch unconditional + conditional
            latents_in   = pipe.scheduler.scale_model_input(torch.cat([latents, latents]), t)
            emb_in       = torch.cat([neg_emb,    cur_emb])
            pooled_in    = torch.cat([neg_pooled, cur_pooled])
            time_ids_in  = torch.cat([add_time_ids, add_time_ids])

            with torch.no_grad():
                noise_pred = pipe.unet(
                    latents_in,
                    t,
                    encoder_hidden_states=emb_in,
                    added_cond_kwargs={"text_embeds": pooled_in, "time_ids": time_ids_in},
                ).sample

            noise_uncond, noise_cond = noise_pred.chunk(2)
            noise_pred = noise_uncond + req.guide_scale * (noise_cond - noise_uncond)
            latents = pipe.scheduler.step(noise_pred, t, latents).prev_sample

            # Emit preview every single_stroke% of steps (100% = only at the end)
            preview_every = max(1, round(req.steps * req.single_stroke / 100))
            is_preview_step = (i + 1) % preview_every == 0 or i == req.steps - 1
            event_data = {"type": "progress", "step": i + 1, "total": req.steps}
            if is_preview_step:
                event_data["preview"] = _latents_to_b64(latents, pipe)
            asyncio.run_coroutine_threadsafe(queue.put(_event(event_data)), loop)

        # Final image
        final = _latents_to_b64(latents, pipe)
        asyncio.run_coroutine_threadsafe(
            queue.put(_event({"type": "result", "image": final})), loop
        )

    except Exception as e:
        asyncio.run_coroutine_threadsafe(
            queue.put(_event({"type": "error", "message": str(e)})), loop
        )
        raise

    finally:
        if mode == "stencil":
            remove_stencil(pipe.unet)
        _delete_session(req.session_id)
        import gc; gc.collect()
        torch.cuda.empty_cache()
        asyncio.run_coroutine_threadsafe(queue.put(None), loop)  # sentinel


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.get("/health")
def health():
    pipe = get_pipeline()
    return {"status": "ok", "device": str(pipe.device)}


@app.post("/generate")
async def generate(req: GenerateRequest):
    existing = _get_session(req.session_id)
    if existing and existing.running:
        return {"error": "Generation already in progress for this session"}

    state = _create_session(req.session_id)

    loop  = asyncio.get_event_loop()
    queue = asyncio.Queue()

    thread = threading.Thread(
        target=_generation_loop,
        args=(req, queue, loop),
        daemon=True,
    )
    thread.start()

    async def stream():
        while True:
            item = await queue.get()
            if item is None:
                break
            yield item

    return StreamingResponse(
        stream(),
        media_type="application/x-ndjson",
        headers={
            "X-Accel-Buffering": "no",
            "Cache-Control": "no-cache",
        },
    )


@app.post("/intervene")
def intervene(req: InterveneRequest):
    state = _get_session(req.session_id)
    if not state or not state.running:
        return {"error": "No generation in progress for this session"}
    pipe = get_pipeline()
    emb  = encode_prompt(req.prompt, pipe)
    state.set_embedding(emb)
    return {"status": "ok", "step": state.current_step}


@app.post("/cancel")
def cancel(req: CancelRequest):
    state = _get_session(req.session_id)
    if state:
        state.request_cancel()
    return {"status": "ok"}


@app.post("/encode")
def encode(req: EncodeRequest):
    pipe = get_pipeline()
    seq, pooled = encode_prompt(req.prompt, pipe)
    return {
        "seq":    seq.cpu().tolist(),
        "pooled": pooled.cpu().tolist(),
    }
