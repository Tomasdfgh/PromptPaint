import { useRef, useState, useEffect } from 'react';
import { hueToHex, hexToHue, promptHue } from './sidebarUtils';

function ColorPicker({ color, onChange, index }) {
  const [open, setOpen] = useState(false);
  const [popoverPos, setPopoverPos] = useState({ top: 0, left: 0 });
  const wrapRef = useRef(null);
  const dotRef = useRef(null);
  const hue = hexToHue(color);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target) &&
          !(e.target.closest && e.target.closest('.color-swatch-popover-fixed'))) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleClick = () => {
    if (!open && dotRef.current) {
      const rect = dotRef.current.getBoundingClientRect();
      setPopoverPos({ top: rect.bottom + 4, left: rect.left });
    }
    setOpen(o => !o);
  };

  return (
    <div className="color-swatch-wrap" ref={wrapRef}>
      <div
        ref={dotRef}
        className="prompt-color-dot"
        style={{ background: color }}
        onClick={handleClick}
      >
        {index !== undefined && <span className="prompt-color-dot-num">{index + 1}</span>}
      </div>
      {open && (
        <div
          className="color-swatch-popover color-swatch-popover-fixed"
          style={{ position: 'fixed', top: popoverPos.top, left: popoverPos.left, zIndex: 9999 }}
        >
          <input
            type="range"
            min={0}
            max={359}
            value={hue}
            onChange={e => onChange(hueToHex(parseInt(e.target.value)))}
            className="hue-slider"
            style={{ '--thumb-color': color }}
          />
        </div>
      )}
    </div>
  );
}

function PromptRow({ prompt, index, onUpdate, onRemove, showRemove, showWeight, totalWeight, autoFocus }) {
  const [editing, setEditing] = useState(!prompt.text.trim());
  const textareaRef = useRef(null);
  const prevEditingRef = useRef(editing);

  const autoResize = (el) => {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  };

  useEffect(() => {
    autoResize(textareaRef.current);
  }, [prompt.text, editing]);

  useEffect(() => {
    // Only focus when editing transitions false→true (user explicitly clicked to edit)
    if (editing && !prevEditingRef.current) textareaRef.current?.focus();
    prevEditingRef.current = editing;
  }, [editing]);

  const wordCount = prompt.text.trim() ? prompt.text.trim().split(/\s+/).filter(Boolean).length : 0;

  return (
    <div className="prompt-list-row">
      <div className="prompt-list-row-main">
        <ColorPicker color={prompt.color} onChange={c => onUpdate('color', c)} index={index} />

        <div className="prompt-input-wrap">
          <textarea
            ref={textareaRef}
            className={`prompt-input${editing ? '' : ' prompt-input-readonly'}`}
            rows={1}
            autoFocus={autoFocus && !prompt.text.trim()}
            placeholder={`Prompt ${index + 1}…`}
            value={prompt.text}
            readOnly={!editing}
            onChange={e => {
              const words = e.target.value.trim().split(/\s+/).filter(Boolean);
              if (words.length > 30) return;
              onUpdate('text', e.target.value);
              autoResize(e.target);
            }}
            onFocus={() => setEditing(true)}
            onBlur={() => { if (prompt.text.trim()) setEditing(false); }}
            style={{
              borderColor: prompt.color + '66',
              maxHeight: editing ? '72px' : 'none',
              overflowY: editing ? 'auto' : 'hidden',
              paddingRight: showRemove ? '22px' : undefined,
            }}
          />
          {wordCount > 0 && <span className="prompt-word-count">{wordCount}/30</span>}
          {showRemove && (
            <button className="btn-small prompt-remove-btn" onClick={onRemove}>✕</button>
          )}
        </div>
      </div>

    </div>
  );
}

function PromptListPanel({ params, set }) {
  const prompts = params.prompts?.length > 0
    ? params.prompts
    : [{ text: '', color: promptHue(0), weight: 1 }];

  const totalWeight = prompts.reduce((s, p) => s + (p.weight ?? 1), 0);
  const multiPrompt = prompts.length > 1;

  const updatePrompt = (i, field, val) =>
    set('prompts', prompts.map((p, idx) => idx === i ? { ...p, [field]: val } : p));

  const addPrompt = () =>
    set('prompts', [...prompts, { text: '', color: promptHue(prompts.length), weight: 1 }]);

  const removePrompt = (i) => {
    if (prompts.length <= 1) return;
    set('prompts', prompts.filter((_, idx) => idx !== i));
  };

  return (
    <section className="panel prompt-list-panel">
      <div className="prompt-list-header">
        <label className="field-label">Prompt List</label>
        <button className="btn-add-prompt" onClick={addPrompt}>+ Add</button>
      </div>
      <div className="prompt-list">
        {prompts.map((p, i) => (
          <PromptRow
            key={i}
            index={i}
            prompt={p}
            onUpdate={(field, val) => updatePrompt(i, field, val)}
            onRemove={() => removePrompt(i)}
            showRemove={multiPrompt}
            showWeight={multiPrompt}
            totalWeight={totalWeight}
            autoFocus
          />
        ))}
      </div>
    </section>
  );
}

export default PromptListPanel;
