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

## 2. GPU Job Queue for Multi-User Access

### What the paper does
The paper describes a single-user interactive tool. There is no discussion of concurrent access or server-side resource management — it was designed as a local desktop application.

### What we do
We implement a serialized GPU job queue using a single background worker thread and a `stdlib_queue.Queue`. When multiple users submit generation requests simultaneously, each request is assigned a queue position and waits its turn. The client receives a `queued` event with their position immediately, then a `started` event when the worker picks up their job. Generation state is isolated per session using the Socket.IO `sid` as a key into a `sessions` dict protected by a `threading.Lock`.

### Why we added it
Deploying as a shared web service means multiple users can submit requests at any time. SDXL requires ~10 GB of VRAM on a single GPU — running two generations simultaneously would either OOM or corrupt both outputs. The queue ensures only one generation runs at a time while giving all waiting users real-time feedback on their position.

### Design decisions
- **Single worker thread**: Simplest correct solution. All GPU operations are synchronous within the worker; no async GPU coordination needed.
- **Per-session isolation**: Each Socket.IO connection gets its own `GenerationState` (cancel flag, current embedding, step counter). Intervention and cancel requests are routed by `session_id` so one user cannot affect another's generation.
- **Approximate position estimate**: Queue position is computed as `_gpu_queue.qsize() + (1 if _worker_busy else 0)`. This is a best-effort estimate — race conditions between checking and enqueuing mean the displayed position may be off by one, but this is acceptable for UX purposes.
- **Worker resilience**: The worker wraps each job in `try/except/finally` so an exception in one generation (e.g., OOM, bad prompt encoding) does not kill the worker thread or block subsequent jobs.

## 3. Post-Hoc Prompt Intervention via Scrubber (replacing live dragging)

### What the paper does
The paper's primary intervention mechanism is **live dragging**: the user watches the noisy diffusion preview evolve in real time and drags the palette cursor to a new position mid-generation. The embedding updates at each step to wherever the cursor is. The paper also briefly mentions the ability to roll back to a specific step in the progress bar and resume from there.

### What we do
We replace live dragging entirely with a **post-hoc scrubber**. Every latent tensor is saved to CPU RAM at each diffusion step. After generation completes, the user can scrub the progress bar to any step, see the decoded preview at that step, reposition the palette cursor, and hit Resume — which continues denoising from the saved latent with the new prompt mix. Because diffusion is Markovian, this is mathematically identical to having intervened live at that step.

### Why this is strictly better
The paper's own user study found that prompt intervention was the hardest feature to use (5 out of 8 participants struggled), specifically because *"it was hard to guess the result only by seeing intermediate generation results (i.e., noisy images during the diffusion process)."* Live dragging forces split-second decisions while watching hard-to-interpret noise.

The scrubber removes this burden entirely: the user sees the actual decoded image at each step before committing to a branch point. The paper explicitly discusses this as a potential improvement in Section 8.3, noting that *"making intermediate results more understandable to natural human users would be an approach to facilitate in-generation interactions."* Our scrubber achieves exactly that — by moving the decision to after generation, the user always has a clear decoded preview to reason from.

### No functionality loss
Since the Markov property guarantees that resuming from a saved latent at step k is identical to having intervened live at step k, no generative capability is lost. Users have full control over where to branch and with what prompt — they simply make that decision with better information.
