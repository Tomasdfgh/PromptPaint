# PromptPaint

PromptPaint is an interactive text-to-image generation tool that lets you steer AI art creation through paint-like interactions. Instead of typing a single prompt and hoping for the best, you can blend multiple prompts together, paint specific regions of the canvas with different concepts, and even branch a generation mid-way to redirect where it is going. The goal is to make working with diffusion models feel more like painting — iterative, spatial, and expressive.

This is an implementation and extension of the research paper by John Joon Young Chung and Eytan Adar, published at UIST 2023.

**Live demo:** https://promptpaint.tom-nguyen.ca
**Demo video:** https://www.youtube.com/watch?v=Ws-_sAdnccU
**Paper:** https://doi.org/10.1145/3586183.3606777

---

## Features

| Feature | Description |
|---|---|
| **Prompt Mixing** | Place multiple prompts on a visual palette and drag a cursor to blend them. The closer the cursor is to a prompt, the more it influences the result. Uses Frechet mean interpolation to keep blends geometrically correct — supports any number of prompts simultaneously. |
| **Directional Prompts** | Shift a concept along a semantic axis without rewriting the base prompt. For example, set a direction from "young" to "old" and dial in how far along that axis the result should land. |
| **Prompt Stencil** | Paint a region on the canvas with a brush, then generate into just that region using whatever is currently on the palette. An overcoat slider controls how strongly the new content departs from what was already there. |
| **Post-hoc Scrubbing** | After a generation completes, scrub back through every saved diffusion step, pick a branch point, update the prompt palette, and resume from there. Equivalent to intervening mid-generation but without any timing pressure. |
| **Layers** | Stack multiple generated images as independent layers with per-layer opacity and visibility controls, similar to a conventional painting application. |
| **Lasso Tool** | Draw a freehand selection around any region of the canvas and erase or move the content inside. |

---

## Extensions Beyond the Original Paper

The original PromptPaint paper used Stable Diffusion v1.5 and supported up to three mixed prompts. This implementation extends it in the following ways:

- **SDXL backbone** — upgraded to Stable Diffusion XL for significantly higher image quality and resolutions up to 1024x1024, with nine supported aspect ratios
- **Arbitrary prompt mixing** — no cap on the number of prompts that can be blended simultaneously
- **Frechet mean interpolation** — replaces linear blending with the Riemannian center of mass on the CLIP embedding sphere, producing more coherent blends especially at higher prompt counts
- **Post-hoc scrubbing** — replaces live intervention (which required precise timing) with a scrub bar over saved intermediate latents
- **Multi-user web deployment** — GPU job queue, per-session isolation, and per-IP rate limiting so the tool is accessible to anyone without local setup

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | React, served by Nginx |
| Backend | Flask + Socket.IO |
| Model service | FastAPI + Diffusers (SDXL) |
| Infrastructure | Docker Compose, self-hosted on dual NVIDIA RTX A4000 GPUs |

---

## Acknowledgements

This project implements the system described in:

> John Joon Young Chung and Eytan Adar. 2023. PromptPaint: Steering Text to Image Generation Through Paint Medium-like Interactions. In *The 36th Annual ACM Symposium on User Interface Software and Technology (UIST'23)*, October 29–November 1, 2023, San Francisco, CA, USA.
