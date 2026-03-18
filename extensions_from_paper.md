# Extensions from the Paper

## 1. Prompt Mixing: Normalized Lerp (Nlerp) vs Lerp + N-Prompt Support

### What the paper does
The original PromptPaint paper interpolates prompt embeddings using a weighted linear interpolation (lerp):

```
v_pm = Σ w_pi * v_pi
```

This is a simple weighted average — a straight line between two points in embedding space. The paper supports mixing up to three prompts.

### What we do
We use normalized lerp (nlerp) — a weighted sum that is then projected back onto the hypersphere by normalizing to unit length and restoring the average input magnitude:

```
mixed = Σ w_i * v_i
result = normalize(mixed) * avg_norm(v_i)
```

This generalizes cleanly to any number of prompts (2, 3, or more), with weights automatically normalized to sum to 1.

### Why we changed it
CLIP embeddings live on a hypersphere — all meaningful embeddings have roughly the same magnitude. Plain lerp cuts through the interior of that sphere, producing a midpoint with smaller magnitude than the inputs. This midpoint is out-of-distribution: the model was never trained on embeddings of that reduced magnitude, causing it to snap to whichever prompt's territory it falls closest to rather than producing a genuine blend.

Nlerp corrects this by projecting the result back onto the sphere after the weighted sum, preserving magnitude and keeping the embedding in-distribution for the model.

### Why this matters more for us than for the paper
The paper used SD v1.5 with 768-dimensional CLIP embeddings. We use SDXL with 2048-dimensional embeddings (CLIP-L + CLIP-G concatenated). The magnitude shrinkage from plain lerp grows worse as dimensionality increases — the interior of a high-dimensional sphere is proportionally more "empty." Lerp partially worked at 768 dimensions but breaks more noticeably at 2048, making nlerp a necessary improvement for SDXL-based mixing.

### Additional extension: N-prompt mixing
The paper caps mixing at three prompts. Our implementation supports any number of prompts — each with an independently configurable weight — using the same nlerp formulation, which is order-independent unlike iterative pairwise slerp.
