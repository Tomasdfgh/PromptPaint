import torch
import numpy as np
from PIL import Image, ImageDraw


def mask_from_brush_strokes(strokes: list[dict], width: int = 1024, height: int = 1024) -> torch.Tensor:
    """
    Convert brush stroke dicts from the frontend into a latent-space float mask.
    Each stroke: { "x": float, "y": float, "radius": float } in pixel coords.

    Returns [H_lat, W_lat] float tensor (values 0.0 or 1.0).
    """
    lat_w = width  // 8
    lat_h = height // 8

    mask_img = Image.new("L", (width, height), 0)
    draw     = ImageDraw.Draw(mask_img)

    for s in strokes:
        x, y, r = s["x"], s["y"], s["radius"]
        draw.ellipse([x - r, y - r, x + r, y + r], fill=255)

    mask_img = mask_img.resize((lat_w, lat_h), Image.NEAREST)
    return torch.from_numpy(
        np.array(mask_img).astype(float) / 255.0
    ).float()
