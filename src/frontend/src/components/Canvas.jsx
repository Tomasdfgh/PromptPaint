import { useRef, useEffect, useCallback, useState } from 'react';
import { promptpaintLogoDataUri } from '../assets/promptpaintLogo';

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 5;

const ALL_SIZES = [
  { label: '1:1',    w: 1024, h: 1024 },
  { label: '4:3 L',  w: 1152, h: 896  },
  { label: '3:2 L',  w: 1216, h: 832  },
  { label: '16:9 L', w: 1344, h: 768  },
  { label: '21:9 L', w: 1536, h: 640  },
  { label: '4:3 P',  w: 896,  h: 1152 },
  { label: '3:2 P',  w: 832,  h: 1216 },
  { label: '16:9 P', w: 768,  h: 1344 },
  { label: '21:9 P', w: 640,  h: 1536 },
];

const ITEM_H = 20;

function WheelPicker({ selectedIndex, onChange }) {
  const containerRef = useRef(null);
  const lastScrollRef = useRef(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const now = Date.now();
      if (now - lastScrollRef.current < 100) return;
      lastScrollRef.current = now;
      if (e.deltaY > 0) onChange((selectedIndex + 1) % ALL_SIZES.length);
      else              onChange((selectedIndex - 1 + ALL_SIZES.length) % ALL_SIZES.length);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [selectedIndex, onChange]);

  const offset = -selectedIndex * ITEM_H;

  return (
    <div ref={containerRef} className="wheel-picker">
      <div className="wheel-picker-track" style={{ transform: `translateY(${offset}px)` }}>
        {ALL_SIZES.map((s, i) => {
          const dist = Math.abs(i - selectedIndex);
          return (
            <div
              key={i}
              className={`wheel-picker-item${i === selectedIndex ? ' active' : ''}`}
              style={{ opacity: dist === 0 ? 1 : dist === 1 ? 0.35 : 0.1 }}
              onClick={() => onChange(i)}
            >
              {s.label}
            </div>
          );
        })}
      </div>

      <div className="wheel-arrow-track">
        <button
          type="button"
          className="wheel-arrow-btn"
          onClick={() => onChange((selectedIndex - 1 + ALL_SIZES.length) % ALL_SIZES.length)}
          aria-label="Previous size"
        >
          <svg className="wheel-arrow-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M4 9l4-4 4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <button
          type="button"
          className="wheel-arrow-btn"
          onClick={() => onChange((selectedIndex + 1) % ALL_SIZES.length)}
          aria-label="Next size"
        >
          <svg className="wheel-arrow-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M4 7l4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>
    </div>
  );
}

export default function Canvas({ imageB64, stencilMode, generating, brushRadius, onStrokesChange, width = 1024, height = 1024, onSizeChange }) {
  const canvasRef   = useRef(null);
  const overlayRef  = useRef(null);
  const outerRef    = useRef(null);
  const strokesRef  = useRef([]);
  const paintingRef = useRef(false);
  const panStartRef = useRef(null);

  const [zoom, setZoom]   = useState(0.8);
  const [pan,  setPan]    = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [displaySize, setDisplaySize] = useState({ w: width, h: height });

  const selectedIndex = ALL_SIZES.findIndex(s => s.w === width && s.h === height);
  const effectiveIndex = selectedIndex === -1 ? 0 : selectedIndex;

  const handleSizeChange = useCallback((idx) => {
    const s = ALL_SIZES[idx];
    onSizeChange({ width: s.w, height: s.h });
  }, [onSizeChange]);

  // Step through sizes within current orientation (landscape stays landscape, portrait stays portrait)
  const stepOriented = useCallback((dir) => {
    const isPortrait = height > width;
    const oriented = ALL_SIZES.filter(s => isPortrait ? s.h > s.w : s.w >= s.h);
    const curIdx = oriented.findIndex(s => s.w === width && s.h === height);
    const nextIdx = (curIdx + dir + oriented.length) % oriented.length;
    onSizeChange({ width: oriented[nextIdx].w, height: oriented[nextIdx].h });
  }, [width, height, onSizeChange]);

  // Measure container and compute display dimensions
  useEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    const compute = (contW, contH) => {
      const pad = 80;
      const scale = Math.min((contW - pad) / width, (contH - pad) / height);
      setDisplaySize({ w: Math.round(width * scale), h: Math.round(height * scale) });
    };
    const ro = new ResizeObserver(entries => {
      const { width: cw, height: ch } = entries[0].contentRect;
      compute(cw, ch);
    });
    ro.observe(el);
    const rect = el.getBoundingClientRect();
    compute(rect.width, rect.height);
    return () => ro.disconnect();
  }, [width, height]);

  // Reset pan/zoom when size changes
  useEffect(() => {
    setZoom(0.8);
    setPan({ x: 0, y: 0 });
  }, [width, height]);

  // Draw base image
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

  // Scroll to zoom
  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const wrapper = e.currentTarget;
    const rect    = wrapper.getBoundingClientRect();
    const mouseX  = e.clientX - rect.left - rect.width  / 2;
    const mouseY  = e.clientY - rect.top  - rect.height / 2;
    const delta   = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom(prev => {
      const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, prev * delta));
      setPan(p => ({
        x: mouseX - (mouseX - p.x) * (next / prev),
        y: mouseY - (mouseY - p.y) * (next / prev),
      }));
      return next;
    });
  }, []);

  const handlePanStart = useCallback((e) => {
    if (e.button === 1 || (e.button === 0 && !stencilMode)) {
      e.preventDefault();
      setIsPanning(true);
      panStartRef.current = { mouseX: e.clientX, mouseY: e.clientY, panX: pan.x, panY: pan.y };
    }
  }, [stencilMode, pan]);

  const handlePanMove = useCallback((e) => {
    if (!isPanning || !panStartRef.current) return;
    setPan({
      x: panStartRef.current.panX + (e.clientX - panStartRef.current.mouseX),
      y: panStartRef.current.panY + (e.clientY - panStartRef.current.mouseY),
    });
  }, [isPanning]);

  const handlePanEnd = useCallback(() => {
    setIsPanning(false);
    panStartRef.current = null;
  }, []);

  const resetView = useCallback(() => {
    setZoom(0.8);
    setPan({ x: 0, y: 0 });
  }, []);

  const toCanvasCoords = useCallback((canvasEl, clientX, clientY) => {
    const rect = canvasEl.getBoundingClientRect();
    return {
      x: (clientX - rect.left)  * (canvasEl.width  / rect.width),
      y: (clientY - rect.top)   * (canvasEl.height / rect.height),
    };
  }, []);

  const paintDot = useCallback((canvas, x, y) => {
    const rect = canvas.getBoundingClientRect();
    const r = brushRadius * (canvas.width / rect.width);
    const ctx = canvas.getContext('2d');
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(59, 130, 246, 0.45)';
    ctx.fill();
  }, [brushRadius]);

  const handleMouseDown = useCallback((e) => {
    if (!stencilMode || e.button !== 0) return;
    paintingRef.current = true;
    const canvas = overlayRef.current;
    const coords = toCanvasCoords(canvas, e.clientX, e.clientY);
    paintDot(canvas, coords.x, coords.y);
    const scaledRadius = brushRadius * (canvas.width / canvas.getBoundingClientRect().width);
    strokesRef.current.push({ x: coords.x, y: coords.y, radius: scaledRadius });
    onStrokesChange([...strokesRef.current]);
  }, [stencilMode, brushRadius, toCanvasCoords, paintDot, onStrokesChange]);

  const handleMouseMove = useCallback((e) => {
    if (isPanning) { handlePanMove(e); return; }
    if (!stencilMode || !paintingRef.current) return;
    const canvas = overlayRef.current;
    const coords = toCanvasCoords(canvas, e.clientX, e.clientY);
    paintDot(canvas, coords.x, coords.y);
    const scaledRadius = brushRadius * (canvas.width / canvas.getBoundingClientRect().width);
    strokesRef.current.push({ x: coords.x, y: coords.y, radius: scaledRadius });
    onStrokesChange([...strokesRef.current]);
  }, [stencilMode, brushRadius, toCanvasCoords, paintDot, onStrokesChange, isPanning, handlePanMove]);

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

  // Clear the brush overlay when stencil generation completes so the result is visible
  useEffect(() => {
    if (!stencilMode || generating) return;
    clearStrokes();
  }, [generating]);

  // Attach wheel as non-passive to canvas outer
  useEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  const transform = `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`;

  return (
    <div
      ref={outerRef}
      className="canvas-outer"
      onMouseDown={handlePanStart}
      onMouseMove={handlePanMove}
      onMouseUp={handlePanEnd}
      onMouseLeave={handlePanEnd}
    >
      <div
        className="canvas-wrapper"
        style={{ transform, width: displaySize.w, height: displaySize.h }}
      >
        <canvas ref={canvasRef} className="canvas-base" width={width} height={height} />

        <canvas
          ref={overlayRef}
          className={`canvas-overlay ${stencilMode ? 'active' : ''}`}
          width={width}
          height={height}
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

        {['top', 'bottom', 'left', 'right'].map(side => {
          // On the left side, ◁ points outward = expand = next; ▷ points inward = shrink = prev
          // All other sides: first button = prev (-1), second button = next (+1)
          const d1 = side === 'left' ? 1 : -1;
          const d2 = side === 'left' ? -1 : 1;
          return (
            <div key={side} className={`canvas-side-arrows canvas-side-${side}`}>
              <button className="canvas-side-btn" onClick={() => stepOriented(d1)} aria-label="Previous size">
                <svg viewBox="0 0 16 16" fill="none" className="canvas-side-icon">
                  <path d="M4 9l4-4 4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
              <button className="canvas-side-btn" onClick={() => stepOriented(d2)} aria-label="Next size">
                <svg viewBox="0 0 16 16" fill="none" className="canvas-side-icon">
                  <path d="M4 7l4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>
          );
        })}
      </div>

      <div className="canvas-controls">
        <div className="zoom-controls zoom-controls-sizing">
          <span className="zoom-label">Sizing</span>
          <div className="zoom-divider-v" />
          <WheelPicker selectedIndex={effectiveIndex} onChange={handleSizeChange} />
        </div>
        <div className="zoom-controls">
          <button className="btn-small" onClick={() => setZoom(z => Math.min(MAX_ZOOM, z * 1.2))}>+</button>
          <span className="zoom-label">{Math.round(zoom * 100)}%</span>
          <button className="btn-small" onClick={() => setZoom(z => Math.max(MIN_ZOOM, z * 0.8))}>−</button>
          <button className="btn-small" onClick={resetView}>Reset</button>
        </div>
      </div>
    </div>
  );
}
