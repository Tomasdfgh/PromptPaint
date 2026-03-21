import React from 'react';
import { sliderBg } from './sidebarUtils';

function DirectionalPromptsPanel({ params, set }) {
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
      <div className="prompt-list-header">
        <label className="field-label">Directional Prompts</label>
        {dirPrompts.length < 3
          ? <button className="btn-add-prompt" onClick={add}>+ Add Prompt</button>
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
              />
              <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>→</span>
              <input
                className="text-input"
                placeholder="To…"
                value={d.to}
                onChange={e => { if (e.target.value.length <= 30) update(i, 'to', e.target.value); }}
                style={{ flex: 1, fontSize: 11, padding: '3px 6px' }}
              />
              {multi && (
                <button
                  onClick={() => remove(i)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 12, padding: '0 2px', lineHeight: 1 }}
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
