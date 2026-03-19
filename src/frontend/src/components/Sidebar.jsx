
import { useRef, useState, useEffect, useCallback } from 'react';

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

const MODES = [
  { id: 'standard',     label: 'Standard'     },
  { id: 'directional',  label: 'Directional'   },
  { id: 'stencil',      label: 'Stencil'       },
  { id: 'intervention', label: 'Intervention'  },
];

export default function Sidebar({
  mode, onModeChange,
  params, onParamsChange,
  onGenerate, onIntervene, onCancel,
  generating, queuePos, step, totalSteps,
  brushRadius, onBrushRadiusChange,
}) {
  const set = (key, val) => onParamsChange({ ...params, [key]: val });

  return (
    <aside className="sidebar">

      {/* Mode-specific panels */}
      <div className="panels">

        {mode === 'standard' && (
          <PromptListPanel params={params} set={set} />
        )}

        {mode === 'standard' && (
          <PromptPalette prompts={
            params.prompts?.length > 0 ? params.prompts : [{ text: '', color: promptHue(0), weight: 1 }]
          } />
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

        {/* Generate area: hover reveals settings above the button */}
        <div className="generate-area">
          <SharedParams params={params} set={set} />

          {/* Action buttons */}
          <div className="action-row">
          <button
            className="btn-generate"
            onClick={onGenerate}
            disabled={generating}
          >
            {queuePos ? (
            `Queued (${queuePos})`
          ) : generating ? (
            'Generating…'
          ) : (
            <>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 15, height: 15, marginRight: 6, verticalAlign: 'middle', display: 'inline' }}>
                <path d="M12 19l7-7 3 3-7 7-3-3z"/>
                <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/>
                <path d="M2 2l11.5 11.5"/>
                <circle cx="11" cy="11" r="2" fill="currentColor" stroke="none"/>
              </svg>
              Paint
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

function ColorPicker({ color, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const hue = hexToHue(color);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="color-swatch-wrap" ref={ref}>
      <div
        className="prompt-color-dot"
        style={{ background: color }}
        onClick={() => setOpen(o => !o)}
      />
      {open && (
        <div className="color-swatch-popover">
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
  }, [prompt.text]);

  useEffect(() => {
    if (editing) textareaRef.current?.focus();
  }, [editing]);

  const wordCount = prompt.text.trim() ? prompt.text.trim().split(/\s+/).filter(Boolean).length : 0;

  return (
    <div className="prompt-list-row">
      <div className="prompt-list-row-main">
        <ColorPicker color={prompt.color} onChange={c => onUpdate('color', c)} />

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
            style={{ borderColor: prompt.color + '66' }}
          />
          {wordCount > 0 && <span className="prompt-word-count">{wordCount}/30</span>}
        </div>

        {showRemove && (
          <button className="btn-small prompt-remove-btn" onClick={onRemove}>✕</button>
        )}
      </div>

      {showWeight && (
        <div className="prompt-weight-row">
          <span className="prompt-weight-pct">
            {totalWeight > 0 ? Math.round(((prompt.weight ?? 1) / totalWeight) * 100) : 0}%
          </span>
          <input
            type="range" min={0} max={10} step={0.1}
            value={prompt.weight ?? 1}
            onChange={e => onUpdate('weight', parseFloat(e.target.value))}
            className="slider"
            style={sliderBg(prompt.weight ?? 1, 0, 10)}
          />
        </div>
      )}
    </div>
  );
}

function PromptListPanel({ params, set }) {
  const prompts = params.prompts?.length > 0
    ? params.prompts
    : [{ text: '', color: promptHue(0), weight: 1 }];

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
      <label className="field-label">
        {multiPrompt ? 'Prompt Mixing' : 'Prompt'}
      </label>
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
      <button className="btn-add-prompt" onClick={addPrompt}>+ Add prompt</button>
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

function PromptPalette({ prompts }) {
  const svgRef    = useRef(null);
  const panelRef  = useRef(null);
  const dotDragRef    = useRef(null);
  const heightScaleRef = useRef(1.0);

  const [heightScale, setHeightScaleState] = useState(1.0);
  const [positions, setPositions] = useState(() =>
    prompts.map((_, i) => defaultPalettePos(i, prompts.length))
  );

  const setHeightScale = (v) => {
    heightScaleRef.current = v;
    setHeightScaleState(v);
  };

  useEffect(() => {
    setPositions(prev =>
      prompts.map((_, i) => prev[i] ?? defaultPalettePos(i, prompts.length))
    );
  }, [prompts.length]);

  const toSVGCoords = useCallback((clientX, clientY) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  }, []);

  const handleDotMouseDown = useCallback((index, e) => {
    e.preventDefault();
    dotDragRef.current = index;

    const onMove = (me) => {
      if (dotDragRef.current === null) return;
      const { x, y } = toSVGCoords(me.clientX, me.clientY);
      setPositions(prev => prev.map((p, i) =>
        i === dotDragRef.current
          ? { x: Math.min(Math.max(DOT_R, x), VW - DOT_R),
              y: Math.min(Math.max(DOT_R, y), VH - DOT_R) }
          : p
      ));
    };

    const onUp = () => {
      dotDragRef.current = null;
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

  const viewHeight = Math.round(VH * heightScale);

  return (
    <section className="panel prompt-palette-panel" ref={panelRef}>
      <label className="field-label">Palette</label>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VW} ${viewHeight}`}
        className="prompt-palette-svg"
        style={{ userSelect: 'none', overflow: 'visible' }}
      >
        <defs>
          <filter id="dot-shadow" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="2" stdDeviation="2.5" floodOpacity="0.45" />
          </filter>
        </defs>

        <path d={PALETTE_PATH} className="palette-surface" />
        <ellipse cx="32" cy="52" rx="14" ry="19" className="palette-thumb-hole" />

        {prompts.map((prompt, i) => {
          const pos = positions[i] ?? defaultPalettePos(i, prompts.length);
          return (
            <g
              key={i}
              transform={`translate(${pos.x},${pos.y})`}
              onMouseDown={(e) => handleDotMouseDown(i, e)}
              style={{ cursor: 'grab' }}
            >
              <circle r={DOT_R} fill={prompt.color} filter="url(#dot-shadow)" />
              <circle r={DOT_R * 0.55} cx={-DOT_R * 0.25} cy={-DOT_R * 0.3}
                fill="rgba(255,255,255,0.22)" style={{ pointerEvents: 'none' }} />
              <text
                textAnchor="middle"
                dominantBaseline="central"
                fill="white"
                fontSize="11"
                fontWeight="700"
                style={{ pointerEvents: 'none' }}
              >
                {i + 1}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="palette-resize-handle" onMouseDown={handleResizeMouseDown} />
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


