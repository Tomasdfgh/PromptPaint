"""
Prompt Stencil — apply different prompt embeddings to different spatial
regions by hooking into the UNet's cross-attention layers.

Fix from v1: the UNet expects encoder_hidden_states to be a plain tensor.
So we can't pass a tuple through it. Instead, StencilAttentionProcessor
holds emb_a and emb_b as attributes and ignores what the UNet passes —
it substitutes its own embeddings based on the spatial mask.
"""

import torch
import torch.nn.functional as F
from diffusers.models.attention_processor import Attention, AttnProcessor2_0


class StencilAttentionProcessor:
    """
    Cross-attention processor that blends two prompt embeddings spatially.

    emb_a is applied where mask == 0 (unpainted region).
    emb_b is applied where mask == 1 (painted region).

    Both embeddings are held as attributes so the UNet can be called normally
    with any encoder_hidden_states — we replace them internally.
    """

    def __init__(self, emb_a: torch.Tensor, emb_b: torch.Tensor, mask: torch.Tensor):
        """
        Args:
            emb_a: [1, 77, 2048] sequence embedding for region A
            emb_b: [1, 77, 2048] sequence embedding for region B
            mask:  [H_lat, W_lat] float tensor, values in [0, 1]
        """
        self.emb_a = emb_a
        self.emb_b = emb_b
        self.mask  = mask

    def __call__(
        self,
        attn: Attention,
        hidden_states: torch.Tensor,
        encoder_hidden_states: torch.Tensor | None = None,
        attention_mask: torch.Tensor | None = None,
        **kwargs,
    ) -> torch.Tensor:
        # Self-attention layers pass encoder_hidden_states=None — leave untouched
        if encoder_hidden_states is None:
            return self._attend(attn, hidden_states, hidden_states, attention_mask)

        device = hidden_states.device
        batch_size, seq_len, _ = hidden_states.shape

        query = attn.to_q(hidden_states)

        out_a = self._attend(attn, hidden_states, self.emb_a.to(device), attention_mask, query=query)
        out_b = self._attend(attn, hidden_states, self.emb_b.to(device), attention_mask, query=query)

        # Resize mask to match the spatial sequence length of this attention layer
        spatial_size = int(seq_len ** 0.5)
        mask_resized = F.interpolate(
            self.mask.unsqueeze(0).unsqueeze(0).to(device),
            size=(spatial_size, spatial_size),
            mode="nearest",
        ).view(1, seq_len, 1)

        out = (1 - mask_resized) * out_a + mask_resized * out_b

        out = attn.to_out[0](out)
        out = attn.to_out[1](out)
        return out

    def _attend(
        self,
        attn: Attention,
        hidden_states: torch.Tensor,
        context: torch.Tensor,
        attention_mask: torch.Tensor | None,
        query: torch.Tensor | None = None,
    ) -> torch.Tensor:
        if query is None:
            query = attn.to_q(hidden_states)
        key   = attn.to_k(context)
        value = attn.to_v(context)

        query = attn.head_to_batch_dim(query)
        key   = attn.head_to_batch_dim(key)
        value = attn.head_to_batch_dim(value)

        scores = attn.get_attention_scores(query, key, attention_mask)
        return attn.batch_to_head_dim(torch.bmm(scores, value))


def apply_stencil(unet, emb_a: torch.Tensor, emb_b: torch.Tensor, mask: torch.Tensor):
    """
    Inject StencilAttentionProcessor into every cross-attention (attn2) layer.
    Self-attention (attn1) layers are left with their default processor.
    """
    processor = StencilAttentionProcessor(emb_a, emb_b, mask)
    procs = {}
    for name in unet.attn_processors:
        if "attn2" in name:
            procs[name] = processor
        else:
            procs[name] = AttnProcessor2_0()
    unet.set_attn_processor(procs)


def remove_stencil(unet):
    """Restore default attention processors."""
    unet.set_attn_processor(AttnProcessor2_0())


def mask_from_brush_strokes(strokes: list[dict], image_size: int = 1024) -> torch.Tensor:
    """
    Convert brush stroke dicts from the frontend into a latent-space float mask.
    Each stroke: { "x": float, "y": float, "radius": float } in pixel coords
    relative to image_size.

    Returns [H_lat, W_lat] float tensor (values 0.0 or 1.0).
    """
    import numpy as np
    from PIL import Image, ImageDraw

    lat_size = image_size // 8  # 128 for 1024×1024

    mask_img = Image.new("L", (image_size, image_size), 0)
    draw     = ImageDraw.Draw(mask_img)

    for s in strokes:
        x, y, r = s["x"], s["y"], s["radius"]
        draw.ellipse([x - r, y - r, x + r, y + r], fill=255)

    mask_img = mask_img.resize((lat_size, lat_size), Image.NEAREST)
    return torch.from_numpy(
        (numpy_img := __import__("numpy").array(mask_img)).astype(float) / 255.0
    ).float()
