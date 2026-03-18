"""
Model loading and GPU management.
Loads SDXL once at startup and exposes a single global pipeline instance.
"""

import torch
from diffusers import StableDiffusionXLPipeline, EulerDiscreteScheduler

_pipeline = None
DEVICE = "cuda:0"
MODEL_ID = "stabilityai/stable-diffusion-xl-base-1.0"


def load_pipeline() -> StableDiffusionXLPipeline:
    """
    Load SDXL onto cuda:0 in float16. Called once at app startup.
    Takes ~20-30s on first run (downloads weights if not cached).
    Subsequent runs load from ~/.cache/huggingface/hub.
    """
    global _pipeline

    if _pipeline is not None:
        return _pipeline

    print(f"[pipeline] Loading {MODEL_ID} onto {DEVICE} ...")

    scheduler = EulerDiscreteScheduler.from_pretrained(
        MODEL_ID,
        subfolder="scheduler",
    )

    pipe = StableDiffusionXLPipeline.from_pretrained(
        MODEL_ID,
        scheduler=scheduler,
        torch_dtype=torch.float16,
        variant="fp16",
        use_safetensors=True,
    ).to(DEVICE)

    # Memory optimizations
    pipe.enable_attention_slicing()

    # SDXL VAE is numerically unstable in float16 — keep in float32
    pipe.vae = pipe.vae.to(torch.float32)

    # Keep text encoders on GPU for fast repeated encoding
    pipe.text_encoder   = pipe.text_encoder.to(DEVICE)
    pipe.text_encoder_2 = pipe.text_encoder_2.to(DEVICE)

    _pipeline = pipe
    print("[pipeline] Ready.")
    return _pipeline


def get_pipeline() -> StableDiffusionXLPipeline:
    if _pipeline is None:
        raise RuntimeError("Pipeline not loaded. Call load_pipeline() at startup.")
    return _pipeline
