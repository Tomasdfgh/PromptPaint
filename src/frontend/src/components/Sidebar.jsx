
import React, { useRef, useState, useEffect, useCallback } from 'react';

// Convert hue (0-359) to hex at fixed saturation/lightness
const hueToHex = (h) => {
  const s = 0.78, l = 0.55;
  const a = s * Math.min(l, 1 - l);
  const f = n => {
    const k = (n + h / 30) % 12;
    const c = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * c).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
};

// Extract approximate hue from hex
const hexToHue = (hex) => {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  if (max === min) return 0;
  const d = max - min;
  let h;
  if (max === r)      h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else                h = ((r - g) / d + 4) / 6;
  return Math.round(h * 359);
};

// Spread new prompts evenly around the hue wheel
const promptHue = (index) => hueToHex((index * 67) % 360); // 67° golden-angle-ish spacing

const sliderBg = (val, min, max) => {
  const pct = Math.round(((val - min) / (max - min)) * 100);
  return {
    background: `linear-gradient(to right, var(--accent) ${pct}%, var(--border) ${pct}%)`,
  };
};


export default function Sidebar({
  mode, onModeChange,
  params, onParamsChange,
  onGenerate, onIntervene, onCancel,
  generating, queuePos, step, totalSteps,
  brushRadius, onBrushRadiusChange,
  onPaletteWeightsChange,
}) {
  const set = (key, val) => onParamsChange({ ...params, [key]: val });
  const [paletteWeights, setPaletteWeights] = React.useState([]);

  const handlePaletteWeights = (w) => {
    setPaletteWeights(w);
    onPaletteWeightsChange?.(w);
  };

  const prompts = params.prompts?.length > 0
    ? params.prompts
    : [{ text: '', color: promptHue(0), weight: 1 }, { text: '', color: promptHue(1), weight: 1 }];

  const isMixingMode = mode === 'standard' && prompts.length > 1;
  const hasSelection = paletteWeights.some(w => w > 0.001);
  const needsSelection = isMixingMode && !hasSelection;

  const handleGenerateWithLog = () => {
    const hasSelection = paletteWeights.some(w => w > 0.001);
    console.group('%c[PromptPaint] Generate', 'color:#007acc;font-weight:700');
    console.log('Mode:', mode);
    if (mode === 'standard') {
      if (hasSelection) {
        console.log('Prompt composition:');
        prompts.forEach((p, i) => {
          const pct = Math.round((paletteWeights[i] ?? 0) * 100);
          console.log(`  %c■%c Prompt ${i + 1} (${pct}%): "${p.text}"`, `color:${p.color}`, 'color:inherit');
        });
      } else {
        console.log('No palette selection — no composition weights');
      }
    }
    console.groupEnd();
    onGenerate();
  };

  return (
    <aside className="sidebar">

      {/* Mode-specific panels */}
      <div className="panels">

        {mode === 'standard' && (
          <PromptListPanel params={params} set={set} />
        )}

        {mode === 'standard' && (
          <PromptPalette prompts={prompts} onWeightsChange={handlePaletteWeights} />
        )}

        {mode === 'directional' && (
          <DirectionalPanel params={params} set={set} />
        )}

        {mode === 'stencil' && (
          <StencilPanel
            params={params} set={set}
            brushRadius={brushRadius}
            onBrushRadiusChange={onBrushRadiusChange}
          />
        )}

        {mode === 'intervention' && (
          <InterventionPanel
            params={params} set={set}
            generating={generating}
            onIntervene={onIntervene}
            step={step}
            totalSteps={totalSteps}
          />
        )}
      </div>

      {/* Bottom: generation settings + progress + actions */}
      <div className="sidebar-bottom">

        {mode === 'standard' && (
          <PromptCompositionPanel prompts={prompts} weights={paletteWeights} />
        )}

        {/* Generate area: hover reveals settings above the button */}
        <div className="generate-area">
          <SharedParams params={params} set={set} />

          {/* Action buttons */}
          <div className="action-row">
          <button
            className="btn-generate"
            onClick={handleGenerateWithLog}
            disabled={generating || needsSelection}
          >
            {queuePos ? (
            `Queued (${queuePos})`
          ) : (
            <>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 15, height: 15, marginRight: 6, verticalAlign: 'middle', display: 'inline' }}>
                <path d="M3 21v-4a4 4 0 1 1 4 4H3z"/>
                <path d="M15 7l-6.5 6.5a1.5 1.5 0 0 0 3 3L18 10a1.5 1.5 0 0 0-3-3z"/>
                <path d="M9.5 11.5l-2-2"/>
                <path d="M13.5 7.5l-2-2"/>
                <path d="M17 3l4 4"/>
              </svg>
              {generating ? 'Painting…' : needsSelection ? 'Paint — select a mix' : 'Paint'}
            </>
          )}
          </button>
          {generating && (
            <button className="btn-cancel" onClick={onCancel}>Cancel</button>
          )}
        </div>

        </div>{/* end generate-area */}

        <div className="generate-status-bar">
          {generating ? (
            queuePos ? (
              <>
                <div className="progress-bar-track">
                  <div className="progress-bar-fill progress-bar-pulse" style={{ width: '100%' }} />
                </div>
                <span className="progress-label">Queued — position {queuePos}</span>
              </>
            ) : (
              <>
                <div className="progress-bar-track">
                  <div
                    className="progress-bar-fill"
                    style={{ width: totalSteps > 0 ? `${(step / totalSteps) * 100}%` : '0%' }}
                  />
                </div>
                <span className="progress-label">{step} / {totalSteps} steps</span>
              </>
            )
          ) : (
            <p className="generate-notice">Hosted from a private server in Toronto. Expect a queue during high traffic and latency issues if far away.</p>
          )}
        </div>
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Mode panels
// ---------------------------------------------------------------------------

function ColorPicker({ color, onChange, index }) {
  const [open, setOpen] = useState(false);
  const [popoverPos, setPopoverPos] = useState({ top: 0, left: 0 });
  const wrapRef = useRef(null);
  const dotRef = useRef(null);
  const hue = hexToHue(color);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target) &&
          !(e.target.closest && e.target.closest('.color-swatch-popover-fixed'))) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleClick = () => {
    if (!open && dotRef.current) {
      const rect = dotRef.current.getBoundingClientRect();
      setPopoverPos({ top: rect.bottom + 4, left: rect.left });
    }
    setOpen(o => !o);
  };

  return (
    <div className="color-swatch-wrap" ref={wrapRef}>
      <div
        ref={dotRef}
        className="prompt-color-dot"
        style={{ background: color }}
        onClick={handleClick}
      >
        {index !== undefined && <span className="prompt-color-dot-num">{index + 1}</span>}
      </div>
      {open && (
        <div
          className="color-swatch-popover color-swatch-popover-fixed"
          style={{ position: 'fixed', top: popoverPos.top, left: popoverPos.left, zIndex: 9999 }}
        >
          <input
            type="range"
            min={0}
            max={359}
            value={hue}
            onChange={e => onChange(hueToHex(parseInt(e.target.value)))}
            className="hue-slider"
            style={{ '--thumb-color': color }}
          />
        </div>
      )}
    </div>
  );
}

function PromptRow({ prompt, index, onUpdate, onRemove, showRemove, showWeight, totalWeight }) {
  const [editing, setEditing] = useState(!prompt.text.trim());
  const textareaRef = useRef(null);

  const autoResize = (el) => {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  };

  useEffect(() => {
    autoResize(textareaRef.current);
  }, [prompt.text, editing]);

  useEffect(() => {
    if (editing) textareaRef.current?.focus();
  }, [editing]);

  const wordCount = prompt.text.trim() ? prompt.text.trim().split(/\s+/).filter(Boolean).length : 0;

  return (
    <div className="prompt-list-row">
      <div className="prompt-list-row-main">
        <ColorPicker color={prompt.color} onChange={c => onUpdate('color', c)} index={index} />

        <div className="prompt-input-wrap">
          <textarea
            ref={textareaRef}
            className={`prompt-input${editing ? '' : ' prompt-input-readonly'}`}
            rows={1}
            placeholder={`Prompt ${index + 1}…`}
            value={prompt.text}
            readOnly={!editing}
            onChange={e => {
              const words = e.target.value.trim().split(/\s+/).filter(Boolean);
              if (words.length > 30) return;
              onUpdate('text', e.target.value);
              autoResize(e.target);
            }}
            onFocus={() => setEditing(true)}
            onBlur={() => { if (prompt.text.trim()) setEditing(false); }}
            style={{
              borderColor: prompt.color + '66',
              maxHeight: editing ? '72px' : 'none',
              overflowY: editing ? 'auto' : 'hidden',
              paddingRight: showRemove ? '22px' : undefined,
            }}
          />
          {wordCount > 0 && <span className="prompt-word-count">{wordCount}/30</span>}
          {showRemove && (
            <button className="btn-small prompt-remove-btn" onClick={onRemove}>✕</button>
          )}
        </div>
      </div>

    </div>
  );
}

function PromptListPanel({ params, set }) {
  const prompts = params.prompts?.length > 0
    ? params.prompts
    : [{ text: '', color: promptHue(0), weight: 1 }, { text: '', color: promptHue(1), weight: 1 }];

  const totalWeight = prompts.reduce((s, p) => s + (p.weight ?? 1), 0);
  const multiPrompt = prompts.length > 1;

  const updatePrompt = (i, field, val) =>
    set('prompts', prompts.map((p, idx) => idx === i ? { ...p, [field]: val } : p));

  const addPrompt = () =>
    set('prompts', [...prompts, { text: '', color: promptHue(prompts.length), weight: 1 }]);

  const removePrompt = (i) => {
    if (prompts.length <= 1) return;
    set('prompts', prompts.filter((_, idx) => idx !== i));
  };

  return (
    <section className="panel prompt-list-panel">
      <div className="prompt-list-header">
        <label className="field-label">Prompt List</label>
        <button className="btn-add-prompt" onClick={addPrompt}>+ Add Prompt</button>
      </div>
      <div className="prompt-list">
        {prompts.map((p, i) => (
          <PromptRow
            key={i}
            index={i}
            prompt={p}
            onUpdate={(field, val) => updatePrompt(i, field, val)}
            onRemove={() => removePrompt(i)}
            showRemove={multiPrompt}
            showWeight={multiPrompt}
            totalWeight={totalWeight}
          />
        ))}
      </div>
    </section>
  );
}


// ---------------------------------------------------------------------------
// Prompt Palette
// ---------------------------------------------------------------------------

const VW = 260;
const VH = 140;
const DOT_R = 14;

// Classic painter's palette shape (260×140 viewBox)
const PALETTE_PATH =
  'M 46,6 C 22,6 4,22 4,48 C 4,96 36,134 92,134 ' +
  'C 142,134 184,120 216,96 C 250,70 256,44 250,26 ' +
  'C 244,10 230,4 214,6 C 196,8 184,22 168,28 ' +
  'C 152,34 136,22 120,12 C 104,2 82,2 62,4 Z';

const PRESETS = {
  1: [{ x: 0.56, y: 0.50 }],
  2: [{ x: 0.40, y: 0.64 }, { x: 0.72, y: 0.40 }],
  3: [{ x: 0.36, y: 0.70 }, { x: 0.72, y: 0.68 }, { x: 0.58, y: 0.28 }],
  4: [{ x: 0.36, y: 0.68 }, { x: 0.70, y: 0.68 }, { x: 0.38, y: 0.30 }, { x: 0.70, y: 0.30 }],
};

function defaultPalettePos(i, total) {
  const p = PRESETS[Math.min(total, 4)]?.[i];
  if (p) return { x: p.x * VW, y: p.y * VH };
  const angle = (i / total) * Math.PI * 2 - Math.PI / 2;
  return {
    x: (0.58 + 0.22 * Math.cos(angle)) * VW,
    y: (0.50 + 0.28 * Math.sin(angle)) * VH,
  };
}

function cross(O, A, B) {
  return (A.x - O.x) * (B.y - O.y) - (A.y - O.y) * (B.x - O.x);
}
function convexHull(points) {
  if (points.length < 3) return points;
  const pts = [...points].sort((a, b) => a.x !== b.x ? a.x - b.x : a.y - b.y);
  const lower = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}
function expandConvexHull(hull, r) {
  const n = hull.length;
  if (n < 2) return hull;
  const cx = hull.reduce((s, p) => s + p.x, 0) / n;
  const cy = hull.reduce((s, p) => s + p.y, 0) / n;
  // Offset each edge outward by r
  const offsetEdges = hull.map((p, i) => {
    const next = hull[(i + 1) % n];
    const dx = next.x - p.x;
    const dy = next.y - p.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 0.001) return { x1: p.x, y1: p.y, x2: next.x, y2: next.y, dx: 1, dy: 0 };
    let nx = -dy / len;
    let ny = dx / len;
    // Ensure normal points away from centroid
    const mx = (p.x + next.x) / 2;
    const my = (p.y + next.y) / 2;
    if (nx * (cx - mx) + ny * (cy - my) > 0) { nx = -nx; ny = -ny; }
    return { x1: p.x + nx * r, y1: p.y + ny * r, x2: next.x + nx * r, y2: next.y + ny * r, dx: dx / len, dy: dy / len };
  });
  // Intersect adjacent offset edges to get new vertices
  return offsetEdges.map((e, i) => {
    const prev = offsetEdges[(i - 1 + n) % n];
    const denom = prev.dx * e.dy - prev.dy * e.dx;
    if (Math.abs(denom) < 0.001) return { x: e.x1, y: e.y1 };
    const t = ((e.x1 - prev.x1) * e.dy - (e.y1 - prev.y1) * e.dx) / denom;
    return { x: prev.x1 + t * prev.dx, y: prev.y1 + t * prev.dy };
  });
}

function pointInPolygon(pt, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    if ((yi > pt.y) !== (yj > pt.y) &&
        pt.x < (xj - xi) * (pt.y - yi) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function findComponents(n, links) {
  const adj = Array.from({ length: n }, () => []);
  for (const { a, b } of links) {
    if (a < n && b < n) { adj[a].push(b); adj[b].push(a); }
  }
  const visited = new Set();
  const components = [];
  for (let i = 0; i < n; i++) {
    if (visited.has(i)) continue;
    const comp = [];
    const queue = [i];
    visited.add(i);
    while (queue.length) {
      const node = queue.shift();
      comp.push(node);
      for (const nb of adj[node]) { if (!visited.has(nb)) { visited.add(nb); queue.push(nb); } }
    }
    components.push(comp);
  }
  return components;
}

function PromptPalette({ prompts, onWeightsChange }) {
  const svgRef    = useRef(null);
  const panelRef  = useRef(null);
  const dotDragRef    = useRef(null);
  const heightScaleRef = useRef(1.0);

  const [heightScale, setHeightScaleState] = useState(1.0);
  const [positions, setPositions] = useState(() =>
    prompts.map((_, i) => defaultPalettePos(i, prompts.length))
  );
  const [fixed, setFixed] = useState(false);
  const [hoveredDot, setHoveredDot] = useState(null);
  const [selectedDot, setSelectedDot] = useState(null);
  const [mousePos, setMousePos] = useState(null);
  const [links, setLinks] = useState([]);
  const [topDot, setTopDot] = useState(null);
  const [cursorPos, setCursorPos] = useState({ x: VW * 0.56, y: VH * 0.5 });

  const setHeightScale = (v) => {
    heightScaleRef.current = v;
    setHeightScaleState(v);
  };

  useEffect(() => {
    setPositions(prev =>
      prompts.map((_, i) => prev[i] ?? defaultPalettePos(i, prompts.length))
    );
    setLinks(prev => prev.filter(l => l.a < prompts.length && l.b < prompts.length));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prompts.length]);

  useEffect(() => {
    const maxY = VH * heightScale - DOT_R;
    setPositions(prev => prev.map(p => ({
      x: Math.min(Math.max(DOT_R, p.x), VW - DOT_R),
      y: Math.min(Math.max(DOT_R, p.y), maxY),
    })));
    setCursorPos(prev => ({
      x: Math.min(Math.max(0, prev.x), VW),
      y: Math.min(Math.max(0, prev.y), VH * heightScale),
    }));
  }, [heightScale]);

  const toSVGCoords = useCallback((clientX, clientY) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  }, []);

  const fixedRef = useRef(fixed);
  fixedRef.current = fixed;
  const selectedDotRef = useRef(selectedDot);
  selectedDotRef.current = selectedDot;
  const mousedownPosRef = useRef(null);
  const didDragRef = useRef(false);

  const handleDotMouseDown = useCallback((index, e) => {
    if (fixedRef.current) return;
    mousedownPosRef.current = { x: e.clientX, y: e.clientY };
    // When another dot is selected, don't start dragging — let the click handle the connect
    if (selectedDotRef.current !== null && selectedDotRef.current !== index) return;
    e.preventDefault();
    dotDragRef.current = index;
    const startX = e.clientX, startY = e.clientY;

    const onMove = (me) => {
      if (dotDragRef.current === null) return;
      const dx = me.clientX - startX, dy = me.clientY - startY;
      if (Math.sqrt(dx * dx + dy * dy) < 4) return;
      if (!didDragRef.current) { didDragRef.current = true; setTopDot(index); }
      const { x, y } = toSVGCoords(me.clientX, me.clientY);
      const maxY = VH * heightScaleRef.current - DOT_R;
      setPositions(prev => prev.map((p, i) =>
        i === dotDragRef.current
          ? { x: Math.min(Math.max(DOT_R, x), VW - DOT_R),
              y: Math.min(Math.max(DOT_R, y), maxY) }
          : p
      ));
    };

    const onUp = () => {
      dotDragRef.current = null;
      if (didDragRef.current) {
        didDragRef.current = false;
        setSelectedDot(null);
        setMousePos(null);
      }
      mousedownPosRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [toSVGCoords]);

  const handleResizeMouseDown = useCallback((e) => {
    e.preventDefault();
    const startY     = e.clientY;
    const startScale = heightScaleRef.current;
    // natural SVG height at current panel width
    const naturalH   = (panelRef.current?.getBoundingClientRect().width ?? VW) * (VH / VW);

    const onMove = (me) => {
      const dy = me.clientY - startY;
      setHeightScale(Math.min(1.4, Math.max(1.0, startScale + dy / naturalH)));
    };

    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, []);

  const handleCursorMouseDown = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    const onMove = (me) => {
      const { x, y } = toSVGCoords(me.clientX, me.clientY);
      const maxY = VH * heightScaleRef.current;
      setCursorPos({
        x: Math.min(Math.max(0, x), VW),
        y: Math.min(Math.max(0, y), maxY),
      });
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [toSVGCoords]);

  // Must be declared before weights (which references it)
  const components = findComponents(prompts.length, links);

  // Weights only when cursor is on a dot, bridge, or polygon — otherwise nothing
  const weights = (() => {
    if (prompts.length === 0) return [];
    const getPos = (i) => positions[i] ?? defaultPalettePos(i, prompts.length);

    // 1. Cursor on any dot
    for (let i = 0; i < prompts.length; i++) {
      const pos = getPos(i);
      if (Math.hypot(cursorPos.x - pos.x, cursorPos.y - pos.y) <= DOT_R) {
        return prompts.map((_, j) => j === i ? 1 : 0);
      }
    }

    // 2. Cursor on a bridge (2-dot connection, not part of a 3+ group)
    const inLargeGroup = new Set(components.filter(c => c.length >= 3).flatMap(c => c));
    for (const link of links) {
      if (inLargeGroup.has(link.a) || inLargeGroup.has(link.b)) continue;
      const pA = getPos(link.a), pB = getPos(link.b);
      const edx = pB.x - pA.x, edy = pB.y - pA.y;
      const len2 = edx * edx + edy * edy;
      if (len2 < 0.001) continue;
      const t = Math.max(0, Math.min(1, ((cursorPos.x - pA.x) * edx + (cursorPos.y - pA.y) * edy) / len2));
      const perpDist = Math.hypot(cursorPos.x - pA.x - t * edx, cursorPos.y - pA.y - t * edy);
      if (perpDist <= DOT_R) {
        const w = prompts.map(() => 0);
        w[link.a] = 1 - t;
        w[link.b] = t;
        return w;
      }
    }

    // 3. Cursor inside a 3+ polygon
    for (const comp of components) {
      if (comp.length < 3) continue;
      const pts = comp.map(i => getPos(i));
      if (pointInPolygon(cursorPos, convexHull(pts))) {
        const dists = comp.map(i => Math.hypot(cursorPos.x - getPos(i).x, cursorPos.y - getPos(i).y));
        const invD2 = dists.map(d => d < 1 ? 1e9 : 1 / (d * d));
        const total = invD2.reduce((s, v) => s + v, 0);
        const w = prompts.map(() => 0);
        comp.forEach((idx, j) => { w[idx] = invD2[j] / total; });
        return w;
      }
    }

    // 4. Not on anything — no selection
    return prompts.map(() => 0);
  })();

  const weightsKey = weights.join(',');
  const onWeightsChangeRef = useRef(onWeightsChange);
  onWeightsChangeRef.current = onWeightsChange;
  useEffect(() => { onWeightsChangeRef.current(weights); }, [weightsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const viewHeight = Math.round(VH * heightScale);

  const isDebridge = !fixed && selectedDot !== null && hoveredDot !== null && hoveredDot !== selectedDot &&
    links.some(l => (l.a === selectedDot && l.b === hoveredDot) || (l.a === hoveredDot && l.b === selectedDot));
  // True when hoveredDot is already in the same component as selectedDot (but no direct link)
  const isAlreadyGrouped = !fixed && !isDebridge && selectedDot !== null && hoveredDot !== null && hoveredDot !== selectedDot &&
    components.some(c => c.includes(selectedDot) && c.includes(hoveredDot));

  // Rotate + scale the palette so it fills VW×viewHeight while preserving its own aspect ratio.
  // Solve: bounding box of rotated VW×VH rectangle == VW×viewHeight
  // → θ = arctan((VW·VH·(h−1)) / (VW²−VH²·h)),  s = VW / (VW·cosθ + VH·sinθ)
  const tanTheta = (VW * VH * (heightScale - 1)) / (VW * VW - VH * VH * heightScale);
  const theta    = Math.atan(tanTheta);
  const thetaDeg = theta * 180 / Math.PI;
  const bw           = VW * Math.cos(theta) + VH * Math.sin(theta);
  const paletteScale = VW / bw;
  // Rotate around palette centre (VW/2, VH/2), then place at viewBox centre
  const paletteTransform =
    `translate(${VW / 2},${viewHeight / 2}) scale(${paletteScale}) rotate(${thetaDeg}) translate(${-VW / 2},${-VH / 2})`;

  // Prompts in a 3+ component suppress their individual bridge lines
  const inPolygonGroup = new Set(
    components.filter(c => c.length >= 3).flatMap(c => c)
  );

  const colorGroupData = components
    .filter(comp => comp.length >= 3)
    .map((comp, gi) => {
      const pts = comp.map(idx => ({
        ...(positions[idx] ?? defaultPalettePos(idx, prompts.length)),
        color: prompts[idx]?.color ?? '#ffffff',
      }));
      const hull = convexHull(pts);
      // Expand edges by DOT_R but clamp each corner to DOT_R from its original vertex
      const rawExpanded = expandConvexHull(hull, DOT_R);
      const expandedHull = rawExpanded.map((ep, i) => {
        const op = hull[i];
        const dx = ep.x - op.x;
        const dy = ep.y - op.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= DOT_R) return ep;
        return { x: op.x + (dx / dist) * DOT_R, y: op.y + (dy / dist) * DOT_R };
      });
      // Equal radius for all blobs so no single color dominates
      const blobR = Math.max(...pts.flatMap((p, j) =>
        pts.filter((_, jj) => jj !== j).map(o => Math.sqrt((o.x - p.x) ** 2 + (o.y - p.y) ** 2))
      ));
      const blobs = pts.map((p, j) => ({ j, x: p.x, y: p.y, color: p.color, r: blobR }));
      return { gi, hull: expandedHull, blobs, members: comp };
    });

  const renderDot = (i, prompt, pos, highlighted) => (
    <g
      key={i}
      transform={`translate(${pos.x},${pos.y})`}
      onMouseDown={(e) => handleDotMouseDown(i, e)}
      onMouseEnter={() => !fixed && setHoveredDot(i)}
      onMouseLeave={() => setHoveredDot(null)}
      onClick={(e) => {
        e.stopPropagation();
        const md = mousedownPosRef.current;
        if (md && Math.hypot(e.clientX - md.x, e.clientY - md.y) > 4) return;
        if (fixed) return;
        if (selectedDot !== null && selectedDot !== i) {
          const existingIdx = links.findIndex(l => (l.a === selectedDot && l.b === i) || (l.a === i && l.b === selectedDot));
          if (existingIdx >= 0) {
            setLinks(prev => prev.filter((_, idx) => idx !== existingIdx));
          } else if (components.some(c => c.includes(selectedDot) && c.includes(i))) {
            setLinks(prev => prev.filter(l => l.a !== selectedDot && l.b !== selectedDot));
          } else {
            setLinks(prev => [...prev, { a: selectedDot, b: i }]);
          }
          setSelectedDot(null);
          setMousePos(null);
        } else {
          setSelectedDot(i);
          setTopDot(i);
        }
      }}
      style={{ cursor: fixed ? 'default' : 'grab' }}
    >
      {highlighted && (
        <circle r={DOT_R + 2} fill="none"
          stroke={(isDebridge || isAlreadyGrouped) && (i === selectedDot || i === hoveredDot) ? '#f87171' : '#4ade80'}
          strokeWidth="2.5" opacity="1" style={{ pointerEvents: 'none' }} />
      )}
      <circle r={DOT_R} fill={prompt.color} filter="url(#dot-shadow)" />
      <text textAnchor="middle" dominantBaseline="central" fill="white" fontSize="11" fontWeight="700"
        style={{ pointerEvents: 'none' }}>
        {i + 1}
      </text>
    </g>
  );

  return (
    <section className="panel prompt-palette-panel" ref={panelRef}>
      <div className="prompt-palette-header">
        <label className="field-label">Prompt Palette</label>
        <div className="palette-fix-toggle">
          <button className={`palette-fix-btn${fixed ? ' active' : ''}`} onClick={() => { setFixed(true); setSelectedDot(null); setHoveredDot(null); setMousePos(null); }}>Fixed</button>
          <button className={`palette-fix-btn${!fixed ? ' active' : ''}`} onClick={() => { setFixed(false); setSelectedDot(null); setHoveredDot(null); setMousePos(null); }}>Edit</button>
        </div>
      </div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VW} ${viewHeight}`}
        className="prompt-palette-svg"
        style={{ userSelect: 'none', overflow: 'visible' }}
        onClick={(e) => {
          const md = mousedownPosRef.current;
          if (md && Math.hypot(e.clientX - md.x, e.clientY - md.y) > 4) return;
          if (!fixed) setSelectedDot(null);
        }}
        onMouseMove={(e) => {
          if (fixed || selectedDot === null) return;
          setMousePos(toSVGCoords(e.clientX, e.clientY));
        }}
        onMouseLeave={() => setMousePos(null)}
      >
        <defs>
          <filter id="dot-shadow" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="2" stdDeviation="2.5" floodOpacity="0.45" />
          </filter>
          {links.map((link, idx) => {
            if (inPolygonGroup.has(link.a)) return null;
            const posA = positions[link.a] ?? defaultPalettePos(link.a, prompts.length);
            const posB = positions[link.b] ?? defaultPalettePos(link.b, prompts.length);
            return (
              <linearGradient key={idx} id={`link-grad-${idx}`} gradientUnits="userSpaceOnUse"
                x1={posA.x} y1={posA.y} x2={posB.x} y2={posB.y}>
                <stop offset="0%" stopColor={prompts[link.a]?.color ?? '#fff'} />
                <stop offset="100%" stopColor={prompts[link.b]?.color ?? '#fff'} />
              </linearGradient>
            );
          })}
          {colorGroupData.map(({ gi, hull, blobs }) => (
            <React.Fragment key={`cg-defs-${gi}`}>
              <clipPath id={`hull-clip-${gi}`}>
                <polygon points={hull.map(p => `${p.x},${p.y}`).join(' ')} />
              </clipPath>
              {blobs.map(({ j, x, y, color, r }) => (
                <radialGradient key={`blob-grad-${gi}-${j}`} id={`blob-grad-${gi}-${j}`}
                  gradientUnits="userSpaceOnUse" cx={x} cy={y} r={r}>
                  <stop offset="0%" stopColor={color} stopOpacity="1" />
                  <stop offset="100%" stopColor={color} stopOpacity="0" />
                </radialGradient>
              ))}
            </React.Fragment>
          ))}
        </defs>

        <g transform={paletteTransform}>
          <path d={PALETTE_PATH} className="palette-surface" />
          <ellipse cx="32" cy="52" rx="14" ry="19" className="palette-thumb-hole" />
        </g>

        {/* Groups (fill + dots) sorted so the active group renders last (on top) */}
        {[...colorGroupData]
          .sort((a, b) => {
            const aActive = topDot !== null && a.members.includes(topDot);
            const bActive = topDot !== null && b.members.includes(topDot);
            return aActive ? 1 : bActive ? -1 : 0;
          })
          .map(({ gi, hull, blobs, members }) => {
            const topInGroup = topDot !== null && members.includes(topDot);
            return (
              <g key={`group-${gi}`}>
                <g clipPath={`url(#hull-clip-${gi})`} style={{ pointerEvents: 'none' }}>
                  {blobs.map(({ j, x, y, r }) => (
                    <circle key={`blob-${gi}-${j}`} cx={x} cy={y} r={r} fill={`url(#blob-grad-${gi}-${j})`} />
                  ))}
                </g>
                {members.filter(i => i !== topDot).map(i => {
                  const prompt = prompts[i];
                  if (!prompt) return null;
                  const pos = positions[i] ?? defaultPalettePos(i, prompts.length);
                  const highlighted = !fixed && (hoveredDot === i || selectedDot === i);
                  return renderDot(i, prompt, pos, highlighted);
                })}
                {topInGroup && (() => {
                  const prompt = prompts[topDot];
                  if (!prompt) return null;
                  const pos = positions[topDot] ?? defaultPalettePos(topDot, prompts.length);
                  const highlighted = !fixed && (hoveredDot === topDot || selectedDot === topDot);
                  return renderDot(topDot, prompt, pos, highlighted);
                })()}
              </g>
            );
          })}

        {/* Standalone bridges (2-member connections) */}
        {links.map((link, idx) => {
          if (inPolygonGroup.has(link.a)) return null;
          const posA = positions[link.a] ?? defaultPalettePos(link.a, prompts.length);
          const posB = positions[link.b] ?? defaultPalettePos(link.b, prompts.length);
          const dx = posB.x - posA.x;
          const dy = posB.y - posA.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < DOT_R * 2) return null;
          return (
            <g key={idx} style={{ pointerEvents: 'none' }}>
              <line x1={posA.x} y1={posA.y} x2={posB.x} y2={posB.y}
                stroke="#000" strokeWidth={DOT_R * 2 + 1.5} strokeLinecap="butt" />
              <line x1={posA.x} y1={posA.y} x2={posB.x} y2={posB.y}
                stroke={`url(#link-grad-${idx})`} strokeWidth={DOT_R * 2} strokeLinecap="butt" />
            </g>
          );
        })}

        {/* Standalone dots (not in any 3+ group) — topDot rendered last */}
        {prompts.map((prompt, i) => {
          if (inPolygonGroup.has(i)) return null;
          if (i === topDot) return null;
          const pos = positions[i] ?? defaultPalettePos(i, prompts.length);
          const highlighted = !fixed && (hoveredDot === i || selectedDot === i);
          return renderDot(i, prompt, pos, highlighted);
        })}
        {topDot !== null && !inPolygonGroup.has(topDot) && (() => {
          const prompt = prompts[topDot];
          if (!prompt) return null;
          const pos = positions[topDot] ?? defaultPalettePos(topDot, prompts.length);
          const highlighted = !fixed && (hoveredDot === topDot || selectedDot === topDot);
          return renderDot(topDot, prompt, pos, highlighted);
        })()}

        {mousePos && selectedDot !== null && (() => {
          const from = positions[selectedDot] ?? defaultPalettePos(selectedDot, prompts.length);
          let toX = mousePos.x;
          let toY = mousePos.y;
          if (hoveredDot !== null && hoveredDot !== selectedDot) {
            const hPos = positions[hoveredDot] ?? defaultPalettePos(hoveredDot, prompts.length);
            toX = hPos.x;
            toY = hPos.y;
          }
          const dx = toX - from.x;
          const dy = toY - from.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const startR = DOT_R + 2;
          const endR = hoveredDot !== null && hoveredDot !== selectedDot ? DOT_R + 2 : 0;
          if (dist < startR + endR) return null;
          const nx = dx / dist;
          const ny = dy / dist;
          const isFreeEnd = hoveredDot === null || hoveredDot === selectedDot;
          const color = (isDebridge || isAlreadyGrouped) ? '#f87171' : '#4ade80';
          const x1 = from.x + nx * startR;
          const y1 = from.y + ny * startR;
          const x2 = toX - nx * endR;
          const y2 = toY - ny * endR;
          const midX = (x1 + x2) / 2;
          const midY = (y1 + y2) / 2;
          const gap = 16;
          return (
            <g style={{ pointerEvents: 'none' }}>
              {(isDebridge || isAlreadyGrouped) ? (
                <>
                  <line x1={x1} y1={y1} x2={midX - nx * gap} y2={midY - ny * gap}
                    stroke={color} strokeWidth="9" strokeLinecap="butt" />
                  <circle cx={midX - nx * gap} cy={midY - ny * gap} r={4.5} fill={color} />
                  <line x1={midX + nx * gap} y1={midY + ny * gap} x2={x2} y2={y2}
                    stroke={color} strokeWidth="9" strokeLinecap="butt" />
                  <circle cx={midX + nx * gap} cy={midY + ny * gap} r={4.5} fill={color} />
                  <text x={midX} y={midY} textAnchor="middle" dominantBaseline="central"
                    fill="#f87171" fontSize="12" fontWeight="900">✕</text>
                </>
              ) : (
                <line x1={x1} y1={y1} x2={x2} y2={y2}
                  stroke={color} strokeWidth="9" strokeLinecap="butt" />
              )}
              {isFreeEnd && (
                <circle cx={toX} cy={toY} r={4.5} fill={color} opacity="1" />
              )}
            </g>
          );
        })()}

        {/* Cursor — always on top, draggable in any mode */}
        <g
          transform={`translate(${cursorPos.x},${cursorPos.y})`}
          onMouseDown={handleCursorMouseDown}
          onClick={e => e.stopPropagation()}
          style={{ cursor: 'crosshair' }}
        >
          <circle r={9} fill="white" fillOpacity="0.92" stroke="#111" strokeWidth="2" />
          <line x1={-5} y1={0} x2={5} y2={0} stroke="#111" strokeWidth="1.5" strokeLinecap="round" />
          <line x1={0} y1={-5} x2={0} y2={5} stroke="#111" strokeWidth="1.5" strokeLinecap="round" />
        </g>
      </svg>

      <div className="palette-resize-handle" onMouseDown={handleResizeMouseDown} />
    </section>
  );
}

function PromptCompositionPanel({ prompts, weights }) {
  const hasSelection = weights.some(w => w > 0.001);
  return (
    <section className="panel">
      <label className="field-label">Prompt Composition</label>
      {hasSelection ? (
        <div className="prompt-makeup">
          {prompts.map((p, i) => {
            const pct = Math.round((weights[i] ?? 0) * 100);
            if (pct === 0) return null;
            return (
              <div key={i} className="prompt-makeup-row">
                <div className="prompt-color-dot" style={{ background: p.color }}>
                  <span className="prompt-color-dot-num">{i + 1}</span>
                </div>
                <div className="prompt-makeup-bar-track">
                  <div className="prompt-makeup-bar-fill" style={{ width: `${pct}%`, background: p.color }} />
                </div>
                <span className="prompt-makeup-pct">{pct}%</span>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="hint-text">Place the cursor on a prompt dot or a mix to see its composition.</p>
      )}
    </section>
  );
}

function DirectionalPanel({ params, set }) {
  return (
    <section className="panel">
      <label className="field-label">Base prompt</label>
      <textarea
        className="prompt-input"
        rows={3}
        placeholder="e.g. a red sphere"
        value={params.prompt || ''}
        onChange={e => set('prompt', e.target.value)}
      />

      <label className="field-label" style={{ marginTop: 10 }}>From concept</label>
      <input
        className="text-input"
        placeholder="e.g. matte"
        value={params.from_concept || ''}
        onChange={e => set('from_concept', e.target.value)}
      />

      <label className="field-label" style={{ marginTop: 10 }}>To concept</label>
      <input
        className="text-input"
        placeholder="e.g. glossy"
        value={params.to_concept || ''}
        onChange={e => set('to_concept', e.target.value)}
      />

      <div className="slider-row" style={{ marginTop: 14 }}>
        <label className="field-label">
          Scale — <span className="slider-value">{(params.scale || 1).toFixed(1)}×</span>
        </label>
        <input
          type="range" min={0} max={3} step={0.1}
          value={params.scale || 1}
          onChange={e => set('scale', parseFloat(e.target.value))}
          className="slider"
          style={sliderBg(params.scale || 1, 0, 3)}
        />
      </div>
    </section>
  );
}

function StencilPanel({ params, set, brushRadius, onBrushRadiusChange }) {
  return (
    <section className="panel">
      <label className="field-label">Region A prompt (unpainted)</label>
      <textarea
        className="prompt-input"
        rows={3}
        placeholder="e.g. a sunny meadow"
        value={params.prompt_a || ''}
        onChange={e => set('prompt_a', e.target.value)}
      />

      <label className="field-label" style={{ marginTop: 10 }}>Region B prompt (painted)</label>
      <textarea
        className="prompt-input"
        rows={3}
        placeholder="e.g. a dark forest"
        value={params.prompt_b || ''}
        onChange={e => set('prompt_b', e.target.value)}
      />

      <div className="slider-row" style={{ marginTop: 14 }}>
        <label className="field-label">
          Brush radius — <span className="slider-value">{brushRadius}px</span>
        </label>
        <input
          type="range" min={5} max={80} step={1}
          value={brushRadius}
          onChange={e => onBrushRadiusChange(parseInt(e.target.value))}
          className="slider"
          style={sliderBg(brushRadius, 5, 80)}
        />
      </div>

      <p className="hint-text" style={{ marginTop: 10 }}>
        Paint on the canvas to define region B, then generate.
      </p>
    </section>
  );
}

function InterventionPanel({ params, set, generating, onIntervene, step, totalSteps }) {
  return (
    <section className="panel">
      <label className="field-label">Starting prompt</label>
      <textarea
        className="prompt-input"
        rows={3}
        placeholder="Initial concept..."
        value={params.prompt || ''}
        onChange={e => set('prompt', e.target.value)}
      />

      <label className="field-label" style={{ marginTop: 10 }}>Intervention prompt</label>
      <textarea
        className="prompt-input"
        rows={3}
        placeholder="Swap to this mid-generation..."
        value={params.intervention_prompt || ''}
        onChange={e => set('intervention_prompt', e.target.value)}
      />

      <div className="slider-row" style={{ marginTop: 14 }}>
        <label className="field-label">
          Auto-switch at step — <span className="slider-value">{params.intervention_step || 15}</span>
        </label>
        <input
          type="range" min={1} max={params.steps || 20} step={1}
          value={params.intervention_step || 15}
          onChange={e => set('intervention_step', parseInt(e.target.value))}
          className="slider"
          style={sliderBg(params.intervention_step || 15, 1, params.steps || 20)}
        />
      </div>

      {generating && (
        <button
          className="btn-intervene"
          onClick={onIntervene}
          style={{ marginTop: 12 }}
        >
          Intervene now (step {step})
        </button>
      )}
    </section>
  );
}

function SharedParams({ params, set }) {
  return (
    <section className="panel panel-settings">
      <label className="field-label" style={{ marginBottom: 6 }}>Generation settings</label>
      <div className="sliders-grid">
        <div className="slider-row">
          <label className="field-label">
            Steps — <span className="slider-value">{params.steps || 20}</span>
          </label>
          <input
            type="range" min={10} max={50} step={1}
            value={params.steps || 20}
            onChange={e => set('steps', parseInt(e.target.value))}
            className="slider"
            style={sliderBg(params.steps || 20, 10, 50)}
          />
        </div>
        <div className="slider-row">
          <label className="field-label">
            Guide scale — <span className="slider-value">{params.guide_scale ?? 7}</span>
          </label>
          <input
            type="range" min={1} max={15} step={0.5}
            value={params.guide_scale ?? 7}
            onChange={e => set('guide_scale', parseFloat(e.target.value))}
            className="slider"
            style={sliderBg(params.guide_scale ?? 7, 1, 15)}
          />
        </div>
        <div className="slider-row">
          <label className="field-label">
            Single stroke — <span className="slider-value">{params.single_stroke ?? 20}%</span>
          </label>
          <input
            type="range" min={10} max={100} step={10}
            value={params.single_stroke ?? 20}
            onChange={e => set('single_stroke', parseInt(e.target.value))}
            className="slider"
            style={sliderBg(params.single_stroke ?? 20, 10, 100)}
          />
        </div>
        <div className="slider-row">
          <label className="field-label">
            Overcoat — <span className="slider-value">{params.overcoat ?? 70}%</span>
          </label>
          <input
            type="range" min={0} max={100} step={5}
            value={params.overcoat ?? 70}
            onChange={e => set('overcoat', parseInt(e.target.value))}
            className="slider"
            style={sliderBg(params.overcoat ?? 70, 0, 100)}
          />
        </div>
      </div>
    </section>
  );
}


