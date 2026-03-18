import { useRef, useEffect, useCallback } from 'react';

const IMAGE_SIZE = 1024; // backend generates at this resolution

/**
 * Canvas component — dual purpose:
 *  1. Displays streamed preview images from the backend
 *  2. In stencil mode: accepts brush strokes that define region B
 *
 * Brush strokes are collected in canvas pixel space and converted to
 * IMAGE_SIZE coordinates before being sent to the backend.
 */
export default function Canvas({ imageB64, stencilMode, brushRadius, onStrokesChange }) {
  const canvasRef    = useRef(null);
  const overlayRef   = useRef(null); // transparent brush stroke layer
  const strokesRef   = useRef([]);   // [{x, y, radius}] in IMAGE_SIZE coords
  const paintingRef  = useRef(false);

  // Draw base image whenever it updates
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !imageB64) return;
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.onload = () => ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    img.src = `data:image/png;base64,${imageB64}`;
  }, [imageB64]);

  // Scale canvas pixel coords → IMAGE_SIZE coords
  const toImageCoords = useCallback((canvas, clientX, clientY) => {
    const rect   = canvas.getBoundingClientRect();
    const scaleX = IMAGE_SIZE / canvas.width;
    const scaleY = IMAGE_SIZE / canvas.height;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top)  * scaleY,
    };
  }, []);

  const paintDot = useCallback((canvas, x, y) => {
    const ctx = canvas.getContext('2d');
    ctx.beginPath();
    ctx.arc(x, y, brushRadius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(124, 106, 247, 0.45)';
    ctx.fill();
  }, [brushRadius]);

  const handleMouseDown = useCallback((e) => {
    if (!stencilMode) return;
    paintingRef.current = true;
    const canvas = overlayRef.current;
    const { x, y } = toImageCoords(canvas, e.clientX, e.clientY);
    // Paint in display coords (scale back down for the overlay canvas)
    const displayX = (x / IMAGE_SIZE) * canvas.width;
    const displayY = (y / IMAGE_SIZE) * canvas.height;
    paintDot(canvas, displayX, displayY);
    strokesRef.current.push({ x, y, radius: brushRadius });
    onStrokesChange([...strokesRef.current]);
  }, [stencilMode, brushRadius, toImageCoords, paintDot, onStrokesChange]);

  const handleMouseMove = useCallback((e) => {
    if (!stencilMode || !paintingRef.current) return;
    const canvas = overlayRef.current;
    const { x, y } = toImageCoords(canvas, e.clientX, e.clientY);
    const displayX = (x / IMAGE_SIZE) * canvas.width;
    const displayY = (y / IMAGE_SIZE) * canvas.height;
    paintDot(canvas, displayX, displayY);
    strokesRef.current.push({ x, y, radius: brushRadius });
    onStrokesChange([...strokesRef.current]);
  }, [stencilMode, brushRadius, toImageCoords, paintDot, onStrokesChange]);

  const handleMouseUp = useCallback(() => {
    paintingRef.current = false;
  }, []);

  const clearStrokes = useCallback(() => {
    const canvas = overlayRef.current;
    if (!canvas) return;
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    strokesRef.current = [];
    onStrokesChange([]);
  }, [onStrokesChange]);

  // Expose clearStrokes via a ref on the DOM element (hacky but simple)
  useEffect(() => {
    if (overlayRef.current) overlayRef.current.clearStrokes = clearStrokes;
  }, [clearStrokes]);

  return (
    <div className="canvas-wrapper">
      {/* Base layer: generated image */}
      <canvas
        ref={canvasRef}
        className="canvas-base"
        width={768}
        height={768}
      />

      {/* Overlay layer: brush strokes (only interactive in stencil mode) */}
      <canvas
        ref={overlayRef}
        className={`canvas-overlay ${stencilMode ? 'active' : ''}`}
        width={768}
        height={768}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      />

      {!imageB64 && (
        <div className="canvas-empty">
          <p>Canvas</p>
          <p className="canvas-sub">Generated image will appear here</p>
        </div>
      )}

      {stencilMode && (
        <div className="stencil-toolbar">
          <button className="btn-small" onClick={clearStrokes}>Clear mask</button>
          <span className="stencil-hint">Paint region B on the canvas</span>
        </div>
      )}
    </div>
  );
}
