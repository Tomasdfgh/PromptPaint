import React from 'react';

function PromptCompositionPanel({ prompts, weights }) {
  const hasSelection = weights.some(w => w > 0.001);
  const visibleCount = weights.filter(w => Math.round(w * 100) > 0).length;
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
    </section>
  );
}

export default PromptCompositionPanel;
