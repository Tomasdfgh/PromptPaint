import React, { useRef, useState, useEffect, useCallback } from 'react';

const VW = 260;
const VH = 140;
const DOT_R = 14;

// Classic painter's palette shape (260×140 viewBox)
const PALETTE_PATH =
  'M 46,6 C 22,6 4,22 4,48 C 4,96 36,134 92,134 ' +
  'C 142,134 184,120 216,96 C 250,70 256,44 250,26 ' +
  'C 244,10 230,4 214,6 C 196,8 184,22 168,28 ' +
  'C 152,34 136,22 120,12 C 104,2 82,2 62,4 Z';

const PRESETS = {
  1: [{ x: 0.56, y: 0.50 }],
  2: [{ x: 0.40, y: 0.64 }, { x: 0.72, y: 0.40 }],
  3: [{ x: 0.36, y: 0.70 }, { x: 0.72, y: 0.68 }, { x: 0.58, y: 0.28 }],
  4: [{ x: 0.36, y: 0.68 }, { x: 0.70, y: 0.68 }, { x: 0.38, y: 0.30 }, { x: 0.70, y: 0.30 }],
};

function defaultPalettePos(i, total) {
  const p = PRESETS[Math.min(total, 4)]?.[i];
  if (p) return { x: p.x * VW, y: p.y * VH };
  const angle = (i / total) * Math.PI * 2 - Math.PI / 2;
  return {
    x: (0.58 + 0.22 * Math.cos(angle)) * VW,
    y: (0.50 + 0.28 * Math.sin(angle)) * VH,
  };
}

function cross(O, A, B) {
  return (A.x - O.x) * (B.y - O.y) - (A.y - O.y) * (B.x - O.x);
}
function convexHull(points) {
  if (points.length < 3) return points;
  const pts = [...points].sort((a, b) => a.x !== b.x ? a.x - b.x : a.y - b.y);
  const lower = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}
function expandConvexHull(hull, r) {
  const n = hull.length;
  if (n < 2) return hull;
  const cx = hull.reduce((s, p) => s + p.x, 0) / n;
  const cy = hull.reduce((s, p) => s + p.y, 0) / n;
  // Offset each edge outward by r
  const offsetEdges = hull.map((p, i) => {
    const next = hull[(i + 1) % n];
    const dx = next.x - p.x;
    const dy = next.y - p.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 0.001) return { x1: p.x, y1: p.y, x2: next.x, y2: next.y, dx: 1, dy: 0 };
    let nx = -dy / len;
    let ny = dx / len;
    // Ensure normal points away from centroid
    const mx = (p.x + next.x) / 2;
    const my = (p.y + next.y) / 2;
    if (nx * (cx - mx) + ny * (cy - my) > 0) { nx = -nx; ny = -ny; }
    return { x1: p.x + nx * r, y1: p.y + ny * r, x2: next.x + nx * r, y2: next.y + ny * r, dx: dx / len, dy: dy / len };
  });
  // Intersect adjacent offset edges to get new vertices
  return offsetEdges.map((e, i) => {
    const prev = offsetEdges[(i - 1 + n) % n];
    const denom = prev.dx * e.dy - prev.dy * e.dx;
    if (Math.abs(denom) < 0.001) return { x: e.x1, y: e.y1 };
    const t = ((e.x1 - prev.x1) * e.dy - (e.y1 - prev.y1) * e.dx) / denom;
    return { x: prev.x1 + t * prev.dx, y: prev.y1 + t * prev.dy };
  });
}

function pointInPolygon(pt, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    if ((yi > pt.y) !== (yj > pt.y) &&
        pt.x < (xj - xi) * (pt.y - yi) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function findComponents(n, links) {
  const adj = Array.from({ length: n }, () => []);
  for (const { a, b } of links) {
    if (a < n && b < n) { adj[a].push(b); adj[b].push(a); }
  }
  const visited = new Set();
  const components = [];
  for (let i = 0; i < n; i++) {
    if (visited.has(i)) continue;
    const comp = [];
    const queue = [i];
    visited.add(i);
    while (queue.length) {
      const node = queue.shift();
      comp.push(node);
      for (const nb of adj[node]) { if (!visited.has(nb)) { visited.add(nb); queue.push(nb); } }
    }
    components.push(comp);
  }
  return components;
}

function PromptPalette({ prompts, onWeightsChange, onCursorPosChange, historyChain, resumeStep, generating }) {
  const svgRef    = useRef(null);
  const panelRef  = useRef(null);
  const dotDragRef    = useRef(null);
  const heightScaleRef = useRef(1.0);

  const [heightScale, setHeightScaleState] = useState(1.0);
  const [positions, setPositions] = useState(() =>
    prompts.map((_, i) => defaultPalettePos(i, prompts.length))
  );
  const [fixed, setFixed] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [hoveredDot, setHoveredDot] = useState(null);
  const [selectedDot, setSelectedDot] = useState(null);
  const [mousePos, setMousePos] = useState(null);
  const [links, setLinks] = useState([]);
  const [topDot, setTopDot] = useState(null);
  const [cursorPos, setCursorPos] = useState(() => defaultPalettePos(0, prompts.length));

  const setHeightScale = (v) => {
    heightScaleRef.current = v;
    setHeightScaleState(v);
  };

  useEffect(() => {
    setPositions(prev =>
      prompts.map((_, i) => prev[i] ?? defaultPalettePos(i, prompts.length))
    );
    setLinks(prev => prev.filter(l => l.a < prompts.length && l.b < prompts.length));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prompts.length]);

  useEffect(() => {
    const maxY = VH * heightScale - DOT_R;
    setPositions(prev => prev.map(p => ({
      x: Math.min(Math.max(DOT_R, p.x), VW - DOT_R),
      y: Math.min(Math.max(DOT_R, p.y), maxY),
    })));
    setCursorPos(prev => ({
      x: Math.min(Math.max(0, prev.x), VW),
      y: Math.min(Math.max(0, prev.y), VH * heightScale),
    }));
  }, [heightScale]);

  useEffect(() => { onCursorPosChange?.(cursorPos); }, [cursorPos]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (generating) setFixed(true); }, [generating]);

  const toSVGCoords = useCallback((clientX, clientY) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  }, []);

  const fixedRef = useRef(fixed);
  fixedRef.current = fixed;
  const generatingRef = useRef(generating);
  generatingRef.current = generating;
  const selectedDotRef = useRef(selectedDot);
  selectedDotRef.current = selectedDot;
  const mousedownPosRef = useRef(null);
  const didDragRef = useRef(false);

  const handleDotMouseDown = useCallback((index, e) => {
    if (fixedRef.current) return;
    mousedownPosRef.current = { x: e.clientX, y: e.clientY };
    // When another dot is selected, don't start dragging — let the click handle the connect
    if (selectedDotRef.current !== null && selectedDotRef.current !== index) return;
    e.preventDefault();
    dotDragRef.current = index;
    const startX = e.clientX, startY = e.clientY;

    const onMove = (me) => {
      if (dotDragRef.current === null) return;
      const dx = me.clientX - startX, dy = me.clientY - startY;
      if (Math.sqrt(dx * dx + dy * dy) < 4) return;
      if (!didDragRef.current) { didDragRef.current = true; setTopDot(index); }
      const { x, y } = toSVGCoords(me.clientX, me.clientY);
      const maxY = VH * heightScaleRef.current - DOT_R;
      setPositions(prev => prev.map((p, i) =>
        i === dotDragRef.current
          ? { x: Math.min(Math.max(DOT_R, x), VW - DOT_R),
              y: Math.min(Math.max(DOT_R, y), maxY) }
          : p
      ));
    };

    const onUp = () => {
      dotDragRef.current = null;
      if (didDragRef.current) {
        didDragRef.current = false;
        setSelectedDot(null);
        setMousePos(null);
      }
      mousedownPosRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [toSVGCoords]);

  const handleResizeMouseDown = useCallback((e) => {
    e.preventDefault();
    const startY     = e.clientY;
    const startScale = heightScaleRef.current;
    // natural SVG height at current panel width
    const naturalH   = (panelRef.current?.getBoundingClientRect().width ?? VW) * (VH / VW);

    const onMove = (me) => {
      const dy = me.clientY - startY;
      setHeightScale(Math.min(1.4, Math.max(1.0, startScale + dy / naturalH)));
    };

    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, []);

  const handleCursorMouseDown = useCallback((e) => {
    if (generatingRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    const onMove = (me) => {
      const { x, y } = toSVGCoords(me.clientX, me.clientY);
      const maxY = VH * heightScaleRef.current;
      setCursorPos({
        x: Math.min(Math.max(0, x), VW),
        y: Math.min(Math.max(0, y), maxY),
      });
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [toSVGCoords]);

  // Must be declared before weights (which references it)
  const components = findComponents(prompts.length, links);

  // Weights only when cursor is on a dot, bridge, or polygon — otherwise nothing
  const weights = (() => {
    if (prompts.length === 0) return [];
    const getPos = (i) => positions[i] ?? defaultPalettePos(i, prompts.length);

    // 1. Cursor on any dot
    for (let i = 0; i < prompts.length; i++) {
      const pos = getPos(i);
      if (Math.hypot(cursorPos.x - pos.x, cursorPos.y - pos.y) <= DOT_R) {
        return prompts.map((_, j) => j === i ? 1 : 0);
      }
    }

    // 2. Cursor on a bridge (2-dot connection, not part of a 3+ group)
    const inLargeGroup = new Set(components.filter(c => c.length >= 3).flatMap(c => c));
    for (const link of links) {
      if (inLargeGroup.has(link.a) || inLargeGroup.has(link.b)) continue;
      const pA = getPos(link.a), pB = getPos(link.b);
      const edx = pB.x - pA.x, edy = pB.y - pA.y;
      const len2 = edx * edx + edy * edy;
      if (len2 < 0.001) continue;
      const t = Math.max(0, Math.min(1, ((cursorPos.x - pA.x) * edx + (cursorPos.y - pA.y) * edy) / len2));
      const perpDist = Math.hypot(cursorPos.x - pA.x - t * edx, cursorPos.y - pA.y - t * edy);
      if (perpDist <= DOT_R) {
        const w = prompts.map(() => 0);
        w[link.a] = 1 - t;
        w[link.b] = t;
        return w;
      }
    }

    // 3. Cursor inside a 3+ polygon
    for (const comp of components) {
      if (comp.length < 3) continue;
      const pts = comp.map(i => getPos(i));
      if (pointInPolygon(cursorPos, convexHull(pts))) {
        const dists = comp.map(i => Math.hypot(cursorPos.x - getPos(i).x, cursorPos.y - getPos(i).y));
        const invD2 = dists.map(d => d < 1 ? 1e9 : 1 / (d * d));
        const total = invD2.reduce((s, v) => s + v, 0);
        const w = prompts.map(() => 0);
        comp.forEach((idx, j) => { w[idx] = invD2[j] / total; });
        return w;
      }
    }

    // 4. Not on anything — no selection
    return prompts.map(() => 0);
  })();

  const weightsKey = weights.join(',');
  const onWeightsChangeRef = useRef(onWeightsChange);
  onWeightsChangeRef.current = onWeightsChange;
  useEffect(() => { onWeightsChangeRef.current(weights); }, [weightsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const viewHeight = Math.round(VH * heightScale);

  const isDebridge = !fixed && selectedDot !== null && hoveredDot !== null && hoveredDot !== selectedDot &&
    links.some(l => (l.a === selectedDot && l.b === hoveredDot) || (l.a === hoveredDot && l.b === selectedDot));
  // True when hoveredDot is already in the same component as selectedDot (but no direct link)
  const isAlreadyGrouped = !fixed && !isDebridge && selectedDot !== null && hoveredDot !== null && hoveredDot !== selectedDot &&
    components.some(c => c.includes(selectedDot) && c.includes(hoveredDot));

  // Rotate + scale the palette so it fills VW×viewHeight while preserving its own aspect ratio.
  // Solve: bounding box of rotated VW×VH rectangle == VW×viewHeight
  // → θ = arctan((VW·VH·(h−1)) / (VW²−VH²·h)),  s = VW / (VW·cosθ + VH·sinθ)
  const tanTheta = (VW * VH * (heightScale - 1)) / (VW * VW - VH * VH * heightScale);
  const theta    = Math.atan(tanTheta);
  const thetaDeg = theta * 180 / Math.PI;
  const bw           = VW * Math.cos(theta) + VH * Math.sin(theta);
  const paletteScale = VW / bw;
  // Rotate around palette centre (VW/2, VH/2), then place at viewBox centre
  const paletteTransform =
    `translate(${VW / 2},${viewHeight / 2}) scale(${paletteScale}) rotate(${thetaDeg}) translate(${-VW / 2},${-VH / 2})`;

  // Prompts in a 3+ component suppress their individual bridge lines
  const inPolygonGroup = new Set(
    components.filter(c => c.length >= 3).flatMap(c => c)
  );

  const colorGroupData = components
    .filter(comp => comp.length >= 3)
    .map((comp, gi) => {
      const pts = comp.map(idx => ({
        ...(positions[idx] ?? defaultPalettePos(idx, prompts.length)),
        color: prompts[idx]?.color ?? '#ffffff',
      }));
      const hull = convexHull(pts);
      // Expand edges by DOT_R but clamp each corner to DOT_R from its original vertex
      const rawExpanded = expandConvexHull(hull, DOT_R);
      const expandedHull = rawExpanded.map((ep, i) => {
        const op = hull[i];
        const dx = ep.x - op.x;
        const dy = ep.y - op.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= DOT_R) return ep;
        return { x: op.x + (dx / dist) * DOT_R, y: op.y + (dy / dist) * DOT_R };
      });
      // Equal radius for all blobs so no single color dominates
      const blobR = Math.max(...pts.flatMap((p, j) =>
        pts.filter((_, jj) => jj !== j).map(o => Math.sqrt((o.x - p.x) ** 2 + (o.y - p.y) ** 2))
      ));
      const blobs = pts.map((p, j) => ({ j, x: p.x, y: p.y, color: p.color, r: blobR }));
      return { gi, hull: expandedHull, blobs, members: comp };
    });

  const renderDot = (i, prompt, pos, highlighted) => (
    <g
      key={i}
      transform={`translate(${pos.x},${pos.y})`}
      onMouseDown={(e) => handleDotMouseDown(i, e)}
      onMouseEnter={() => !fixed && setHoveredDot(i)}
      onMouseLeave={() => setHoveredDot(null)}
      onClick={(e) => {
        e.stopPropagation();
        const md = mousedownPosRef.current;
        if (md && Math.hypot(e.clientX - md.x, e.clientY - md.y) > 4) return;
        if (fixed) return;
        if (selectedDot !== null && selectedDot !== i) {
          const existingIdx = links.findIndex(l => (l.a === selectedDot && l.b === i) || (l.a === i && l.b === selectedDot));
          if (existingIdx >= 0) {
            setLinks(prev => prev.filter((_, idx) => idx !== existingIdx));
          } else if (components.some(c => c.includes(selectedDot) && c.includes(i))) {
            setLinks(prev => prev.filter(l => l.a !== selectedDot && l.b !== selectedDot));
          } else {
            setLinks(prev => [...prev, { a: selectedDot, b: i }]);
          }
          setSelectedDot(null);
          setMousePos(null);
        } else {
          setSelectedDot(i);
          setTopDot(i);
        }
      }}
      style={{ cursor: fixed ? 'default' : 'grab' }}
    >
      {highlighted && (
        <circle r={DOT_R + 2} fill="none"
          stroke={(isDebridge || isAlreadyGrouped) && (i === selectedDot || i === hoveredDot) ? '#f87171' : '#4ade80'}
          strokeWidth="2.5" opacity="1" style={{ pointerEvents: 'none' }} />
      )}
      <circle r={DOT_R} fill={prompt.color} filter="url(#dot-shadow)" />
      <text textAnchor="middle" dominantBaseline="central" fill="white" fontSize="11" fontWeight="700"
        style={{ pointerEvents: 'none' }}>
        {i + 1}
      </text>
    </g>
  );

  return (
    <section className="panel prompt-palette-panel" ref={panelRef}>
      {showTutorial && <PaletteTutorial onClose={() => setShowTutorial(false)} />}
      <div className="prompt-palette-header">
        <div className="palette-label-row">
          <label className="field-label">Prompt Palette</label>
          <button className="palette-info-btn" onClick={() => setShowTutorial(true)} aria-label="How to use the palette">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="8" cy="8" r="7"/>
              <line x1="8" y1="7" x2="8" y2="11"/>
              <circle cx="8" cy="4.5" r="0.5" fill="currentColor" stroke="none"/>
            </svg>
          </button>
        </div>
        <div className="palette-fix-toggle">
          <button className={`palette-fix-btn${fixed ? ' active' : ''}`} onClick={() => { setFixed(true); setSelectedDot(null); setHoveredDot(null); setMousePos(null); }}>Fixed</button>
          <button className={`palette-fix-btn${!fixed ? ' active' : ''}`} onClick={() => { setFixed(false); setSelectedDot(null); setHoveredDot(null); setMousePos(null); }}>Edit</button>
        </div>
      </div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VW} ${viewHeight}`}
        className="prompt-palette-svg"
        style={{ userSelect: 'none', overflow: 'visible' }}
        onClick={(e) => {
          const md = mousedownPosRef.current;
          if (md && Math.hypot(e.clientX - md.x, e.clientY - md.y) > 4) return;
          if (!fixed) setSelectedDot(null);
        }}
        onMouseMove={(e) => {
          if (fixed || selectedDot === null) return;
          setMousePos(toSVGCoords(e.clientX, e.clientY));
        }}
        onMouseLeave={() => setMousePos(null)}
      >
        <defs>
          <filter id="dot-shadow" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="2" stdDeviation="2.5" floodOpacity="0.45" />
          </filter>
          {links.map((link, idx) => {
            if (inPolygonGroup.has(link.a)) return null;
            const posA = positions[link.a] ?? defaultPalettePos(link.a, prompts.length);
            const posB = positions[link.b] ?? defaultPalettePos(link.b, prompts.length);
            return (
              <linearGradient key={idx} id={`link-grad-${idx}`} gradientUnits="userSpaceOnUse"
                x1={posA.x} y1={posA.y} x2={posB.x} y2={posB.y}>
                <stop offset="0%" stopColor={prompts[link.a]?.color ?? '#fff'} />
                <stop offset="100%" stopColor={prompts[link.b]?.color ?? '#fff'} />
              </linearGradient>
            );
          })}
          {colorGroupData.map(({ gi, hull, blobs }) => (
            <React.Fragment key={`cg-defs-${gi}`}>
              <clipPath id={`hull-clip-${gi}`}>
                <polygon points={hull.map(p => `${p.x},${p.y}`).join(' ')} />
              </clipPath>
              {blobs.map(({ j, x, y, color, r }) => (
                <radialGradient key={`blob-grad-${gi}-${j}`} id={`blob-grad-${gi}-${j}`}
                  gradientUnits="userSpaceOnUse" cx={x} cy={y} r={r}>
                  <stop offset="0%" stopColor={color} stopOpacity="1" />
                  <stop offset="100%" stopColor={color} stopOpacity="0" />
                </radialGradient>
              ))}
            </React.Fragment>
          ))}
        </defs>

        <g transform={paletteTransform}>
          <path d={PALETTE_PATH} className="palette-surface" />
          <ellipse cx="32" cy="52" rx="14" ry="19" className="palette-thumb-hole" />
        </g>

        {/* Groups (fill + dots) sorted so the active group renders last (on top) */}
        {[...colorGroupData]
          .sort((a, b) => {
            const aActive = topDot !== null && a.members.includes(topDot);
            const bActive = topDot !== null && b.members.includes(topDot);
            return aActive ? 1 : bActive ? -1 : 0;
          })
          .map(({ gi, hull, blobs, members }) => {
            const topInGroup = topDot !== null && members.includes(topDot);
            return (
              <g key={`group-${gi}`}>
                <g clipPath={`url(#hull-clip-${gi})`} style={{ pointerEvents: 'none' }}>
                  {blobs.map(({ j, x, y, r }) => (
                    <circle key={`blob-${gi}-${j}`} cx={x} cy={y} r={r} fill={`url(#blob-grad-${gi}-${j})`} />
                  ))}
                </g>
                {members.filter(i => i !== topDot).map(i => {
                  const prompt = prompts[i];
                  if (!prompt) return null;
                  const pos = positions[i] ?? defaultPalettePos(i, prompts.length);
                  const highlighted = !fixed && (hoveredDot === i || selectedDot === i);
                  return renderDot(i, prompt, pos, highlighted);
                })}
                {topInGroup && (() => {
                  const prompt = prompts[topDot];
                  if (!prompt) return null;
                  const pos = positions[topDot] ?? defaultPalettePos(topDot, prompts.length);
                  const highlighted = !fixed && (hoveredDot === topDot || selectedDot === topDot);
                  return renderDot(topDot, prompt, pos, highlighted);
                })()}
              </g>
            );
          })}

        {/* Standalone bridges (2-member connections) */}
        {links.map((link, idx) => {
          if (inPolygonGroup.has(link.a)) return null;
          const posA = positions[link.a] ?? defaultPalettePos(link.a, prompts.length);
          const posB = positions[link.b] ?? defaultPalettePos(link.b, prompts.length);
          const dx = posB.x - posA.x;
          const dy = posB.y - posA.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < DOT_R * 2) return null;
          return (
            <g key={idx} style={{ pointerEvents: 'none' }}>
              <line x1={posA.x} y1={posA.y} x2={posB.x} y2={posB.y}
                stroke={`url(#link-grad-${idx})`} strokeWidth={DOT_R * 2} strokeLinecap="butt" />
            </g>
          );
        })}

        {/* Standalone dots (not in any 3+ group) — topDot rendered last */}
        {prompts.map((prompt, i) => {
          if (inPolygonGroup.has(i)) return null;
          if (i === topDot) return null;
          const pos = positions[i] ?? defaultPalettePos(i, prompts.length);
          const highlighted = !fixed && (hoveredDot === i || selectedDot === i);
          return renderDot(i, prompt, pos, highlighted);
        })}
        {topDot !== null && !inPolygonGroup.has(topDot) && (() => {
          const prompt = prompts[topDot];
          if (!prompt) return null;
          const pos = positions[topDot] ?? defaultPalettePos(topDot, prompts.length);
          const highlighted = !fixed && (hoveredDot === topDot || selectedDot === topDot);
          return renderDot(topDot, prompt, pos, highlighted);
        })()}

        {mousePos && selectedDot !== null && (() => {
          const from = positions[selectedDot] ?? defaultPalettePos(selectedDot, prompts.length);
          let toX = mousePos.x;
          let toY = mousePos.y;
          if (hoveredDot !== null && hoveredDot !== selectedDot) {
            const hPos = positions[hoveredDot] ?? defaultPalettePos(hoveredDot, prompts.length);
            toX = hPos.x;
            toY = hPos.y;
          }
          const dx = toX - from.x;
          const dy = toY - from.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const startR = DOT_R + 2;
          const endR = hoveredDot !== null && hoveredDot !== selectedDot ? DOT_R + 2 : 0;
          if (dist < startR + endR) return null;
          const nx = dx / dist;
          const ny = dy / dist;
          const isFreeEnd = hoveredDot === null || hoveredDot === selectedDot;
          const color = (isDebridge || isAlreadyGrouped) ? '#f87171' : '#4ade80';
          const x1 = from.x + nx * startR;
          const y1 = from.y + ny * startR;
          const x2 = toX - nx * endR;
          const y2 = toY - ny * endR;
          const midX = (x1 + x2) / 2;
          const midY = (y1 + y2) / 2;
          const gap = 16;
          return (
            <g style={{ pointerEvents: 'none' }}>
              {(isDebridge || isAlreadyGrouped) ? (
                <>
                  <line x1={x1} y1={y1} x2={midX - nx * gap} y2={midY - ny * gap}
                    stroke={color} strokeWidth="9" strokeLinecap="butt" />
                  <circle cx={midX - nx * gap} cy={midY - ny * gap} r={4.5} fill={color} />
                  <line x1={midX + nx * gap} y1={midY + ny * gap} x2={x2} y2={y2}
                    stroke={color} strokeWidth="9" strokeLinecap="butt" />
                  <circle cx={midX + nx * gap} cy={midY + ny * gap} r={4.5} fill={color} />
                  <text x={midX} y={midY} textAnchor="middle" dominantBaseline="central"
                    fill="#f87171" fontSize="12" fontWeight="900">✕</text>
                </>
              ) : (
                <line x1={x1} y1={y1} x2={x2} y2={y2}
                  stroke={color} strokeWidth="9" strokeLinecap="butt" />
              )}
              {isFreeEnd && (
                <circle cx={toX} cy={toY} r={4.5} fill={color} opacity="1" />
              )}
            </g>
          );
        })()}

        {/* History chain — visible while scrubbing */}
        {resumeStep !== null && (() => {
          const visible = (historyChain || [])
            .filter(n => n.fromStep < resumeStep)
            .map(n => ({
              ...n,
              displayTo: (n.toStep === null || n.toStep > resumeStep) ? resumeStep : n.toStep,
            }));

          if (visible.length === 0) return null;

          const points = [...visible.map(n => n.pos), cursorPos];

          return (
            <>
              {/* Dotted connecting lines */}
              {points.map((pt, i) => {
                if (i === 0) return null;
                const prev = points[i - 1];
                return (
                  <line key={`chain-line-${i}`}
                    x1={prev.x} y1={prev.y} x2={pt.x} y2={pt.y}
                    stroke="#8B5E3C" strokeWidth="1" strokeDasharray="3,3" strokeOpacity="0.7"
                    style={{ pointerEvents: 'none' }}
                  />
                );
              })}

              {/* History nodes */}
              {visible.map((n, i) => (
                <g key={`chain-node-${i}`} transform={`translate(${n.pos.x},${n.pos.y})`} style={{ pointerEvents: 'none' }}>
                  <text y={-16} textAnchor="middle" fill="#8B5E3C" fontSize="8" fontWeight="600" style={{ userSelect: 'none' }}>
                    step {n.fromStep} to {n.displayTo}
                  </text>
                  <circle r={9} fill="#8B5E3C" stroke="#8B5E3C" strokeWidth="2" />
                  <line x1={-5} y1={0} x2={5} y2={0} stroke="white" strokeWidth="1.5" strokeLinecap="round" />
                  <line x1={0} y1={-5} x2={0} y2={5} stroke="white" strokeWidth="1.5" strokeLinecap="round" />
                </g>
              ))}
            </>
          );
        })()}

        {/* Cursor — always on top, draggable in any mode */}
        <g
          transform={`translate(${cursorPos.x},${cursorPos.y})`}
          onMouseDown={handleCursorMouseDown}
          onClick={e => e.stopPropagation()}
          style={{ cursor: generating ? 'default' : 'crosshair' }}
        >
          {weights.every(w => w < 0.001) && (
            <text
              y={-16}
              textAnchor="middle"
              fill="var(--text-muted)"
              fontSize="8"
              fontWeight="600"
              style={{ pointerEvents: 'none', userSelect: 'none' }}
            >
              Nothing Selected
            </text>
          )}
          <circle r={9} fill="white" fillOpacity="0.92" stroke="#111" strokeWidth="2" />
          <line x1={-5} y1={0} x2={5} y2={0} stroke="#111" strokeWidth="1.5" strokeLinecap="round" />
          <line x1={0} y1={-5} x2={0} y2={5} stroke="#111" strokeWidth="1.5" strokeLinecap="round" />
        </g>
      </svg>

      <div className="palette-resize-handle" onMouseDown={handleResizeMouseDown} />
    </section>
  );
}

function PaletteTutorial({ onClose }) {
  const steps = [
    {
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
      ),
      title: 'Edit vs Fixed',
      desc: 'Switch to Edit mode to arrange dots and draw connections. Use Fixed mode when you\'re happy with the layout.',
    },
    {
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="6" cy="18" r="3"/><circle cx="18" cy="6" r="3"/><line x1="8.5" y1="15.5" x2="15.5" y2="8.5"/>
        </svg>
      ),
      title: 'Connect Prompts',
      desc: 'In Edit mode, click a dot to select it (green ring), then click another dot to draw a connection between them. Click the connection to remove it.',
    },
    {
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3"/><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/>
        </svg>
      ),
      title: 'Set the Mix',
      desc: 'Drag the white crosshair onto a dot for 100% of that prompt, onto a connection to blend two, or inside a triangle to mix three or more.',
    },
    {
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/>
        </svg>
      ),
      title: 'Prompt Composition',
      desc: 'The panel below the palette shows the percentage of each prompt in your current mix. Only prompts contributing to the mix are shown.',
    },
  ];

  return (
    <div className="palette-tutorial-overlay" onClick={onClose}>
      <div className="palette-tutorial" onClick={e => e.stopPropagation()}>
        <div className="palette-tutorial-header">
          <span className="palette-tutorial-title">How to use the Palette</span>
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

export default PromptPalette;
