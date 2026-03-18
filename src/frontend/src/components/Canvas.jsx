import { useRef, useEffect, useCallback, useState } from 'react';
import { promptpaintLogoDataUri } from '../assets/promptpaintLogo';

const IMAGE_SIZE = 1024;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 5;

export default function Canvas({ imageB64, stencilMode, brushRadius, onStrokesChange }) {
  const canvasRef   = useRef(null);
  const overlayRef  = useRef(null);
  const strokesRef  = useRef([]);
  const paintingRef = useRef(false);
  const panStartRef = useRef(null); // { mouseX, mouseY, panX, panY }

  const [zoom, setZoom]   = useState(1);
  const [pan,  setPan]    = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);

  // Draw base image whenever it updates; clear canvas when image is gone
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!imageB64) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }
    const img = new Image();
    img.onload = () => ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    img.src = `data:image/png;base64,${imageB64}`;
  }, [imageB64]);

  // Scroll to zoom, centered on cursor
  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const wrapper = e.currentTarget;
    const rect    = wrapper.getBoundingClientRect();

    // Mouse position relative to wrapper center
    const mouseX = e.clientX - rect.left - rect.width  / 2;
    const mouseY = e.clientY - rect.top  - rect.height / 2;

    const delta   = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom(prev => {
      const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, prev * delta));
      // Adjust pan so zoom is centered on cursor
      setPan(p => ({
        x: mouseX - (mouseX - p.x) * (next / prev),
        y: mouseY - (mouseY - p.y) * (next / prev),
      }));
      return next;
    });
  }, []);

  // Middle-mouse or space+drag to pan
  const handlePanStart = useCallback((e) => {
    if (e.button === 1 || (e.button === 0 && !stencilMode)) {
      e.preventDefault();
      setIsPanning(true);
      panStartRef.current = { mouseX: e.clientX, mouseY: e.clientY, panX: pan.x, panY: pan.y };
    }
  }, [stencilMode, pan]);

  const handlePanMove = useCallback((e) => {
    if (!isPanning || !panStartRef.current) return;
    const dx = e.clientX - panStartRef.current.mouseX;
    const dy = e.clientY - panStartRef.current.mouseY;
    setPan({ x: panStartRef.current.panX + dx, y: panStartRef.current.panY + dy });
  }, [isPanning]);

  const handlePanEnd = useCallback(() => {
    setIsPanning(false);
    panStartRef.current = null;
  }, []);

  const resetView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  // Stencil painting
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
    if (e.button !== 0) return;
    paintingRef.current = true;
    const canvas = overlayRef.current;
    const { x, y } = toImageCoords(canvas, e.clientX, e.clientY);
    const displayX = (x / IMAGE_SIZE) * canvas.width;
    const displayY = (y / IMAGE_SIZE) * canvas.height;
    paintDot(canvas, displayX, displayY);
    strokesRef.current.push({ x, y, radius: brushRadius });
    onStrokesChange([...strokesRef.current]);
  }, [stencilMode, brushRadius, toImageCoords, paintDot, onStrokesChange]);

  const handleMouseMove = useCallback((e) => {
    if (isPanning) { handlePanMove(e); return; }
    if (!stencilMode || !paintingRef.current) return;
    const canvas = overlayRef.current;
    const { x, y } = toImageCoords(canvas, e.clientX, e.clientY);
    const displayX = (x / IMAGE_SIZE) * canvas.width;
    const displayY = (y / IMAGE_SIZE) * canvas.height;
    paintDot(canvas, displayX, displayY);
    strokesRef.current.push({ x, y, radius: brushRadius });
    onStrokesChange([...strokesRef.current]);
  }, [stencilMode, brushRadius, toImageCoords, paintDot, onStrokesChange, isPanning, handlePanMove]);

  const handleMouseUp = useCallback(() => {
    paintingRef.current = false;
    handlePanEnd();
  }, [handlePanEnd]);

  const clearStrokes = useCallback(() => {
    const canvas = overlayRef.current;
    if (!canvas) return;
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    strokesRef.current = [];
    onStrokesChange([]);
  }, [onStrokesChange]);

  const transform = `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`;

  return (
    <div
      className="canvas-outer"
      onWheel={handleWheel}
      onMouseDown={handlePanStart}
      onMouseMove={handlePanMove}
      onMouseUp={handlePanEnd}
      onMouseLeave={handlePanEnd}
    >
      <div className="canvas-wrapper" style={{ transform }}>
        <canvas ref={canvasRef} className="canvas-base" width={768} height={768} />

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
            <div className="canvas-empty-center">
              <img src={promptpaintLogoDataUri} alt="PromptPaint" className="canvas-logo" />
              <p className="canvas-welcome">Welcome to PromptPaint</p>
            </div>
            <div className="canvas-hint">
              <span className="canvas-hint-title">Your Canvas</span>
              <span className="canvas-hint-sub">Generated image will appear here</span>
            </div>
          </div>
        )}

        {stencilMode && (
          <div className="stencil-toolbar">
            <button className="btn-small" onClick={clearStrokes}>Clear mask</button>
            <span className="stencil-hint">Paint region B on the canvas</span>
          </div>
        )}
      </div>

      {/* Zoom controls */}
      <div className="zoom-controls">
        <button className="btn-small" onClick={() => setZoom(z => Math.min(MAX_ZOOM, z * 1.2))}>+</button>
        <span className="zoom-label">{Math.round(zoom * 100)}%</span>
        <button className="btn-small" onClick={() => setZoom(z => Math.max(MIN_ZOOM, z * 0.8))}>−</button>
        <button className="btn-small" onClick={resetView}>Reset</button>
      </div>
    </div>
  );
}
