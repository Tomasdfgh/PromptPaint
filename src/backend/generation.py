"""
Diffusion generation loop.

Runs in a background thread so Socket.IO can emit progress updates
and accept mid-generation intervention events without blocking.

Supported modes (set via the 'mode' field in the generate event payload):
  - "standard"    : single prompt, normal generation
  - "mixing"      : interpolate between prompt_a and prompt_b at a given alpha
  - "directional" : shift base prompt along (to_concept - from_concept)
  - "stencil"     : different prompts for masked vs unmasked regions
  - "intervention": start with prompt_a, switch to prompt_b at intervention_step
"""

import base64
import io
import threading
import torch
import numpy as np
from PIL import Image

from pipeline import get_pipeline
from features.embedding import encode_prompt, mix_embeddings, directional_embedding
from features.stencil import apply_stencil, remove_stencil, mask_from_brush_strokes


# ---------------------------------------------------------------------------
# Shared mutable state for a running generation
# ---------------------------------------------------------------------------

class GenerationState:
    def __init__(self):
        self.lock         = threading.Lock()
        self.running      = False
        self.cancel_flag  = False
        # For intervention: frontend can update this mid-loop
        self.current_emb  = None   # (seq, pooled) tuple
        self.current_step = 0
        self.total_steps  = 0

    def request_cancel(self):
        with self.lock:
            self.cancel_flag = True

    def is_cancelled(self):
        with self.lock:
            return self.cancel_flag

    def set_embedding(self, emb):
        with self.lock:
            self.current_emb = emb

    def get_embedding(self):
        with self.lock:
            return self.current_emb

    def reset(self):
        with self.lock:
            self.running     = False
            self.cancel_flag = False
            self.current_emb = None
            self.current_step = 0
            self.total_steps  = 0


# One global state object — single generation at a time
generation_state = GenerationState()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _tensor_to_b64(latents, pipeline) -> str:
    """Decode a latent tensor to a base64 PNG string for socket emission."""
    with torch.no_grad():
        image_tensor = pipeline.vae.decode(
            latents / pipeline.vae.config.scaling_factor,
            return_dict=False,
        )[0]

    image_tensor = (image_tensor / 2 + 0.5).clamp(0, 1)
    image_np = image_tensor.squeeze(0).permute(1, 2, 0).float().cpu().numpy()
    image_np = (image_np * 255).round().astype(np.uint8)

    pil_image = Image.fromarray(image_np)
    buffer = io.BytesIO()
    pil_image.save(buffer, format="PNG")
    return base64.b64encode(buffer.getvalue()).decode("utf-8")


def _prepare_embeddings(data: dict, pipeline) -> tuple:
    """
    Parse the socket payload and return (prompt_embeds, pooled_prompt_embeds)
    ready to feed into the UNet, based on the requested mode.
    """
    mode = data.get("mode", "standard")

    if mode == "standard" or mode == "intervention":
        prompt = data.get("prompt", "")
        return encode_prompt(prompt, pipeline)

    if mode == "mixing":
        emb_a = encode_prompt(data["prompt_a"], pipeline)
        emb_b = encode_prompt(data["prompt_b"], pipeline)
        alpha = float(data.get("alpha", 0.5))
        return mix_embeddings(emb_a, emb_b, alpha)

    if mode == "directional":
        base        = encode_prompt(data["prompt"],       pipeline)
        from_concept = encode_prompt(data["from_concept"], pipeline)
        to_concept   = encode_prompt(data["to_concept"],   pipeline)
        scale        = float(data.get("scale", 1.0))
        return directional_embedding(base, from_concept, to_concept, scale)

    if mode == "stencil":
        # Stencil embeddings are handled separately in the loop
        return None, None

    raise ValueError(f"Unknown mode: {mode}")


# ---------------------------------------------------------------------------
# Main generation loop
# ---------------------------------------------------------------------------

def run_generation(data: dict, socketio, sid: str):
    """
    Entry point called from the Socket.IO event handler (in a background thread).

    Args:
        data:    payload from the frontend generate event
        socketio: the Flask-SocketIO instance (for emitting progress)
        sid:     socket session ID to emit back to the correct client
    """
    pipe = get_pipeline()
    state = generation_state

    if state.running:
        socketio.emit("error", {"message": "Generation already in progress"}, to=sid)
        return

    state.reset()
    state.running = True

    # -- Parameters --
    mode             = data.get("mode", "standard")
    num_steps        = int(data.get("steps", 30))
    guidance_scale   = float(data.get("cfg_scale", 7.5))
    preview_every    = int(data.get("preview_every", 5))
    width            = int(data.get("width", 1024))
    height           = int(data.get("height", 1024))
    intervention_step = int(data.get("intervention_step", num_steps // 2))

    state.total_steps = num_steps

    try:
        # -- Encode negative prompt (used for CFG) --
        negative_prompt = data.get("negative_prompt", "")
        neg_emb, neg_pooled = encode_prompt(negative_prompt, pipe)

        # -- Encode positive prompt(s) --
        if mode == "stencil":
            emb_a, pooled_a = encode_prompt(data.get("prompt_a", ""), pipe)
            emb_b, pooled_b = encode_prompt(data.get("prompt_b", ""), pipe)
            strokes = data.get("strokes", [])
            mask = mask_from_brush_strokes(strokes, image_size=width).to(pipe.device)
            apply_stencil(pipe.unet, mask)
        else:
            prompt_emb, pooled_emb = _prepare_embeddings(data, pipe)
            state.set_embedding((prompt_emb, pooled_emb))

            # For intervention: pre-encode the second prompt too
            if mode == "intervention":
                intervention_prompt = data.get("intervention_prompt", "")
                intervention_emb = encode_prompt(intervention_prompt, pipe)
            else:
                intervention_emb = None

        # -- Set up scheduler --
        pipe.scheduler.set_timesteps(num_steps, device=pipe.device)
        timesteps = pipe.scheduler.timesteps

        # -- Initial latent noise --
        latent_shape = (1, pipe.unet.config.in_channels, height // 8, width // 8)
        latents = torch.randn(latent_shape, device=pipe.device, dtype=torch.float16)
        latents = latents * pipe.scheduler.init_noise_sigma

        # -- SDXL time embedding conditioning --
        add_time_ids = torch.tensor(
            [[height, width, 0, 0, height, width]],
            dtype=torch.float16,
            device=pipe.device,
        )

        socketio.emit("progress", {"step": 0, "total": num_steps, "status": "started"}, to=sid)

        # ----------------------------------------------------------------
        # Diffusion loop
        # ----------------------------------------------------------------
        for i, t in enumerate(timesteps):
            if state.is_cancelled():
                socketio.emit("cancelled", {}, to=sid)
                return

            state.current_step = i

            # -- Select embeddings for this step --
            if mode == "stencil":
                # StencilAttentionProcessor reads from encoder_hidden_states tuple
                prompt_emb  = (emb_a, emb_b)
                pooled_emb  = pooled_a  # SDXL add_text_embeds uses pooled; use region A
            elif mode == "intervention":
                if i >= intervention_step and intervention_emb is not None:
                    # User triggered intervention OR auto-switch at intervention_step
                    live_emb = state.get_embedding()
                    prompt_emb, pooled_emb = live_emb if live_emb else intervention_emb
                else:
                    prompt_emb, pooled_emb = state.get_embedding()
            else:
                # For mixing/directional/standard, check if user updated embedding live
                live_emb = state.get_embedding()
                prompt_emb, pooled_emb = live_emb

            # -- CFG: run UNet twice (conditional + unconditional) --
            latents_input = pipe.scheduler.scale_model_input(
                torch.cat([latents, latents]), t
            )
            emb_input     = torch.cat([neg_emb,    prompt_emb])
            pooled_input  = torch.cat([neg_pooled, pooled_emb])

            added_cond_kwargs = {
                "text_embeds": pooled_input,
                "time_ids":    torch.cat([add_time_ids, add_time_ids]),
            }

            if mode == "stencil":
                # Pass tuple so StencilAttentionProcessor knows to split
                encoder_hidden_states = (
                    torch.cat([neg_emb, emb_a]),  # unconditional + region A
                    torch.cat([neg_emb, emb_b]),  # unconditional + region B  (approx)
                )
            else:
                encoder_hidden_states = emb_input

            with torch.no_grad():
                noise_pred = pipe.unet(
                    latents_input,
                    t,
                    encoder_hidden_states=encoder_hidden_states,
                    added_cond_kwargs=added_cond_kwargs,
                ).sample

            # CFG guidance
            noise_uncond, noise_cond = noise_pred.chunk(2)
            noise_pred = noise_uncond + guidance_scale * (noise_cond - noise_uncond)

            latents = pipe.scheduler.step(noise_pred, t, latents).prev_sample

            # -- Emit progress + optional preview --
            if (i + 1) % preview_every == 0 or i == num_steps - 1:
                preview_b64 = _tensor_to_b64(latents, pipe)
                socketio.emit(
                    "progress",
                    {
                        "step":    i + 1,
                        "total":   num_steps,
                        "preview": preview_b64,
                        "status":  "generating",
                    },
                    to=sid,
                )

        # -- Final decode --
        final_b64 = _tensor_to_b64(latents, pipe)
        socketio.emit("result", {"image": final_b64, "status": "done"}, to=sid)

    except Exception as e:
        socketio.emit("error", {"message": str(e)}, to=sid)
        raise

    finally:
        if mode == "stencil":
            remove_stencil(pipe.unet)
        state.reset()
