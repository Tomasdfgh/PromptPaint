import React, { useState } from 'react';
import { sliderBg } from './sidebarUtils';

function DirectionalTutorial({ onClose }) {
  const steps = [
    {
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
        </svg>
      ),
      title: 'Set the Direction',
      desc: 'Enter a "From" and "To" concept. This defines a direction in semantic space, like adding a new pigment that shifts your image toward "To" (e.g., matte → glossy).',
    },
    {
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <line x1="3" y1="12" x2="21" y2="12"/><circle cx="12" cy="12" r="3"/>
        </svg>
      ),
      title: 'Adjust the Scale',
      desc: 'Drag the slider to control the intensity. Positive values shift toward "To", negative values shift toward "From". Zero means no shift.',
    },
    {
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
      ),
      title: 'Stack Directions',
      desc: 'Click + Add to apply multiple directional shifts at once. Each one contributes independently, so you can layer several attributes simultaneously.',
    },
    {
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="6" cy="18" r="3"/><circle cx="18" cy="6" r="3"/><circle cx="18" cy="18" r="3"/><line x1="8.5" y1="15.5" x2="15.5" y2="8.5"/><line x1="15.5" y1="15.5" x2="8.5" y2="15.5"/>
        </svg>
      ),
      title: 'Combine with Mixing',
      desc: 'Directional prompts apply on top of your palette mix, letting you fine-tune attributes without changing your base composition. Active shifts are reflected in the Prompt Composition panel below.',
    },
  ];

  return (
    <div className="palette-tutorial-overlay" onClick={onClose}>
      <div className="palette-tutorial" onClick={e => e.stopPropagation()}>
        <div className="palette-tutorial-header">
          <span className="palette-tutorial-title">How to use Directional Prompts</span>
          <button className="palette-tutorial-close" onClick={onClose}>✕</button>
        </div>
        <div className="palette-tutorial-steps">
          {steps.map((s, i) => (
            <div key={i} className="palette-tutorial-step">
              <div className="palette-tutorial-icon">{s.icon}</div>
              <div>
                <div className="palette-tutorial-step-title">{s.title}</div>
                <div className="palette-tutorial-step-desc">{s.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function DirectionalPromptsPanel({ params, set, generating }) {
  const [showTutorial, setShowTutorial] = useState(false);

  const dirPrompts = params.directional_prompts?.length > 0
    ? params.directional_prompts
    : [{ from: '', to: '', scale: 1 }];

  const update = (i, field, val) =>
    set('directional_prompts', dirPrompts.map((d, idx) => idx === i ? { ...d, [field]: val } : d));

  const add = () =>
    set('directional_prompts', [...dirPrompts, { from: '', to: '', scale: 1 }]);

  const remove = (i) =>
    set('directional_prompts', dirPrompts.filter((_, idx) => idx !== i));

  const multi = dirPrompts.length > 1;

  return (
    <section className="panel prompt-list-panel">
      {showTutorial && <DirectionalTutorial onClose={() => setShowTutorial(false)} />}
      <div className="prompt-list-header">
        <div className="palette-label-row">
          <label className="field-label">Directional Prompts</label>
          <button className="palette-info-btn" onClick={() => setShowTutorial(true)} aria-label="How to use directional prompts">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="8" cy="8" r="7"/>
              <line x1="8" y1="7" x2="8" y2="11"/>
              <circle cx="8" cy="4.5" r="0.5" fill="currentColor" stroke="none"/>
            </svg>
          </button>
        </div>
        {dirPrompts.length < 3
          ? <button className="btn-add-prompt" onClick={add} disabled={generating}>+ Add</button>
          : <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>limit reached</span>
        }
      </div>

      <div className="prompt-list directional-list">
        {dirPrompts.map((d, i) => (
          <div key={i} style={{ marginBottom: multi ? 8 : 0 }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                className="text-input"
                placeholder="From…"
                value={d.from}
                onChange={e => { if (e.target.value.length <= 30) update(i, 'from', e.target.value); }}
                style={{ flex: 1, fontSize: 11, padding: '3px 6px' }}
                disabled={generating}
              />
              <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>→</span>
              <input
                className="text-input"
                placeholder="To…"
                value={d.to}
                onChange={e => { if (e.target.value.length <= 30) update(i, 'to', e.target.value); }}
                style={{ flex: 1, fontSize: 11, padding: '3px 6px' }}
                disabled={generating}
              />
              {multi && (
                <button
                  onClick={() => remove(i)}
                  disabled={generating}
                  style={{ background: 'none', border: 'none', cursor: generating ? 'default' : 'pointer', color: 'var(--text-muted)', fontSize: 12, padding: '0 2px', lineHeight: 1 }}
                >✕</button>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
              <input
                type="range" min={-3} max={3} step={0.1}
                value={d.scale}
                onChange={e => update(i, 'scale', parseFloat(e.target.value))}
                className="slider"
                style={{ ...sliderBg(d.scale, -3, 3), flex: 1 }}
                disabled={generating}
              />
              <span className="slider-value" style={{ whiteSpace: 'nowrap', fontSize: 11, width: 72, textAlign: 'right', flexShrink: 0 }}>
                {d.scale === 0
                  ? 'no shift'
                  : `→ ${d.scale < 0 ? 'From' : 'To'} ${Math.abs(d.scale).toFixed(1)}×`
                }
              </span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default DirectionalPromptsPanel;
