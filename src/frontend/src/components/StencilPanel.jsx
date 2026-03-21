import React from 'react';
import { sliderBg } from './sidebarUtils';

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

export default StencilPanel;
