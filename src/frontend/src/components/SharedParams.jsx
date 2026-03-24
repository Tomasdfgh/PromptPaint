import React, { useState } from 'react';
import { sliderBg } from './sidebarUtils';

function GenerationSettingsTutorial({ onClose }) {
  const steps = [
    {
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
        </svg>
      ),
      title: 'Steps',
      desc: 'How many denoising steps the model takes. More steps means more refined, detailed output but slower generation. Fewer steps means faster but rougher results. 30–50 is a good range for most cases.',
    },
    {
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
        </svg>
      ),
      title: 'Guide Scale',
      desc: 'How strictly the model follows your prompt. Higher means more faithful to the prompt, more vivid but less varied. Lower means more creative and loose but may drift from what you asked for. 7 is a good default.',
    },
    {
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 21v-4a4 4 0 1 1 4 4H3z"/><path d="M15 7l-6.5 6.5a1.5 1.5 0 0 0 3 3L18 10a1.5 1.5 0 0 0-3-3z"/>
        </svg>
      ),
      title: 'Single Stroke',
      desc: 'What percentage of total steps are shown as a live preview in one painting round. Lower means more frequent previews, useful for watching the image build up. Higher means fewer interruptions and a faster path to the final result.',
    },
  ];

  return (
    <div className="palette-tutorial-overlay" onClick={onClose}>
      <div className="palette-tutorial" onClick={e => e.stopPropagation()}>
        <div className="palette-tutorial-header">
          <span className="palette-tutorial-title">Generation Settings</span>
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

function StencilTutorial({ onClose }) {
  const steps = [
    {
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 21v-4a4 4 0 1 1 4 4H3z"/><path d="M15 7l-6.5 6.5a1.5 1.5 0 0 0 3 3L18 10a1.5 1.5 0 0 0-3-3z"/>
        </svg>
      ),
      title: 'How Stencil Works',
      desc: 'Turn stencil on and brush over a region of the canvas. Generation will only apply to that painted area and the rest of the image stays untouched. Think of it like masking off a section before painting.',
    },
    {
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/>
        </svg>
      ),
      title: 'Brush Radius',
      desc: 'Controls the size of the stencil brush. Larger radius covers more area with each stroke. Smaller radius gives more precise, detailed masking.',
    },
    {
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
        </svg>
      ),
      title: 'Overcoat',
      desc: 'Controls how much the stenciled region diverges from the existing image. Low overcoat means the model anchors to the original for most of generation then only applies the new prompt in the final steps, so the result stays visually close to what was there. High overcoat gives the new prompt more freedom over the region, producing more dramatic changes.',
    },
    {
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
        </svg>
      ),
      title: 'Tip: Combine with the Scrub Bar',
      desc: 'After a stencil generation, you can scrub back to an earlier step and resume with a different prompt. This lets you experiment with what gets painted onto the region without having to redraw your stencil.',
    },
  ];

  return (
    <div className="palette-tutorial-overlay" onClick={onClose}>
      <div className="palette-tutorial" onClick={e => e.stopPropagation()}>
        <div className="palette-tutorial-header">
          <span className="palette-tutorial-title">Stencil Mode</span>
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

function SharedParams({ params, set, brushRadius, onBrushRadiusChange, stencilActive, onStencilActiveChange, generating }) {
  const [showTutorial, setShowTutorial] = useState(false);
  const [showStencilTutorial, setShowStencilTutorial] = useState(false);
  const disabledStyle = generating ? { opacity: 0.4, pointerEvents: 'none' } : {};
  return (
    <section className="panel panel-settings">
      {showTutorial && <GenerationSettingsTutorial onClose={() => setShowTutorial(false)} />}
      {showStencilTutorial && <StencilTutorial onClose={() => setShowStencilTutorial(false)} />}
      <div className="palette-label-row" style={{ marginBottom: 6 }}>
        <label className="field-label">Generation settings</label>
        <button className="palette-info-btn" onClick={() => setShowTutorial(true)} aria-label="About generation settings">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="8" cy="8" r="7"/>
            <line x1="8" y1="7" x2="8" y2="11"/>
            <circle cx="8" cy="4.5" r="0.5" fill="currentColor" stroke="none"/>
          </svg>
        </button>
      </div>
      <div className="sliders-grid" style={disabledStyle}>
        <div className="slider-row">
          <label className="field-label">
            Steps:<span className="slider-value">{params.steps || 40}</span>
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
            Guide scale:<span className="slider-value">{params.guide_scale ?? 7}</span>
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
            Single stroke:<span className="slider-value">{params.single_stroke ?? 20}%</span>
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <label className="field-label">Stencil</label>
          <button className="palette-info-btn" onClick={() => setShowStencilTutorial(true)} aria-label="About stencil mode">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="8" cy="8" r="7"/>
              <line x1="8" y1="7" x2="8" y2="11"/>
              <circle cx="8" cy="4.5" r="0.5" fill="currentColor" stroke="none"/>
            </svg>
          </button>
        </div>
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
            Brush radius:<span className="slider-value">{brushRadius}px</span>
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
            Overcoat:<span className="slider-value">{params.overcoat ?? 100}%</span>
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
