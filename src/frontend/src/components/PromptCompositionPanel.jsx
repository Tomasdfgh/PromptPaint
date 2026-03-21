import React from 'react';

function PromptCompositionPanel({ prompts, weights, directionalPrompts }) {
  const hasSelection = weights.some(w => w > 0.001);
  const visibleCount = weights.filter(w => Math.round(w * 100) > 0).length;
  const activeDirectional = (directionalPrompts || []).filter(
    d => d.from?.trim() && d.to?.trim() && d.scale !== 0
  );

  return (
    <section className="panel">
      <label className="field-label">Prompt Composition</label>
      {hasSelection ? (
        <div className="prompt-makeup">
          {prompts.map((p, i) => {
            const pct = Math.round((weights[i] ?? 0) * 100);
            if (pct === 0) return null;
            return (
              <div key={i} className="prompt-makeup-row" style={visibleCount === 1 ? { gridColumn: '1 / -1' } : undefined}>
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

      {activeDirectional.length > 0 && (
        <div className="directional-summary">
          {activeDirectional.map((d, i) => (
            <div key={i} className="directional-summary-row">
              <span className="directional-summary-from">{d.from}</span>
              <svg viewBox="0 0 16 16" fill="none" className="directional-summary-arrow" style={{ opacity: Math.abs(d.scale) / 3 }}>
                <path d={d.scale >= 0 ? 'M3 8h10M9 4l4 4-4 4' : 'M13 8H3M7 4L3 8l4 4'} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span className="directional-summary-to">{d.to}</span>
              <span className="directional-summary-scale">{d.scale > 0 ? '+' : ''}{d.scale.toFixed(1)}×</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export default PromptCompositionPanel;
