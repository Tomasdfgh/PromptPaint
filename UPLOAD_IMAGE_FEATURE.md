# Upload Image to Canvas — Feature Design

## What It Is

Allow users to upload their own image from their device and place it onto the active canvas layer. From there, they use the existing stencil + overcoat workflow to paint over regions of the image with AI generation — exactly as they would with a generated image.

## Why It's Option 1 (Simple)

There are two possible approaches:

1. **Upload as base layer** — image lands on canvas, user paints over it with stencil. Almost entirely free given existing infrastructure.
2. **Image-to-image (img2img)** — the uploaded image influences the entire generation via a separate SDXL img2img pipeline. More model-side work.

**We are implementing Option 1.** Option 2 was discussed and understood, but Option 1 gives ~90% of the value at ~10% of the effort because stencil + overcoat already does img2img region-by-region.

## How Stencil + Overcoat Already Handles This

When the canvas has an existing image and the user runs stencil generation:
- The model encodes the existing canvas image into latent space
- The overcoat slider controls how much noise is added before denoising
- Low overcoat = stays close to original image
- High overcoat = more creative freedom

So once the uploaded image is on the canvas, the user already has all the tools they need to paint over it.

## What Needs to Be Built

### 1. File Input (hidden)
A hidden `<input type="file" accept="image/*" />` triggered by the upload button click. No visible file input element.

### 2. Image Resizing
When the user picks a file:
- Read it with `FileReader` as a data URL
- Draw it onto an offscreen canvas at the current canvas dimensions (`params.width` × `params.height`)
- Export as base64 PNG

This is important — the uploaded image must match the canvas dimensions exactly, otherwise the model will receive mismatched sizes.

### 3. Load into Active Layer
Call `onLayerUpdate(activeLayerId, b64)` with the resized base64 image — same call used when generated images land on a layer. No new infrastructure needed.

## Where the Upload Button Lives

In `Canvas.jsx`, inside `.canvas-mode-toolbar`, next to the download (Save as PNG) button. Already added as a placeholder:

```jsx
<button className="canvas-mode-btn" title="Upload image to canvas" onClick={() => {}}>
  <svg ...> {/* upload arrow icon */} </svg>
  <span>IMG</span>
</button>
```

The button has the same `canvas-mode-btn` style as the other toolbar buttons. The icon is the mirror of the download icon (arrow pointing up into a tray). "IMG" label sits below the icon inside the button.

## Props Needed

The upload button is inside `Canvas.jsx` but needs to call `onLayerUpdate` and know the active layer ID and canvas dimensions. These are already available:
- `onLayerUpdate` — already a prop on Canvas
- `activeLayerId` — already a prop on Canvas
- `width`, `height` — already props on Canvas

So no new props are needed. The entire implementation lives inside Canvas.jsx.

## Implementation Plan

1. Add a `useRef` for the hidden file input: `const fileInputRef = useRef(null)`
2. Render `<input type="file" accept="image/*" ref={fileInputRef} style={{ display: 'none' }} onChange={handleImageUpload} />`
3. Wire the upload button `onClick` to `fileInputRef.current.click()`
4. Implement `handleImageUpload`:
   ```
   - Read file as data URL via FileReader
   - On load: create offscreen canvas at width × height
   - Draw image onto it (this handles resize automatically)
   - Export as base64 via toDataURL('image/png').split(',')[1]
   - Call onLayerUpdate(activeLayerId, b64)
   ```

## Open Questions / Decisions Made

- **Resize behavior**: stretch to fill canvas dimensions (not letterbox). Simple and consistent with how generated images fill the canvas.
- **Which layer**: always loads into the active layer, same as generation results.
- **No confirmation dialog**: just loads immediately on file pick.
- **File types**: `accept="image/*"` — browser handles format support.
