import React from 'react';

function ScrubBar({ step, totalSteps, generating, stepPreviews, resumeStep, onScrub }) {
  const previewSteps = Object.keys(stepPreviews).map(Number).sort((a, b) => a - b);
  const total = totalSteps || 1;

  const handleClick = (e) => {
    if (generating || previewSteps.length === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct  = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const target = Math.round(pct * total);
    const nearest = previewSteps.reduce((a, b) =>
      Math.abs(b - target) < Math.abs(a - target) ? b : a
    );
    onScrub(nearest);
  };

  const fillPct = generating
    ? (total > 0 ? (step / total) * 100 : 0)
    : resumeStep !== null
    ? (resumeStep / total) * 100
    : 100;

  return (
    <div
      className={`progress-bar-track${!generating && previewSteps.length > 0 ? ' scrub-bar' : ''}`}
      onClick={handleClick}
    >
      <div className="progress-bar-fill" style={{ width: `${fillPct}%` }} />
      {!generating && previewSteps.map(s => (
        <div
          key={s}
          className={`scrub-tick${resumeStep === s ? ' scrub-tick-active' : ''}`}
          style={{ left: `${(s / total) * 100}%` }}
        />
      ))}
      {!generating && resumeStep !== null && (
        <div className="scrub-cursor" style={{ left: `${(resumeStep / total) * 100}%` }} />
      )}
    </div>
  );
}

export default ScrubBar;
