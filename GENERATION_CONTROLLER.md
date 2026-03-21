# Generation Controller & Prompt Intervention
## Theory, System Design, and Implementation

---

## 1. Background: How Diffusion Generation Works

Stable Diffusion XL (and latent diffusion models generally) generate images through an iterative denoising process. Starting from a tensor of pure Gaussian noise, the model runs a fixed number of denoising steps — each step predicts and removes a small amount of noise, guided by a text embedding. After all steps complete, the final latent is decoded by the VAE into a pixel image.

The key property of this process is that it is **Markovian**: each denoising step depends only on the current latent tensor `x_t` and the current timestep `t`. It has no memory of how it got to `x_t`. Formally:

```
x_{t-1} = denoise(x_t, t, embedding)
```

This Markov property is the mathematical foundation for everything described in this document.

---

## 2. Prompt Intervention: Theory

### 2.1 What Early and Late Steps Do

The denoising schedule is not uniform in what it accomplishes. Early steps (high noise levels) establish the **global structure** of the image — composition, approximate colors, the overall form of objects. Late steps (low noise levels) refine **fine details** — textures, surface qualities, edges, and specific visual characteristics.

This means the prompt used at early steps has an outsized influence on *what the image is*, while the prompt used at late steps determines *what it looks like in detail*. This asymmetry is what makes prompt intervention interesting and useful.

### 2.2 The Original Paper's Design (Chung & Adar, UIST 2023)

The paper's intervention model is **reactive and live**, not pre-planned. The core workflow is:

1. The user starts generation with a prompt
2. Live noisy previews are shown at each step via the progress controller
3. The user **watches** the generation evolve in real time
4. At any moment, the user makes a judgment call — "the form is established, now I want to change direction" — and **intervenes immediately**
5. The model continues from that step with the new embedding

This is directly analogous to how a painter works: you don't plan every brushstroke in advance. You lay down some paint, assess the state of the canvas, and decide what to do next based on what you see.

The paper also visualizes the **history of palette cursor positions** as a trail of dots on the palette interface — one dot per step of the generation. This allows users to see what prompt mix was active at each step of the generation, supporting understanding and iteration.

### 2.3 Intervention as Palette Cursor Movement

In the paper's fullest conception, intervention is not a binary "swap prompt at step X" operation. It is **continuous cursor movement on the palette**. As the generation runs, the user can drag the palette cursor to different positions — each position representing a different prompt mix — and the guiding embedding updates at each step to match wherever the cursor is.

This means a single generation can smoothly transition through multiple prompts, weighted differently at different steps. The trail of dots on the palette represents this path through semantic space over the course of the generation.

### 2.4 Why This is More Powerful Than a Pre-Set Switch

A pre-planned intervention (e.g., "switch from prompt A to prompt B at step 15") forces the user to predict in advance when to switch. This is hard because the intermediate noisy previews are difficult to interpret — they do not look like the final image until quite late in the process.

Reactive intervention — watching and responding in real time — removes this burden. The user only needs to make a decision when they can *see* something worth reacting to.

---

## 3. The Progress Controller

### 3.1 Concept

The progress controller is the generation scrubber bar at the bottom of the sidebar. It serves two purposes:

1. **During generation**: shows live progress (step N of M) with a filling bar
2. **After generation**: becomes an interactive scrubber that lets the user navigate to any previously generated step, view its preview, and resume generation from that point with a new prompt mix

The scrubber is the mechanism that makes intervention practical — instead of needing to interact during the live generation, the user can let generation complete, then scrub back to any step they liked, change their palette selection, and resume. The result is the same: the image inherits its structure from the steps before the resume point, and its details from the new prompt used after.

### 3.2 Why This Works (Markov Property Again)

Because diffusion is Markovian, resuming from a saved latent at step `k` with a new prompt is mathematically identical to having intervened at step `k` during the original generation. The model does not know or care how the latent at step `k` was produced — it simply continues denoising from that state.

This means the scrubber is not a simulation of intervention. It *is* intervention, just post-hoc rather than live.

### 3.3 Queue Implications

The application uses a single GPU worker queue — only one generation runs at a time, all other requests wait. This actually simplifies the latent storage problem considerably:

- There is only ever **one active generation** on the GPU
- Latents can be stored in CPU RAM (not VRAM), so they do not compete with the model's memory footprint
- Because requests are serialized, there is no multi-user contention on the latent store
- When the user scrubs back and hits Paint, their resume request enters the queue just like any other generation — it just carries a saved latent instead of starting from noise

Scrubbing itself (navigating the bar, viewing past previews) is **entirely client-side** and does not touch the queue at all.

---

## 4. System Design

### 4.1 Data Flow Overview

```
Generation:
  Frontend → [socket: generate + resume_step] → Backend → [HTTP POST] → Model
  Model → [NDJSON stream: progress events + previews] → Backend → [socket] → Frontend

Scrubbing (client-side only):
  User clicks scrub bar → Frontend sets resumeStep + displays saved preview
  No network traffic until user hits Paint

Resume:
  Frontend → [socket: generate + resume_step=k] → Backend → Model
  Model loads CPU latent at step k, slices timesteps[k:], continues generation
```

### 4.2 Latent Storage

Latents are stored in a module-level dictionary in the model service:

```python
_session_latents: dict[str, dict[int, torch.Tensor]]
# keyed by session_id → step → CPU tensor
```

- Tensors are moved to CPU immediately after each denoising step (`.cpu()`)
- Storage is per-session, keyed by the Socket.IO session ID passed from the Flask backend
- A fresh generation (no `resume_step`) clears all saved latents for that session before starting
- A resumed generation preserves latents up to the resume step and overwrites from that point forward
- Latents persist indefinitely after generation completes — they are only cleared when the next fresh generation starts for that session

**Memory footprint**: Each latent is shape `[1, 4, H//8, W//8]` in float16. For a 1344×768 image, that is `1 × 4 × 96 × 168 × 2 bytes ≈ 0.13 MB` per step. For 20 steps, that is ~2.6 MB per session — negligible.

### 4.3 Resume Logic

The model service accepts a `resume_step: int = -1` field on the generate request. The generation loop handles it as follows:

```python
pipe.scheduler.set_timesteps(req.steps, device=pipe.device)
timesteps = pipe.scheduler.timesteps  # [T_0, T_1, ..., T_{n-1}]

if resume_step >= 0:
    latents = _get_latent(session_id, resume_step).to(device)
    timesteps = timesteps[resume_step:]   # skip already-completed steps
    step_offset = resume_step
else:
    latents = torch.randn(...) * scheduler.init_noise_sigma
    _clear_session_latents(session_id)
    step_offset = 0
```

The `step_offset` is added to loop index `i` everywhere progress events are emitted, so the frontend always sees absolute step numbers (e.g., steps 11–20 when resuming from step 10), keeping the scrub bar consistent.

### 4.4 Preview Storage (Frontend)

The frontend accumulates a `stepPreviews` map as generation runs:

```javascript
// In the 'progress' socket handler:
setStepPreviews(prev => ({ ...prev, [data.step]: data.preview }))

// In the 'result' socket handler:
setStepPreviews(prev => ({ ...prev, [totalStepsRef.current]: data.image }))
```

Only steps that include a `preview` field (controlled by the `single_stroke` parameter) are stored. The `single_stroke` parameter controls how frequently intermediate previews are decoded — at 20% (default), previews are emitted every 4 steps for a 20-step generation.

On resume, previews after the resume step are cleared (they are now stale):

```javascript
setStepPreviews(prev =>
  Object.fromEntries(Object.entries(prev).filter(([k]) => Number(k) <= resumeStep))
)
```

### 4.5 Scrub Bar Component

The `ScrubBar` component renders inside the sidebar's status bar area. It:

- Shows a standard progress fill during active generation
- After generation, switches to an interactive scrub mode (`scrub-bar` CSS class)
- Renders tick marks (`scrub-tick`) at every step that has a saved preview
- Renders a cursor dot (`scrub-cursor`) at the currently selected resume step
- On click, maps the click position (as a fraction of bar width) to the nearest step with a preview

```javascript
const handleClick = (e) => {
  const pct    = (e.clientX - rect.left) / rect.width;
  const target = Math.round(pct * totalSteps);
  const nearest = previewSteps.reduce((a, b) =>
    Math.abs(b - target) < Math.abs(a - target) ? b : a
  );
  onScrub(nearest);
};
```

The "snap to nearest preview step" behavior means the user never selects a step without a saved latent, even if they click between tick marks.

---

## 5. Implementation Details

### 5.1 Files Changed

| File | Changes |
|------|---------|
| `src/model/main.py` | Added `_session_latents` store + helpers; added `resume_step` to `GenerateRequest`; modified `_generation_loop` to save latents at every step, handle resume, and track `step_offset` |
| `src/backend/app.py` | Removed `cancel` socket handler |
| `src/frontend/src/App.jsx` | Added `stepPreviews`, `resumeStep`, `scrubImage` state; added `totalStepsRef`; updated progress/result socket handlers; updated `handleGenerate` to send `resume_step` and manage preview state; added `handleScrub` / `handleUnscrub` callbacks; passed new props to Sidebar; Canvas uses `scrubImage ?? imageB64` |
| `src/frontend/src/components/Sidebar.jsx` | Added `ScrubBar` component; updated status bar to show scrubber when previews exist; updated Paint button label to show "Resume from step N"; added unscrub `✕` button |
| `src/frontend/src/App.css` | Added `.scrub-bar`, `.scrub-tick`, `.scrub-tick-active`, `.scrub-cursor` styles |

### 5.2 Removal of Cancel

The cancel button and all related code was removed. The rationale:

- The queue serializes all requests, so a user's generation will complete before any other user's starts
- The scrubber makes cancel redundant: if you don't like where a generation is going, let it finish (or wait it out), scrub back to a point you liked, and resume from there
- Removing cancel simplifies the `GenerationState` class (no `cancel_flag`) and removes a code path that complicated the generation loop

### 5.3 Intervention Panel

The intervention panel (separate mode with "starting prompt", "intervention prompt", and "auto-switch at step" slider) still exists in the codebase but is now conceptually superseded by the scrubber. The natural workflow is:

1. Generate with a prompt
2. Scrub back to the step where the form looks right
3. Change palette selection to the new desired mix
4. Hit "Resume from step N"

This achieves exactly what prompt intervention achieves, but with full visibility (you can see the saved preview at each step) and no need to guess the right switch step in advance.

---

## 6. Design Trade-offs and Considerations

### 6.1 Preview Density vs. Speed

More frequent previews (lower `single_stroke` value) give the user more scrub points but require more VAE decode operations during generation. The VAE decode is the most expensive non-UNet operation. At `single_stroke = 20%` (default), previews are decoded every 4 steps — a reasonable balance.

Latents are always saved at every step regardless of `single_stroke`, so the model always has the correct state to resume from even if the user can only scrub to preview steps.

### 6.2 Stale Previews After Resume

When resuming from step `k`, previews for steps `k+1` through `n` from the previous run are cleared from `stepPreviews` immediately. This prevents the user from seeing stale previews from the old generation branch. The new generation overwrites previews from `k` onward as it runs.

### 6.3 Session Latent Lifetime

Latents persist until the next fresh generation for that session. This means a user can generate, close the tab, reconnect with the same Socket.IO session ID, and (in theory) resume — though in practice Socket.IO session IDs change on reconnect, so this is a fresh session. The effective lifetime is the duration of a single browser session.

### 6.4 No Branching History

The current implementation supports a single linear history: one set of latents per session, overwritten on each fresh generation. There is no tree of branches (generate, branch at step 10 in two directions, compare). This is a deliberate simplicity choice — branching history would require significantly more storage and a more complex UI.

---

## 7. Summary

The generation controller transforms the diffusion process from a black-box "prompt in, image out" operation into an interactive, iterative medium. By exploiting the Markov property of diffusion — the fact that any step only needs the current latent, not the full history — the system allows users to navigate the generation timeline, select a moment they find interesting, and branch the generation from that point with a new prompt. This is the computational equivalent of the painter's core loop: apply paint, assess, decide, apply more paint.
