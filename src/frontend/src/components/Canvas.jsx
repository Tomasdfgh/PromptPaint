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

export default function Canvas({
  layers = [], activeLayerId = null, activeLayerOverride = null,
  onLayerUpdate, onCompositeChange,
  isPreview, stencilMode, onStencilActiveChange,
  generating, brushRadius, onStrokesChange, hasStrokes,
  width = 1024, height = 1024, onSizeChange,
}) {
  const canvasRef   = useRef(null);
  const overlayRef  = useRef(null);
  const outerRef    = useRef(null);
  const strokesRef  = useRef([]);
  const paintingRef = useRef(false);
  const panStartRef = useRef(null);

  // Layer compositing refs
  const layerCanvasesRef    = useRef(new Map());
  const overrideCanvasRef   = useRef(null);
  const layersRef           = useRef(layers);
  const activeLayerIdRef    = useRef(activeLayerId);
  const onCompositeChangeRef = useRef(onCompositeChange);

  useEffect(() => { layersRef.current = layers; }, [layers]);
  useEffect(() => { activeLayerIdRef.current = activeLayerId; }, [activeLayerId]);
  useEffect(() => { onCompositeChangeRef.current = onCompositeChange; }, [onCompositeChange]);

  const [zoom, setZoom]   = useState(0.8);
  const [pan,  setPan]    = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panMode, setPanMode] = useState(true);
  const [eraserMode, setEraserMode] = useState(false);
  const [eraserPos, setEraserPos] = useState(null);
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

  // Stencil is mutually exclusive with pan and eraser
  useEffect(() => {
    if (stencilMode) {
      setPanMode(false);
      setEraserMode(false);
    }
  }, [stencilMode]);

  // When generation starts, activate hand (pan) mode
  useEffect(() => {
    if (generating) {
      setPanMode(true);
      setEraserMode(false);
    }
  }, [generating]);

  // Composite all visible layers onto canvasRef
  const compositeAll = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const layer of layersRef.current) {
      if (!layer.visible) continue;
      const src = (layer.id === activeLayerIdRef.current && overrideCanvasRef.current)
        ? overrideCanvasRef.current
        : layerCanvasesRef.current.get(layer.id);
      if (src) {
        ctx.globalAlpha = layer.opacity ?? 1;
        ctx.drawImage(src, 0, 0);
      }
    }
    ctx.globalAlpha = 1;
  }, []);

  const reportComposite = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const b64 = canvas.toDataURL('image/png').split(',')[1];
    onCompositeChangeRef.current?.(b64);
  }, []);

  // Update offscreen canvases when layers change, then recomposite
  useEffect(() => {
    const map = layerCanvasesRef.current;
    for (const id of [...map.keys()]) {
      if (!layers.find(l => l.id === id)) map.delete(id);
    }
    const counter = { pending: 0 };
    for (const layer of layers) {
      if (!map.has(layer.id)) {
        const lc = document.createElement('canvas');
        lc.width = width; lc.height = height;
        map.set(layer.id, lc);
      }
      const lc = map.get(layer.id);
      if (lc.width !== width || lc.height !== height) { lc.width = width; lc.height = height; }
      lc.getContext('2d').clearRect(0, 0, lc.width, lc.height);
      if (layer.imageB64) {
        counter.pending++;
        const img = new Image();
        const b64 = layer.imageB64;
        img.onload = () => {
          lc.getContext('2d').drawImage(img, 0, 0, lc.width, lc.height);
          counter.pending--;
          if (counter.pending === 0) { compositeAll(); reportComposite(); }
        };
        img.src = `data:image/png;base64,${b64}`;
      }
    }
    if (counter.pending === 0) { compositeAll(); reportComposite(); }
  }, [layers, width, height, compositeAll, reportComposite]);

  // Handle scrub/preview override for active layer
  useEffect(() => {
    if (!activeLayerOverride) {
      overrideCanvasRef.current = null;
      compositeAll(); reportComposite();
      return;
    }
    const oc = document.createElement('canvas');
    oc.width = width; oc.height = height;
    const img = new Image();
    img.onload = () => {
      oc.getContext('2d').drawImage(img, 0, 0, oc.width, oc.height);
      overrideCanvasRef.current = oc;
      compositeAll(); reportComposite();
    };
    img.src = `data:image/png;base64,${activeLayerOverride}`;
  }, [activeLayerOverride, width, height, compositeAll, reportComposite]);

  // Recomposite when active layer changes (override may redirect)
  useEffect(() => {
    compositeAll();
  }, [activeLayerId, compositeAll]);

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
    if (e.button === 1 || (e.button === 0 && panMode)) {
      e.preventDefault();
      setIsPanning(true);
      panStartRef.current = { mouseX: e.clientX, mouseY: e.clientY, panX: pan.x, panY: pan.y };
    }
  }, [panMode, pan]);

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

  const applyStroke = useCallback((canvas, x, y) => {
    const r = brushRadius * (canvas.width / canvas.getBoundingClientRect().width);
    const ctx = canvas.getContext('2d');
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(59, 130, 246, 0.45)';
    ctx.fill();
    return r;
  }, [brushRadius]);

  const eraseAt = useCallback((x, y) => {
    const canvas = canvasRef.current;
    const overlay = overlayRef.current;
    if (!canvas) return;
    const r = brushRadius * (canvas.width / canvas.getBoundingClientRect().width);
    // Erase from active layer's offscreen canvas + stencil overlay
    const activeCanvas = layerCanvasesRef.current.get(activeLayerIdRef.current);
    for (const c of [activeCanvas, overlay]) {
      if (!c) continue;
      const ctx = c.getContext('2d');
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.clip();
      ctx.clearRect(x - r - 1, y - r - 1, r * 2 + 2, r * 2 + 2);
      ctx.restore();
    }
    compositeAll();
  }, [brushRadius, compositeAll]);

  const handleMouseDown = useCallback((e) => {
    if (e.button !== 0 || (!stencilMode && !eraserMode)) return;
    if (eraserMode && isPreview) return;
    paintingRef.current = true;
    const canvas = overlayRef.current;
    const coords = toCanvasCoords(canvas, e.clientX, e.clientY);
    if (eraserMode) {
      eraseAt(coords.x, coords.y);
    } else {
      const r = applyStroke(canvas, coords.x, coords.y);
      strokesRef.current.push({ x: coords.x, y: coords.y, radius: r });
      onStrokesChange([...strokesRef.current]);
    }
  }, [stencilMode, eraserMode, isPreview, toCanvasCoords, applyStroke, eraseAt, onStrokesChange]);

  const handleMouseMove = useCallback((e) => {
    if (isPanning) { handlePanMove(e); return; }
    if ((!stencilMode && !eraserMode) || !paintingRef.current) return;
    const canvas = overlayRef.current;
    const coords = toCanvasCoords(canvas, e.clientX, e.clientY);
    if (eraserMode) {
      eraseAt(coords.x, coords.y);
    } else {
      const r = applyStroke(canvas, coords.x, coords.y);
      strokesRef.current.push({ x: coords.x, y: coords.y, radius: r });
      onStrokesChange([...strokesRef.current]);
    }
  }, [stencilMode, eraserMode, toCanvasCoords, applyStroke, eraseAt, onStrokesChange, isPanning, handlePanMove]);

  const handleMouseUp = useCallback(() => {
    if (paintingRef.current && eraserMode) {
      const id = activeLayerIdRef.current;
      const lc = layerCanvasesRef.current.get(id);
      if (lc) {
        const b64 = lc.toDataURL('image/png').split(',')[1];
        onLayerUpdate?.(id, b64);
        reportComposite();
      }
    }
    paintingRef.current = false;
    handlePanEnd();
  }, [eraserMode, onLayerUpdate, reportComposite, handlePanEnd]);

  const clearStrokes = useCallback(() => {
    const canvas = overlayRef.current;
    if (!canvas) return;
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    strokesRef.current = [];
    onStrokesChange([]);
  }, [onStrokesChange]);

  // Clear the brush overlay when generation begins (if there are strokes)
  useEffect(() => {
    if (!generating || strokesRef.current.length === 0) return;
    clearStrokes();
  }, [generating, clearStrokes]);

  // Clear strokes when switching active layer
  useEffect(() => {
    clearStrokes();
  }, [activeLayerId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Attach wheel as non-passive to canvas outer
  useEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  const transform = `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`;
  const allHidden = layers.length > 0 && layers.every(l => !l.visible);
  const showEmpty = allHidden || !layers.some(l => l.visible && l.imageB64);

  return (
    <div
      ref={outerRef}
      className="canvas-outer"
      style={{ cursor: isPanning ? 'grabbing' : panMode ? 'grab' : 'default' }}
      onMouseDown={handlePanStart}
      onMouseMove={handlePanMove}
      onMouseUp={handlePanEnd}
      onMouseLeave={handlePanEnd}
    >
      <div
        className="canvas-wrapper"
        style={{ transform, width: displaySize.w, height: displaySize.h, cursor: eraserPos ? 'none' : undefined, display: allHidden ? 'none' : undefined }}
        onMouseMove={(e) => { if (eraserMode) setEraserPos({ x: e.clientX, y: e.clientY }); }}
        onMouseLeave={() => setEraserPos(null)}
      >
        <canvas ref={canvasRef} className="canvas-base" width={width} height={height} />

        <canvas
          ref={overlayRef}
          className={`canvas-overlay ${stencilMode ? 'active' : ''} ${eraserMode ? 'erasing' : ''}`}
          width={width}
          height={height}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        />

        {showEmpty && (
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

        {(stencilMode || hasStrokes) && (
          <div className="stencil-toolbar">
            <button className="btn-small" onClick={clearStrokes}>Clear Stencil Paint</button>
            {stencilMode && <span className="stencil-hint">Brush the area to regenerate</span>}
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

      <div className="canvas-mode-toolbar">
        <button
          className={`canvas-mode-btn ${panMode ? 'active' : ''}`}
          title="Pan mode"
          onClick={() => {
            if (stencilMode) onStencilActiveChange?.(false);
            setPanMode(m => !m);
            setEraserMode(false);
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="22" height="22">
            <path d="M18 11V8a2 2 0 0 0-4 0v3"/>
            <path d="M14 10V6a2 2 0 0 0-4 0v4"/>
            <path d="M10 10V5a2 2 0 0 0-4 0v9"/>
            <path d="M6 14a4 4 0 0 0 4 4h4a4 4 0 0 0 4-4v-3"/>
          </svg>
        </button>
        <button
          className={`canvas-mode-btn ${eraserMode ? 'active' : ''}`}
          title="Eraser"
          onClick={() => {
            setEraserMode(m => !m);
            setPanMode(false);
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="22" height="22">
            <path d="M20 20H7L3 16l11-11 6 6-3.5 3.5"/>
            <path d="M6.0001 17.0001L17 6"/>
          </svg>
        </button>
        <button
          className="canvas-mode-btn"
          title="Save as PNG"
          onClick={() => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const off = document.createElement('canvas');
            off.width = canvas.width;
            off.height = canvas.height;
            const ctx = off.getContext('2d');
            ctx.drawImage(canvas, 0, 0);

            const logo = new Image();
            logo.onload = () => {
              const pad = 16, logoSize = 22, gap = 7, fontSize = 13;
              ctx.font = `600 ${fontSize}px system-ui, sans-serif`;
              const tw = ctx.measureText('PromptPaint').width;
              const x = off.width  - pad - logoSize - gap - tw;
              const y = off.height - pad - logoSize;
              ctx.globalAlpha = 0.65;
              ctx.drawImage(logo, x, y, logoSize, logoSize);
              ctx.fillStyle = '#ffffff';
              ctx.shadowColor = 'rgba(0,0,0,0.55)';
              ctx.shadowBlur = 4;
              ctx.fillText('PromptPaint', x + logoSize + gap, y + logoSize * 0.72);
              ctx.globalAlpha = 1;
              const a = document.createElement('a');
              a.href = off.toDataURL('image/png');
              a.download = 'promptpaint.png';
              a.click();
            };
            logo.src = promptpaintLogoDataUri;
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="22" height="22">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
        </button>

        <button
          className="canvas-mode-btn"
          title="Upload image to canvas"
          onClick={() => {}}
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 14 12 9 17 14"/>
            <line x1="12" y1="9" x2="12" y2="21"/>
          </svg>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.03em', lineHeight: 1, color: 'currentColor' }}>IMG</span>
        </button>
      </div>

      {eraserMode && eraserPos && (
        <div
          className="eraser-preview"
          style={{
            left: eraserPos.x,
            top: eraserPos.y,
            width: brushRadius * 2,
            height: brushRadius * 2,
          }}
        />
      )}

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
