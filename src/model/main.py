"""
Model service — FastAPI app that owns the SDXL pipeline.
Runs on its own CUDA container, stays up across Flask restarts.

Endpoints:
  GET  /health
  POST /generate   → streams newline-delimited JSON (progress + final image)
  POST /encode     → returns embeddings for a prompt (for future use)
"""

import asyncio
import base64
import io
import json
import queue as stdlib_queue
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
from features.stencil import mask_from_brush_strokes


# ---------------------------------------------------------------------------
# App lifecycle
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    load_pipeline()
    worker = threading.Thread(target=_gpu_worker, daemon=True)
    worker.start()
    yield
    _gpu_queue.put(None)  # shutdown sentinel

app = FastAPI(lifespan=lifespan)

# ---------------------------------------------------------------------------
# GPU job queue — single worker serialises all generation onto one GPU
# ---------------------------------------------------------------------------

_gpu_queue: stdlib_queue.Queue = stdlib_queue.Queue()
_worker_busy = False  # approximate — used only for queue-position estimates

def _gpu_worker():
    global _worker_busy
    while True:
        job = _gpu_queue.get()
        if job is None:
            break
        req, event_queue, loop = job
        _worker_busy = True
        try:
            asyncio.run_coroutine_threadsafe(
                event_queue.put(_event({"type": "started"})), loop
            )
            _generation_loop(req, event_queue, loop)
        except Exception as e:
            print(f"[worker] unhandled exception for session {req.session_id}: {e}")
        finally:
            _worker_busy = False


# ---------------------------------------------------------------------------
# Per-session generation state — one GenerationState per connected client
# ---------------------------------------------------------------------------

class GenerationState:
    def __init__(self):
        self._lock        = threading.Lock()
        self.running      = False
        self._embedding   = None   # (seq, pooled) — swappable mid-loop
        self.current_step = 0

    def start(self, embedding):
        with self._lock:
            self.running      = True
            self._embedding   = embedding
            self.current_step = 0

    def get_embedding(self):
        with self._lock:
            return self._embedding



# Dict keyed by session_id (Socket.IO sid passed from the Flask backend)
sessions: dict[str, GenerationState] = {}
sessions_lock = threading.Lock()

# Per-session latent store — CPU tensors keyed by (session_id, step)
# Persists across generation calls so the user can scrub back and resume.
_session_latents: dict[str, dict[int, torch.Tensor]] = {}
_session_latents_lock = threading.Lock()

def _save_latent(session_id: str, step: int, latent: torch.Tensor):
    with _session_latents_lock:
        if session_id not in _session_latents:
            _session_latents[session_id] = {}
        _session_latents[session_id][step] = latent.cpu()

def _get_latent(session_id: str, step: int) -> torch.Tensor | None:
    with _session_latents_lock:
        return _session_latents.get(session_id, {}).get(step)

def _clear_session_latents(session_id: str):
    with _session_latents_lock:
        _session_latents.pop(session_id, None)


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
    alpha:               float = 0.5
    scale:               float = 1.0
    steps:               int   = 40
    guide_scale:         float = 7.0
    single_stroke:       int   = 20
    overcoat:            int   = 100
    width:               int   = 1024
    height:              int   = 1024
    resume_step:         int   = -1
    strokes:             list  = []
    prompts:             list  = []
    directional_prompts: list  = []
    image_b64:           str   = ""

class EncodeRequest(BaseModel):
    prompt: str


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _decode_latents(latents: torch.Tensor, pipe) -> np.ndarray:
    with torch.no_grad():
        # SDXL VAE produces NaN in float16 — upcast to float32 for decode
        image = pipe.vae.decode(
            latents.to(torch.float32) / pipe.vae.config.scaling_factor,
            return_dict=False,
        )[0]
    image = (image / 2 + 0.5).clamp(0, 1)
    image = torch.nan_to_num(image, nan=0.0)  # safety net
    image = image.squeeze(0).permute(1, 2, 0).float().cpu().numpy()
    return (image * 255).round().astype(np.uint8)

def _latents_to_b64(latents: torch.Tensor, pipe) -> str:
    image = _decode_latents(latents, pipe)
    buf = io.BytesIO()
    Image.fromarray(image).save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode()

def _latents_to_b64_masked(latents: torch.Tensor, mask: torch.Tensor, width: int, height: int, pipe) -> str:
    """Decode to RGBA PNG — painted region opaque, unmasked region transparent."""
    import torch.nn.functional as F
    image = _decode_latents(latents, pipe)
    alpha = F.interpolate(
        mask.float().unsqueeze(0).unsqueeze(0), size=(height, width), mode='nearest'
    )
    alpha = (alpha.squeeze().cpu().numpy() * 255).astype(np.uint8)
    rgba = np.dstack([image, alpha])
    buf = io.BytesIO()
    Image.fromarray(rgba, mode='RGBA').save(buf, format="PNG")
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

        elif mode == "stencil":
            print(f"[stencil] strokes={len(req.strokes)} has_image={bool(req.image_b64)}")
            if req.prompts:
                # Use the palette mixing embedding for the painted region
                prompt_list = req.prompts
                print(f"[stencil] using {len(prompt_list)} mixed prompts for painted region")
                embeddings = [encode_prompt(p["text"], pipe) for p in prompt_list]
                weights    = [float(p["weight"]) for p in prompt_list]
                pos_emb, pos_pooled = mix_embeddings(embeddings, weights)
            else:
                # Fallback: single prompt_b
                print(f"[stencil] prompt_b='{req.prompt_b[:60]}'")
                pos_emb, pos_pooled = encode_prompt(req.prompt_b, pipe)
            stencil_mask = mask_from_brush_strokes(req.strokes, width=req.width, height=req.height).to(pipe.device)  # [H_lat, W_lat], 1=painted
            stencil_mask_4d = stencil_mask.unsqueeze(0).unsqueeze(0)  # [1, 1, H_lat, W_lat]
            painted_frac = stencil_mask.mean().item()
            print(f"[stencil] mask shape={tuple(stencil_mask.shape)} painted={painted_frac*100:.1f}% unpainted={100-painted_frac*100:.1f}%")

            # Encode the existing canvas image (or a blank white canvas) so we can pin the unmasked region
            import base64 as _b64, io as _io
            from PIL import Image as _PILImage
            if req.image_b64:
                img_bytes = _b64.b64decode(req.image_b64)
                img = _PILImage.open(_io.BytesIO(img_bytes)).convert("RGB").resize((req.width, req.height))
                print(f"[stencil] encoded existing image → latent shape will be computed")
            else:
                img = _PILImage.new("RGB", (req.width, req.height), color=(255, 255, 255))
                print(f"[stencil] no existing image — using blank white canvas as base")
            img_np = np.array(img).astype(np.float32) / 127.5 - 1.0
            img_tensor = torch.tensor(img_np).permute(2, 0, 1).unsqueeze(0).to(pipe.device, dtype=torch.float32)
            with torch.no_grad():
                stencil_image_latent = (pipe.vae.encode(img_tensor).latent_dist.sample() * pipe.vae.config.scaling_factor).to(torch.float16)
            stencil_noise = torch.randn_like(stencil_image_latent)  # fixed noise for consistent unmasked region
            print(f"[stencil] latent shape={tuple(stencil_image_latent.shape)}")

        else:
            asyncio.run_coroutine_threadsafe(
                queue.put(_event({"type": "error", "message": f"Unknown mode: {mode}"})), loop
            )
            return

        # Apply directional prompts on top of whatever embedding was computed above.
        # Skip entries where from/to are empty or scale is zero.
        for d in req.directional_prompts:
            if not d.get('from', '').strip() or not d.get('to', '').strip() or d.get('scale', 0) == 0:
                continue
            from_c = encode_prompt(d['from'], pipe)
            to_c   = encode_prompt(d['to'],   pipe)
            pos_emb, pos_pooled = directional_embedding(
                (pos_emb, pos_pooled), from_c, to_c, float(d['scale'])
            )

        state.start((pos_emb, pos_pooled))

        # Scheduler + latents
        pipe.scheduler.set_timesteps(req.steps, device=pipe.device)
        timesteps = pipe.scheduler.timesteps

        latent_shape = (1, pipe.unet.config.in_channels, req.height // 8, req.width // 8)

        # Resume from a saved latent, or start fresh
        resume_step = req.resume_step
        print(f"[DEBUG] session={req.session_id} resume_step={resume_step} stored_keys={list(_session_latents.get(req.session_id, {}).keys())}")
        if resume_step >= 0:
            saved_latent = _get_latent(req.session_id, resume_step)
            print(f"[DEBUG] latent lookup for step {resume_step}: {'FOUND' if saved_latent is not None else 'MISSING'}")
            if saved_latent is not None:
                latents   = saved_latent.to(pipe.device, dtype=torch.float16)
                timesteps = timesteps[resume_step:]
            else:
                resume_step = -1  # saved latent missing, fall back to fresh
        if resume_step < 0:
            _clear_session_latents(req.session_id)
            latents = torch.randn(latent_shape, device=pipe.device, dtype=torch.float16)
            latents = latents * pipe.scheduler.init_noise_sigma

        add_time_ids = torch.tensor(
            [[req.height, req.width, 0, 0, req.height, req.width]],
            dtype=torch.float16, device=pipe.device,
        )

        # Emit the initial state.
        # For stencil with an existing image, show the original instead of random noise.
        _initial_preview = (
            stencil_image_latent
            if (mode == "stencil" and stencil_image_latent is not None)
            else latents
        )
        asyncio.run_coroutine_threadsafe(
            queue.put(_event({
                "type":    "progress",
                "step":    resume_step if resume_step >= 0 else 0,
                "total":   req.steps,
                "preview": _latents_to_b64(_initial_preview, pipe),
            })), loop
        )

        step_offset = resume_step if resume_step >= 0 else 0

        # Overcoat threshold: steps before this index reset the painted region to noisy
        # original too (paper eq. 4). Steps at/after it let the painted region run free.
        # overcoat=70 → threshold = 0.3 * steps → last 70% of steps are free.
        stencil_threshold = round((1 - req.overcoat / 100) * req.steps) if mode == "stencil" else 0
        if mode == "stencil":
            print(f"[stencil] overcoat={req.overcoat}% → threshold step={stencil_threshold}/{req.steps} "
                  f"(painted region free from step {stencil_threshold} onward)")

        for i, t in enumerate(timesteps):
            abs_step = step_offset + i
            state.current_step = abs_step

            # Stencil: manipulate latent BEFORE the UNet (paper sec 5.3: "before the denoiser")
            # l_{m,k} is what gets passed into the UNet at step k.
            if mode == "stencil" and stencil_image_latent is not None:
                # Euler scheduler uses sigma-space: x_noisy = x_0 + sigma * noise
                # (NOT DDPM alpha-space: sqrt(alpha)*x_0 + sqrt(1-alpha)*noise)
                # sigmas[abs_step] aligns with timesteps[abs_step] for both fresh and resumed runs.
                sigma = pipe.scheduler.sigmas[abs_step].to(pipe.device, dtype=torch.float16)
                noisy_original = stencil_image_latent + sigma * stencil_noise
                if abs_step == 0:
                    print(f"[stencil] sigma at step 0 = {sigma.item():.3f} (should be ~14.6 for SDXL)")

                if abs_step < stencil_threshold:
                    # eq. 4 first branch + eq. 5: entire image = noisy original
                    latents = noisy_original.to(torch.float16)
                    if abs_step == 0:
                        print(f"[stencil] manipulation before UNet — early phase ({stencil_threshold} steps)")
                else:
                    # eq. 4 second branch: painted keeps current latent, unpainted = noisy original
                    latents = (stencil_mask_4d * latents + (1 - stencil_mask_4d) * noisy_original).to(torch.float16)
                    if abs_step == stencil_threshold:
                        print(f"[stencil] free phase started at step {abs_step} — painted region guided by prompt_b")

            # Pick embeddings for this step
            if mode == "stencil":
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

            # Always save latent to CPU so the user can scrub back to any step
            _save_latent(req.session_id, abs_step + 1, latents)

            # Emit preview every single_stroke% of steps (100% = only at the end)
            preview_every = max(1, round(req.steps * req.single_stroke / 100))
            abs_step_done = abs_step + 1
            is_preview_step = abs_step_done % preview_every == 0 or abs_step_done == req.steps
            event_data = {"type": "progress", "step": abs_step_done, "total": req.steps}
            if is_preview_step:
                if mode == "stencil" and stencil_image_latent is not None:
                    if abs_step < stencil_threshold:
                        # Early phase: painted region hasn't formed yet — show original (or blank)
                        preview_latents = stencil_image_latent
                    else:
                        # Free phase: composite painted (current) onto clean original (or blank)
                        preview_latents = (stencil_mask_4d * latents + (1 - stencil_mask_4d) * stencil_image_latent)
                    event_data["preview"] = _latents_to_b64_masked(preview_latents, stencil_mask, req.width, req.height, pipe)
                else:
                    preview_latents = latents
                    event_data["preview"] = _latents_to_b64(preview_latents, pipe)
            asyncio.run_coroutine_threadsafe(queue.put(_event(event_data)), loop)

        # Final stencil compositing: pin unpainted region exactly to the original.
        # The paper (eq. 4-5) applies the mask before each UNet call, but the final
        # scheduler.step() output has no subsequent correction. At the last step
        # sigma ≈ 0 so noisy_original ≈ stencil_image_latent; we use the clean
        # latent directly for pixel-perfect unpainted preservation.
        if mode == "stencil" and stencil_image_latent is not None:
            latents = (stencil_mask_4d * latents + (1 - stencil_mask_4d) * stencil_image_latent).to(torch.float16)

        # Final image — stencil always outputs RGBA with mask so frontend can composite correctly
        if mode == "stencil":
            final = _latents_to_b64_masked(latents, stencil_mask, req.width, req.height, pipe)
        else:
            final = _latents_to_b64(latents, pipe)
        asyncio.run_coroutine_threadsafe(
            queue.put(_event({"type": "result", "image": final})), loop
        )

    except Exception as e:
        print(f"[generation_loop] error: {e}")
        asyncio.run_coroutine_threadsafe(
            queue.put(_event({"type": "error", "message": str(e)})), loop
        )

    finally:
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

    _create_session(req.session_id)

    loop        = asyncio.get_running_loop()
    event_queue = asyncio.Queue()

    # Approximate queue position: jobs ahead + 1 if worker is currently busy
    position = _gpu_queue.qsize() + (1 if _worker_busy else 0)
    if position > 0:
        await event_queue.put(_event({"type": "queued", "position": position + 1}))

    _gpu_queue.put((req, event_queue, loop))

    async def stream():
        while True:
            item = await event_queue.get()
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


@app.post("/encode")
def encode(req: EncodeRequest):
    pipe = get_pipeline()
    seq, pooled = encode_prompt(req.prompt, pipe)
    return {
        "seq":    seq.cpu().tolist(),
        "pooled": pooled.cpu().tolist(),
    }
