"""
Prompt Stencil — apply different prompt embeddings to different spatial
regions by hooking into the UNet's cross-attention layers.

The SDXL latent is 128×128 for a 1024×1024 image (8× spatial downsampling).
Inside the UNet, cross-attention operates at multiple resolutions.
We inject a custom AttentionProcessor that masks the key/value projections
so each spatial position attends to the embedding for its region.
"""

import torch
import torch.nn.functional as F
from diffusers.models.attention_processor import Attention


class StencilAttentionProcessor:
    """
    Custom cross-attention processor that blends two sets of prompt embeddings
    based on a spatial mask.

    The mask is a 2D binary tensor at latent resolution (H_lat × W_lat).
    Positions where mask=1 attend to emb_b; positions where mask=0 attend to emb_a.
    """

    def __init__(self, mask: torch.Tensor):
        """
        Args:
            mask: float tensor of shape [H_lat, W_lat] with values in [0, 1].
                  Typically binary (0 or 1) but soft masks also work.
        """
        self.mask = mask  # stored on CPU; moved to device in __call__

    def __call__(
        self,
        attn: Attention,
        hidden_states: torch.Tensor,
        encoder_hidden_states: torch.Tensor | None = None,
        attention_mask: torch.Tensor | None = None,
        **kwargs,
    ) -> torch.Tensor:
        # encoder_hidden_states is a tuple (emb_a, emb_b) when stencil is active,
        # a plain tensor otherwise (fall back to normal attention).
        if not isinstance(encoder_hidden_states, tuple):
            return self._standard_attention(
                attn, hidden_states, encoder_hidden_states, attention_mask
            )

        emb_a, emb_b = encoder_hidden_states
        batch_size, seq_len, _ = hidden_states.shape
        device = hidden_states.device

        query = attn.to_q(hidden_states)

        # Compute attention output for region A
        out_a = self._region_attention(attn, query, emb_a, attention_mask)
        # Compute attention output for region B
        out_b = self._region_attention(attn, query, emb_b, attention_mask)

        # Build spatial mask at the resolution of this attention layer.
        # seq_len here is the flattened spatial dimension (H_lat * W_lat at
        # this UNet depth); we resize the user mask to match.
        spatial_size = int(seq_len ** 0.5)
        mask_resized = F.interpolate(
            self.mask.unsqueeze(0).unsqueeze(0).to(device),  # [1,1,H,W]
            size=(spatial_size, spatial_size),
            mode="nearest",
        ).view(1, seq_len, 1)  # [1, seq, 1]

        # Blend outputs
        out = (1 - mask_resized) * out_a + mask_resized * out_b

        # Final linear projection
        out = attn.to_out[0](out)
        out = attn.to_out[1](out)
        return out

    def _region_attention(
        self,
        attn: Attention,
        query: torch.Tensor,
        encoder_hidden_states: torch.Tensor,
        attention_mask: torch.Tensor | None,
    ) -> torch.Tensor:
        key   = attn.to_k(encoder_hidden_states)
        value = attn.to_v(encoder_hidden_states)

        query = attn.head_to_batch_dim(query)
        key   = attn.head_to_batch_dim(key)
        value = attn.head_to_batch_dim(value)

        scores = attn.get_attention_scores(query, key, attention_mask)
        return attn.batch_to_head_dim(torch.bmm(scores, value))

    def _standard_attention(
        self,
        attn: Attention,
        hidden_states: torch.Tensor,
        encoder_hidden_states: torch.Tensor | None,
        attention_mask: torch.Tensor | None,
    ) -> torch.Tensor:
        if encoder_hidden_states is None:
            encoder_hidden_states = hidden_states

        query = attn.to_q(hidden_states)
        key   = attn.to_k(encoder_hidden_states)
        value = attn.to_v(encoder_hidden_states)

        query = attn.head_to_batch_dim(query)
        key   = attn.head_to_batch_dim(key)
        value = attn.head_to_batch_dim(value)

        scores = attn.get_attention_scores(query, key, attention_mask)
        out    = attn.batch_to_head_dim(torch.bmm(scores, value))

        out = attn.to_out[0](out)
        out = attn.to_out[1](out)
        return out


def apply_stencil(unet, mask: torch.Tensor):
    """
    Inject StencilAttentionProcessor into every cross-attention layer of the UNet.
    Call remove_stencil() when done.

    Args:
        unet: the SDXL UNet model
        mask: [H_lat, W_lat] float tensor, values 0–1
    """
    processor = StencilAttentionProcessor(mask)
    attn_procs = {}
    for name, module in unet.attn_processors.items():
        # Only replace cross-attention (attn2), leave self-attention (attn1) alone
        if "attn2" in name:
            attn_procs[name] = processor
        else:
            attn_procs[name] = module
    unet.set_attn_processor(attn_procs)


def remove_stencil(unet):
    """Restore default attention processors."""
    from diffusers.models.attention_processor import AttnProcessor2_0
    unet.set_attn_processor(AttnProcessor2_0())


def mask_from_brush_strokes(strokes: list[dict], image_size: int = 1024) -> torch.Tensor:
    """
    Convert a list of brush stroke dicts from the frontend into a latent-space mask.
    Each stroke: { "x": float, "y": float, "radius": float } — all in pixel coords.

    Returns a [H_lat, W_lat] float tensor (0.0 or 1.0).
    """
    import numpy as np
    from PIL import Image, ImageDraw

    lat_size = image_size // 8  # 128 for 1024×1024

    mask_img = Image.new("L", (image_size, image_size), 0)
    draw = ImageDraw.Draw(mask_img)

    for stroke in strokes:
        x, y, r = stroke["x"], stroke["y"], stroke["radius"]
        draw.ellipse([x - r, y - r, x + r, y + r], fill=255)

    mask_img = mask_img.resize((lat_size, lat_size), Image.NEAREST)
    mask_np  = np.array(mask_img).astype(float) / 255.0
    return torch.from_numpy(mask_np).float()
