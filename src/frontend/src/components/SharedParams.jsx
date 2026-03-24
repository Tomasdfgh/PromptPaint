import React from 'react';
import { sliderBg } from './sidebarUtils';

function SharedParams({ params, set, brushRadius, onBrushRadiusChange, stencilActive, onStencilActiveChange, generating }) {
  const disabledStyle = generating ? { opacity: 0.4, pointerEvents: 'none' } : {};
  return (
    <section className="panel panel-settings">
      <label className="field-label" style={{ marginBottom: 6 }}>Generation settings</label>
      <div className="sliders-grid" style={disabledStyle}>
        <div className="slider-row">
          <label className="field-label">
            Steps — <span className="slider-value">{params.steps || 40}</span>
          </label>
          <input
            type="range" min={10} max={80} step={1}
            value={params.steps || 40}
            onChange={e => set('steps', parseInt(e.target.value))}
            className="slider"
            style={sliderBg(params.steps || 40, 10, 80)}
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
      </div>

      <div className="settings-divider" />

      {/* Stencil controls */}
      <div className="stencil-settings-row">
        <label className="field-label">Stencil</label>
        <button
          type="button"
          className={`stencil-toggle-btn${stencilActive ? ' active' : ''}`}
          onClick={() => onStencilActiveChange(!stencilActive)}
          style={disabledStyle}
        >
          {stencilActive ? 'On' : 'Off'}
        </button>
      </div>

      <div className="sliders-grid" style={generating ? { opacity: 0.4, pointerEvents: 'none' } : !stencilActive ? { opacity: 0.35, pointerEvents: 'none' } : {}}>
        <div className="slider-row">
          <label className="field-label">
            Brush radius — <span className="slider-value">{brushRadius}px</span>
          </label>
          <input
            type="range" min={5} max={80} step={1}
            value={brushRadius}
            onChange={e => onBrushRadiusChange(parseInt(e.target.value))}
            className="slider"
            style={sliderBg(brushRadius, 5, 80)}
            disabled={!stencilActive}
          />
        </div>
        <div className="slider-row">
          <label className="field-label">
            Overcoat — <span className="slider-value">{params.overcoat ?? 100}%</span>
          </label>
          <input
            type="range" min={0} max={100} step={5}
            value={params.overcoat ?? 100}
            onChange={e => set('overcoat', parseInt(e.target.value))}
            className="slider"
            style={sliderBg(params.overcoat ?? 100, 0, 100)}
            disabled={!stencilActive}
          />
        </div>
      </div>
    </section>
  );
}

export default SharedParams;
