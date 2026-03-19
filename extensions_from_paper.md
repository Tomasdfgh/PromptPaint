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
