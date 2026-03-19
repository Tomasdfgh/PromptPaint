
const sliderBg = (val, min, max) => {
  const pct = Math.round(((val - min) / (max - min)) * 100);
  return {
    background: `linear-gradient(to right, var(--accent) ${pct}%, var(--border) ${pct}%)`,
  };
};

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
  generating, queuePos, step, totalSteps,
  brushRadius, onBrushRadiusChange,
}) {
  const set = (key, val) => onParamsChange({ ...params, [key]: val });

  return (
    <aside className="sidebar">

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

function StandardPanel({ params, set }) {
  return (
    <section className="panel">
      <label className="field-label">Prompt List</label>
      <textarea
        className="prompt-input"
        rows={4}
        placeholder="Describe what you want to generate..."
        value={params.prompt || ''}
        onChange={e => set('prompt', e.target.value)}
      />
    </section>
  );
}

const DEFAULT_PROMPTS = [
  { text: '', weight: 1 },
  { text: '', weight: 1 },
];

function MixingPanel({ params, set }) {
  const prompts = params.prompts || DEFAULT_PROMPTS;

  const updatePrompt = (i, field, value) => {
    const updated = prompts.map((p, idx) =>
      idx === i ? { ...p, [field]: value } : p
    );
    set('prompts', updated);
  };

  const addPrompt = () => set('prompts', [...prompts, { text: '', weight: 1 }]);

  const removePrompt = (i) => {
    if (prompts.length <= 2) return;
    set('prompts', prompts.filter((_, idx) => idx !== i));
  };

  const totalWeight = prompts.reduce((s, p) => s + (p.weight || 0), 0);

  return (
    <section className="panel">
      {prompts.map((p, i) => (
        <div key={i} style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <label className="field-label" style={{ margin: 0 }}>Prompt {i + 1}</label>
            {prompts.length > 2 && (
              <button className="btn-small" onClick={() => removePrompt(i)}>✕</button>
            )}
          </div>
          <textarea
            className="prompt-input"
            rows={2}
            placeholder={`Concept ${i + 1}...`}
            value={p.text}
            onChange={e => updatePrompt(i, 'text', e.target.value)}
          />
          <div className="slider-row" style={{ marginTop: 6 }}>
            <label className="field-label">
              Weight — <span className="slider-value">
                {totalWeight > 0 ? Math.round((p.weight / totalWeight) * 100) : 0}%
              </span>
            </label>
            <input
              type="range" min={0} max={10} step={0.1}
              value={p.weight}
              onChange={e => updatePrompt(i, 'weight', parseFloat(e.target.value))}
              className="slider"
              style={sliderBg(p.weight, 0, 10)}
            />
          </div>
        </div>
      ))}

      <button className="btn-add-prompt" onClick={addPrompt}>+ Add prompt</button>
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


