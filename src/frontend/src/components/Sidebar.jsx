
import React from 'react';
import { promptHue } from './sidebarUtils';
import PromptListPanel from './PromptListPanel';
import PromptPalette from './PromptPalette';
import PromptCompositionPanel from './PromptCompositionPanel';
import DirectionalPromptsPanel from './DirectionalPromptsPanel';
import ScrubBar from './ScrubBar';
import SharedParams from './SharedParams';
export default function Sidebar({
  params, onParamsChange,
  onGenerate,
  generating, queuePos, step, totalSteps,
  brushRadius, onBrushRadiusChange,
  stencilActive, onStencilActiveChange,
  hasStrokes, generatingStencil,
  onPaletteWeightsChange, onPaletteCursorPosChange,
  generationChain,
  stepPreviews, resumeStep, onScrub, onUnscrub,
}) {
  const set = (key, val) => onParamsChange({ ...params, [key]: val });
  const [paletteWeights, setPaletteWeights] = React.useState([]);

  const handlePaletteWeights = (w) => {
    setPaletteWeights(w);
    onPaletteWeightsChange?.(w);
  };

  const prompts = params.prompts?.length > 0
    ? params.prompts
    : [0, 1, 2].map(i => ({ text: '', color: promptHue(i), weight: 1 }));

  const hasSelection = paletteWeights.some(w => w > 0.001);
  const needsSelection = !hasSelection;

  const handleGenerateWithLog = () => {
    const hasSelection = paletteWeights.some(w => w > 0.001);
    console.group('%c[PromptPaint] Generate', 'color:#007acc;font-weight:700');
    if (hasSelection) {
      console.log('Prompt composition:');
      prompts.forEach((p, i) => {
        const pct = Math.round((paletteWeights[i] ?? 0) * 100);
        console.log(`  %c■%c Prompt ${i + 1} (${pct}%): "${p.text}"`, `color:${p.color}`, 'color:inherit');
      });
    } else {
      console.log('No palette selection — no composition weights');
    }
    const directional = params.directional_prompts || [];
    console.log('Directional prompts:');
    if (directional.length === 0) {
      console.log('  (none)');
    } else {
      directional.forEach((d, i) => {
        console.log(`  Directional ${i + 1}: from="${d.from || ''}" to="${d.to || ''}" scale=${d.scale ?? 1}`);
      });
    }
    console.groupEnd();
    onGenerate();
  };

  return (
    <aside className="sidebar">

      <div className="panels">
        <PromptListPanel params={params} set={set} />

        <PromptPalette
          prompts={prompts}
          onWeightsChange={handlePaletteWeights}
          onCursorPosChange={onPaletteCursorPosChange}
          historyChain={generationChain}
          resumeStep={resumeStep}
          generating={generating}
        />

        <DirectionalPromptsPanel params={params} set={set} generating={generating} />
      </div>

      {/* Bottom: generation settings + progress + actions */}
      <div className="sidebar-bottom">

        <PromptCompositionPanel prompts={prompts} weights={paletteWeights} directionalPrompts={params.directional_prompts} />

        {/* Generate area: hover reveals settings above the button */}
        <div className="generate-area">
          <SharedParams
            params={params} set={set}
            brushRadius={brushRadius} onBrushRadiusChange={onBrushRadiusChange}
            stencilActive={stencilActive} onStencilActiveChange={onStencilActiveChange}
            generating={generating}
          />

          {/* Generation target indicator */}
          <div className={`gen-target ${(hasStrokes || generatingStencil) ? 'gen-target-stencil' : 'gen-target-canvas'}`}>
            <span className="gen-target-dot" />
            {(hasStrokes || generatingStencil) ? 'Painting to stenciled region' : 'Painting to full canvas'}
          </div>

          {/* Action buttons */}
          <div className="action-row">
          <button
            className="btn-generate"
            onClick={handleGenerateWithLog}
            disabled={generating || needsSelection}
          >
            {queuePos ? (
            `Queued (${queuePos})`
          ) : (
            <>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 15, height: 15, marginRight: 6, verticalAlign: 'middle', display: 'inline' }}>
                <path d="M3 21v-4a4 4 0 1 1 4 4H3z"/>
                <path d="M15 7l-6.5 6.5a1.5 1.5 0 0 0 3 3L18 10a1.5 1.5 0 0 0-3-3z"/>
                <path d="M9.5 11.5l-2-2"/>
                <path d="M13.5 7.5l-2-2"/>
                <path d="M17 3l4 4"/>
              </svg>
              {generating ? 'Painting…' : needsSelection ? 'Paint (select a mix first)' : resumeStep !== null ? `Resume from step ${resumeStep}` : 'Paint'}
            </>
          )}
          </button>
          {!generating && resumeStep !== null && (
            <button className="btn-cancel" onClick={onUnscrub}>✕</button>
          )}
        </div>

        </div>{/* end generate-area */}

        <div className="generate-status-bar">
          {generating && queuePos ? (
            <>
              <div className="progress-bar-track">
                <div className="progress-bar-fill progress-bar-pulse" style={{ width: '100%' }} />
              </div>
              <span className="progress-label">Queued — position {queuePos}</span>
            </>
          ) : (generating || Object.keys(stepPreviews || {}).length > 0) ? (
            <>
              <ScrubBar
                step={step}
                totalSteps={totalSteps}
                generating={generating}
                stepPreviews={stepPreviews || {}}
                resumeStep={resumeStep}
                onScrub={onScrub}
              />
              <span className="progress-label">
                {generating
                  ? `${step} / ${totalSteps} steps`
                  : resumeStep !== null
                  ? `Step ${resumeStep} — click Paint to resume`
                  : `${totalSteps} steps — scrub to go back`
                }
              </span>
            </>
          ) : (
            <p className="generate-notice">Hosted from a private server in Toronto. Expect a queue during high traffic and latency issues if far away.</p>
          )}
        </div>
      </div>
    </aside>
  );
}
