import { useState } from 'react';

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" width="13" height="13">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  );
}

function EyeOffIcon({ size = 13 }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" width={size} height={size}>
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  );
}

export default function LayersPanel({ layers, activeLayerId, onSetActive, onAdd, onRemove, onToggleVisible, onReorder }) {
  const [dragIndex, setDragIndex] = useState(null);
  const [dropIndex, setDropIndex] = useState(null);

  const handleAdd = () => {
    const names = new Set(layers.map(l => l.name));
    let n = 1;
    while (names.has(`Layer ${n}`)) n++;
    onAdd(`Layer ${n}`);
  };

  const handleDragStart = (e, i) => {
    setDragIndex(i);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e, i) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (i !== dropIndex) setDropIndex(i);
  };

  const handleDrop = (e, i) => {
    e.preventDefault();
    if (dragIndex !== null && dragIndex !== i) onReorder(dragIndex, i);
    setDragIndex(null);
    setDropIndex(null);
  };

  const handleDragEnd = () => {
    setDragIndex(null);
    setDropIndex(null);
  };

  const activeLayer = layers.find(l => l.id === activeLayerId);

  return (
    <div className="layers-column">
      <div className="layers-column-label">Layers</div>

      <div className="layers-column-list">
        {layers.map((layer, i) => (
          <div
            key={layer.id}
            draggable
            className={[
              'layer-cell',
              layer.id === activeLayerId ? 'active' : '',
              !layer.visible ? 'hidden' : '',
              dragIndex === i ? 'dragging' : '',
              dropIndex === i && dragIndex !== i ? 'drop-target' : '',
            ].filter(Boolean).join(' ')}
            onClick={() => onSetActive(layer.id)}
            title={layer.name}
            onDragStart={e => handleDragStart(e, i)}
            onDragOver={e => handleDragOver(e, i)}
            onDrop={e => handleDrop(e, i)}
            onDragEnd={handleDragEnd}
          >
            <div className="layer-cell-thumb">
              {layer.imageB64 && <img src={`data:image/png;base64,${layer.imageB64}`} alt="" />}
            </div>

            <span className="layer-cell-num">{i + 1}</span>

            {/* Visibility indicator — always shown when hidden */}
            {!layer.visible && (
              <span className="layer-cell-hidden-icon"><EyeOffIcon size={11} /></span>
            )}

            {/* Hover overlay: delete only */}
            {layers.length > 1 && (
              <div className="layer-cell-overlay">
                <button
                  className="layer-cell-overlay-btn layer-cell-del"
                  title="Delete layer"
                  onClick={e => { e.stopPropagation(); onRemove(layer.id); }}
                >✕</button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Bottom controls: add + eye for active layer */}
      <div className="layers-column-actions">
        <button className="layer-cell-add" onClick={handleAdd} title="Add layer">+</button>
        <button
          className={`layer-eye-btn${activeLayer && !activeLayer.visible ? ' layer-eye-off' : ''}`}
          title={activeLayer?.visible ? 'Hide layer' : 'Show layer'}
          onClick={() => activeLayer && onToggleVisible(activeLayer.id)}
        >
          {activeLayer?.visible !== false ? <EyeIcon /> : <EyeOffIcon />}
        </button>
      </div>
    </div>
  );
}
