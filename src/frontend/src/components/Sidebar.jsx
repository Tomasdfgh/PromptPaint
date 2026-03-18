import { useState } from 'react';

const MODES = [
  { id: 'standard',     label: 'Standard'     },
  { id: 'mixing',       label: 'Mixing'        },
  { id: 'directional',  label: 'Directional'   },
  { id: 'stencil',      label: 'Stencil'       },
  { id: 'intervention', label: 'Intervention'  },
];

export default function Sidebar({
  mode, onModeChange,
  params, onParamsChange,
  onGenerate, onIntervene, onCancel,
  generating, step, totalSteps,
  brushRadius, onBrushRadiusChange,
}) {
  const set = (key, val) => onParamsChange({ ...params, [key]: val });

  return (
    <aside className="sidebar">

      {/* Mode tabs */}
      <div className="mode-tabs">
        {MODES.map(m => (
          <button
            key={m.id}
            className={`mode-tab ${mode === m.id ? 'active' : ''}`}
            onClick={() => onModeChange(m.id)}
            disabled={generating}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Mode-specific panels */}
      <div className="panels">

        {mode === 'standard' && (
          <StandardPanel params={params} set={set} />
        )}

        {mode === 'mixing' && (
          <MixingPanel params={params} set={set} />
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

        {/* Shared generation params */}
        <SharedParams params={params} set={set} />

        {/* Progress bar */}
        {generating && (
          <div className="progress-section">
            <div className="progress-bar-track">
              <div
                className="progress-bar-fill"
                style={{ width: totalSteps > 0 ? `${(step / totalSteps) * 100}%` : '0%' }}
              />
            </div>
            <span className="progress-label">{step} / {totalSteps} steps</span>
          </div>
        )}

        {/* Action buttons */}
        <div className="action-row">
          <button
            className="btn-generate"
            onClick={onGenerate}
            disabled={generating}
          >
            {generating ? 'Generating…' : 'Generate'}
          </button>
          {generating && (
            <button className="btn-cancel" onClick={onCancel}>Cancel</button>
          )}
        </div>
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Mode panels
// ---------------------------------------------------------------------------

function StandardPanel({ params, set }) {
  return (
    <section className="panel">
      <label className="field-label">Prompt</label>
      <textarea
        className="prompt-input"
        rows={4}
        placeholder="Describe what you want to generate..."
        value={params.prompt || ''}
        onChange={e => set('prompt', e.target.value)}
      />
      <label className="field-label" style={{ marginTop: 10 }}>Negative prompt</label>
      <textarea
        className="prompt-input"
        rows={2}
        placeholder="What to avoid..."
        value={params.negative_prompt || ''}
        onChange={e => set('negative_prompt', e.target.value)}
      />
    </section>
  );
}

function MixingPanel({ params, set }) {
  return (
    <section className="panel">
      <label className="field-label">Prompt A</label>
      <textarea
        className="prompt-input"
        rows={3}
        placeholder="First concept..."
        value={params.prompt_a || ''}
        onChange={e => set('prompt_a', e.target.value)}
      />

      <label className="field-label" style={{ marginTop: 10 }}>Prompt B</label>
      <textarea
        className="prompt-input"
        rows={3}
        placeholder="Second concept..."
        value={params.prompt_b || ''}
        onChange={e => set('prompt_b', e.target.value)}
      />

      <div className="slider-row" style={{ marginTop: 14 }}>
        <label className="field-label">
          Mix — <span className="slider-value">
            {Math.round((params.alpha || 0.5) * 100)}% B
          </span>
        </label>
        <input
          type="range" min={0} max={1} step={0.01}
          value={params.alpha || 0.5}
          onChange={e => set('alpha', parseFloat(e.target.value))}
          className="slider"
        />
        <div className="slider-ends">
          <span>{params.prompt_a ? params.prompt_a.split(' ')[0] : 'A'}</span>
          <span>{params.prompt_b ? params.prompt_b.split(' ')[0] : 'B'}</span>
        </div>
      </div>
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
          type="range" min={1} max={params.steps || 30} step={1}
          value={params.intervention_step || 15}
          onChange={e => set('intervention_step', parseInt(e.target.value))}
          className="slider"
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
  const [open, setOpen] = useState(false);
  return (
    <section className="panel">
      <button className="collapsible" onClick={() => setOpen(o => !o)}>
        Generation settings {open ? '▲' : '▼'}
      </button>
      {open && (
        <div className="collapsible-body">
          <div className="slider-row">
            <label className="field-label">
              Steps — <span className="slider-value">{params.steps || 30}</span>
            </label>
            <input
              type="range" min={10} max={50} step={1}
              value={params.steps || 30}
              onChange={e => set('steps', parseInt(e.target.value))}
              className="slider"
            />
          </div>
          <div className="slider-row" style={{ marginTop: 10 }}>
            <label className="field-label">
              CFG scale — <span className="slider-value">{(params.cfg_scale || 7.5).toFixed(1)}</span>
            </label>
            <input
              type="range" min={1} max={15} step={0.5}
              value={params.cfg_scale || 7.5}
              onChange={e => set('cfg_scale', parseFloat(e.target.value))}
              className="slider"
            />
          </div>
          <div className="slider-row" style={{ marginTop: 10 }}>
            <label className="field-label">
              Preview every — <span className="slider-value">{params.preview_every || 5} steps</span>
            </label>
            <input
              type="range" min={1} max={10} step={1}
              value={params.preview_every || 5}
              onChange={e => set('preview_every', parseInt(e.target.value))}
              className="slider"
            />
          </div>
        </div>
      )}
    </section>
  );
}
