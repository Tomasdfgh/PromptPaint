import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { io } from 'socket.io-client';
import Sidebar from './components/Sidebar';
import Canvas from './components/Canvas';
import About from './components/About';
import Contact from './components/Contact';
import { uoftLogoDataUri } from './assets/uoftLogoBase64';
import './App.css';

const socket = io({ path: '/socket.io' });

// Composite a new RGBA image on top of a base image using an offscreen canvas.
// Returns a base64 PNG string. If no base, returns the new image as-is.
function compositeImages(baseB64, topB64) {
  return new Promise((resolve) => {
    if (!baseB64) { resolve(topB64); return; }
    const canvas = document.createElement('canvas');
    const baseImg = new Image();
    const topImg  = new Image();
    let loaded = 0;
    const onLoad = () => {
      if (++loaded < 2) return;
      canvas.width  = baseImg.naturalWidth;
      canvas.height = baseImg.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(baseImg, 0, 0);
      ctx.drawImage(topImg,  0, 0);
      resolve(canvas.toDataURL('image/png').split(',')[1]);
    };
    baseImg.onload = onLoad;
    topImg.onload  = onLoad;
    baseImg.src = `data:image/png;base64,${baseB64}`;
    topImg.src  = `data:image/png;base64,${topB64}`;
  });
}

const DEFAULT_PARAMS = {
  prompt: '',
  prompt_a: '',
  prompt_b: '',
  prompts: [
    { text: '', color: '#e8455c', weight: 1 },
    { text: '', color: '#4fa3e8', weight: 1 },
    { text: '', color: '#33e65c', weight: 1 },
  ],
  directional_prompts: [
    { from: '', to: '', scale: 1 },
    { from: '', to: '', scale: 1 },
  ],
  from_concept: '',
  to_concept: '',
  alpha: 0.5,
  scale: 1.0,
  steps: 40,
  guide_scale: 7,
  single_stroke: 20,
  overcoat: 100,
  width: 1344,
  height: 768,
};

export default function App() {
  const [stencilActive, setStencilActive] = useState(false);
  const [params,      setParams]      = useState(DEFAULT_PARAMS);
  const [generating,  setGenerating]  = useState(false);
  const [step,        setStep]        = useState(0);
  const [totalSteps,  setTotalSteps]  = useState(0);
  const [imageB64,    setImageB64]    = useState(null);
  const [strokes,     setStrokes]     = useState([]);
  const [brushRadius, setBrushRadius] = useState(20);
  const [, setStatusMsg] = useState('');
  const [menuOpen,    setMenuOpen]    = useState(false);
  const [queuePos,    setQueuePos]    = useState(null);
  const [paletteWeights, setPaletteWeights] = useState([]);
  const [theme, setTheme] = useState(() => localStorage.getItem('pp-theme') || 'dark');

  // Scrubber state
  const [stepPreviews,      setStepPreviews]      = useState({});   // step → b64
  const [resumeStep,        setResumeStep]        = useState(null); // step to resume from on next Paint
  const [scrubImage,        setScrubImage]        = useState(null); // overrides imageB64 while scrubbing
  const [paletteCursorPos,  setPaletteCursorPos]  = useState(null); // live palette cursor position
  const [generationChain,   setGenerationChain]   = useState([]);   // [{ pos, fromStep, toStep }] history
  const menuRef       = useRef(null);
  const totalStepsRef = useRef(0);
  const imageB64Ref      = useRef(null);
  const stepPreviewsRef  = useRef({});
  const isStencilGenRef    = useRef(false);
  const preStencilImageRef = useRef(null);
  useEffect(() => { imageB64Ref.current = imageB64; }, [imageB64]);
  useEffect(() => { stepPreviewsRef.current = stepPreviews; }, [stepPreviews]);
  const navigate = useNavigate();
  const location = useLocation();

  const showAbout   = location.pathname === '/about';
  const showContact = location.pathname === '/contacts';

  const switchTheme = (t) => { setTheme(t); localStorage.setItem('pp-theme', t); setMenuOpen(false); };

  // Close menu on outside click
  useEffect(() => {
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);


  // ---------------------------------------------------------------------------
  // Socket event listeners
  // ---------------------------------------------------------------------------
  useEffect(() => {

    socket.on('queued', (data) => {
      setQueuePos(data.position);
    });

    socket.on('started', () => {
      setQueuePos(null);
    });

    socket.on('progress', (data) => {
      setStep(data.step);
      setTotalSteps(data.total);
      totalStepsRef.current = data.total;
      if (data.preview) {
        if (isStencilGenRef.current) {
          compositeImages(preStencilImageRef.current, data.preview).then(composited => {
            setImageB64(composited);
            setStepPreviews(prev => ({ ...prev, [data.step]: composited }));
          });
        } else {
          setImageB64(data.preview);
          setStepPreviews(prev => ({ ...prev, [data.step]: data.preview }));
        }
      }
    });

    socket.on('result', (data) => {
      const finalize = (image) => {
        setImageB64(image);
        setStepPreviews(prev => ({ ...prev, [totalStepsRef.current]: image }));
        setGenerationChain(prev => prev.map((n, i) =>
          i === prev.length - 1 ? { ...n, toStep: totalStepsRef.current } : n
        ));
        setGenerating(false);
        setQueuePos(null);
        setStep(0);
      };
      if (isStencilGenRef.current) {
        compositeImages(preStencilImageRef.current, data.image).then(finalize);
      } else {
        finalize(data.image);
      }
    });


    socket.on('error', (data) => {
      setGenerating(false);
      setQueuePos(null);
      console.error('Generation error:', data?.message ?? data);
    });

    socket.on('status', (data) => {
      setStatusMsg(data.message);
    });

    return () => {
      socket.off('queued');
      socket.off('started');
      socket.off('connect');
      socket.off('disconnect');
      socket.off('progress');
      socket.off('result');
      socket.off('error');
      socket.off('status');
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------
  const handleGenerate = useCallback(() => {
    if (generating) return;

    const prompts = params.prompts || [];
    const hasStrokes = strokes.length > 0;
    const effectiveMode = hasStrokes ? 'stencil' : (prompts.length > 1 ? 'mixing' : 'standard');

    // Require a palette selection for non-stencil mixing
    const hasWeights = paletteWeights.length === prompts.length && paletteWeights.some(w => w > 0.001);
    if (!hasWeights) {
      console.warn('[PromptPaint] No palette selection — place the cursor on a prompt dot or mix before generating.');
      return;
    }

    const weightedPrompts = prompts.map((p, i) => ({
      ...p,
      weight: hasWeights ? paletteWeights[i] : 1,
    }));

    const payload = {
      ...params,
      prompts: weightedPrompts,
      mode: effectiveMode,
      prompt: prompts[0]?.text || '',
      strokes: hasStrokes ? strokes : undefined,
      image_b64: hasStrokes ? (imageB64Ref.current || '') : undefined,
      resume_step: resumeStep ?? -1,
    };

    // On fresh generation clear all previews; on resume keep steps up to resumeStep
    if (resumeStep === null) {
      setStepPreviews({});
    } else {
      setStepPreviews(prev => Object.fromEntries(
        Object.entries(prev).filter(([k]) => Number(k) <= resumeStep)
      ));
    }

    if (paletteCursorPos) {
      const fromStep = resumeStep ?? 0;
      setGenerationChain(prev => {
        const trimmed = prev
          .filter(n => n.fromStep < fromStep)
          .map(n => (n.toStep === null || n.toStep > fromStep) ? { ...n, toStep: fromStep } : n);
        return [...trimmed, { pos: paletteCursorPos, fromStep, toStep: null }];
      });
    }
    isStencilGenRef.current    = hasStrokes;
    preStencilImageRef.current = hasStrokes ? imageB64Ref.current : null;
    setScrubImage(null);
    setResumeStep(null);
    setGenerating(true);
    setStep(resumeStep ?? 0);
    setTotalSteps(params.steps || 40);
    totalStepsRef.current = params.steps || 40;
    if (resumeStep === null && !hasStrokes) setImageB64(null);
    else if (resumeStep !== null) setImageB64(stepPreviewsRef.current[resumeStep] ?? null);
    // stencil fresh generation: leave imageB64 unchanged
    setStatusMsg('Starting…');
    socket.emit('generate', payload);
  }, [generating, params, strokes, paletteWeights, resumeStep, paletteCursorPos]);

  const handleScrub = useCallback((s) => {
    if (s >= totalSteps) { setResumeStep(null); setScrubImage(null); return; }
    setResumeStep(s);
    setScrubImage(stepPreviews[s] ?? null);
  }, [stepPreviews, totalSteps]);

  const handleUnscrub = useCallback(() => {
    setResumeStep(null);
    setScrubImage(null);
  }, []);


  // Keyboard shortcut: Cmd/Ctrl+Enter to generate
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handleGenerate();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleGenerate]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className={`app ${theme}`}>
      <header className="app-header">
        <div className="header-title">
          <div className="logo-container logo-clickable" onClick={() => navigate('/')}>
            <h1 className="logo">PromptPaint</h1>
            <svg className="logo-brush-deco" viewBox="0 0 360 66" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <defs>
                <linearGradient id="hdr-grad" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%"   stopColor="#e91e8c"/>
                  <stop offset="20%"  stopColor="#ff5722"/>
                  <stop offset="42%"  stopColor="#ffc107"/>
                  <stop offset="62%"  stopColor="#4caf50"/>
                  <stop offset="82%"  stopColor="#00bcd4"/>
                  <stop offset="100%" stopColor="#2196f3"/>
                </linearGradient>
              </defs>
              {/* shadow undercoat */}
              <path d="M 4,44 Q 90,30 180,36 Q 270,42 318,28" stroke="rgba(0,0,0,0.3)" strokeWidth="38" strokeLinecap="round" fill="none"/>
              {/* rainbow stroke */}
              <path d="M 4,42 Q 90,28 180,34 Q 270,40 318,26" stroke="url(#hdr-grad)" strokeWidth="34" strokeLinecap="round" fill="none" opacity="0.75"/>
              {/* shimmer */}
              <path d="M 8,32 Q 90,19 180,25 Q 270,31 314,17" stroke="rgba(255,255,255,0.2)" strokeWidth="9" strokeLinecap="round" fill="none"/>
              {/* paintbrush at right end, handle upper-right bristles lower-left */}
              <g transform="translate(318,26) rotate(38)">
                <rect x="-5" y="-44" width="10" height="34" rx="3" fill="#7a4520"/>
                <rect x="-1.5" y="-42" width="2" height="30" rx="1" fill="rgba(255,255,255,0.15)"/>
                <ellipse cx="0" cy="-44" rx="5" ry="4" fill="#1e0a02"/>
                <rect x="-6" y="-12" width="12" height="11" rx="1" fill="#aaaaaa"/>
                <line x1="-6" y1="-8" x2="6" y2="-8" stroke="rgba(255,255,255,0.4)" strokeWidth="0.8"/>
                <path d="M -6,0 C -7,8 -16,18 -17,30 L 17,30 C 16,18 7,8 6,0 Z" fill="#c4924a"/>
                <line x1="-5" y1="0" x2="-15" y2="30" stroke="#8b6020" strokeWidth="0.8" opacity="0.5"/>
                <line x1="-2" y1="0" x2="-8"  y2="30" stroke="#8b6020" strokeWidth="0.8" opacity="0.5"/>
                <line x1="0"  y1="0" x2="0"   y2="30" stroke="#8b6020" strokeWidth="0.8" opacity="0.5"/>
                <line x1="2"  y1="0" x2="8"   y2="30" stroke="#8b6020" strokeWidth="0.8" opacity="0.5"/>
                <line x1="5"  y1="0" x2="15"  y2="30" stroke="#8b6020" strokeWidth="0.8" opacity="0.5"/>
                <path d="M -17,25 Q 0,29 17,25 L 17,30 Q 0,34 -17,30 Z" fill="#2196f3" opacity="0.9"/>
                <path d="M -17,25 Q -12,27 -8,26 L -8,30 Q -12,31 -17,30 Z" fill="#4caf50" opacity="0.85"/>
                <path d="M 8,26 Q 12,27 17,25 L 17,30 Q 12,31 8,30 Z" fill="#ffc107" opacity="0.85"/>
              </g>
            </svg>
          </div>
          <p className="logo-subtitle">Prompt Like a Painter</p>
        </div>
        <div className="header-right">
          <img src={uoftLogoDataUri} alt="University of Toronto" className="uoft-logo" />
        </div>
      </header>

      <main className="app-body">
        {showAbout   && <About   onClose={() => navigate('/')} />}
        {showContact && <Contact onClose={() => navigate('/')} />}
        <Sidebar
          params={params}           onParamsChange={setParams}
          onGenerate={handleGenerate}
          generating={generating}
          queuePos={queuePos}
          step={step}               totalSteps={totalSteps}
          brushRadius={brushRadius} onBrushRadiusChange={setBrushRadius}
          stencilActive={stencilActive} onStencilActiveChange={setStencilActive}
          onPaletteWeightsChange={setPaletteWeights}
          onPaletteCursorPosChange={setPaletteCursorPos}
          generationChain={generationChain}
          stepPreviews={stepPreviews}
          resumeStep={resumeStep}
          onScrub={handleScrub}
          onUnscrub={handleUnscrub}
        />

        <section className="canvas-area">

          {/* Hamburger menu — top-right of canvas area */}
          <div className="canvas-menu-container" ref={menuRef}>
            <button className="hamburger-menu" onClick={() => setMenuOpen(o => !o)}>
              <span></span>
              <span></span>
              <span></span>
            </button>
            {menuOpen && (
              <div className="canvas-dropdown">
                <div className="canvas-menu-label">Theme</div>
                <button className={`canvas-menu-item ${theme === 'light' ? 'active' : ''}`} onClick={() => switchTheme('light')}>
                  <svg className="canvas-menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
                  </svg>
                  Light
                </button>
                <button className={`canvas-menu-item ${theme === 'dark' ? 'active' : ''}`} onClick={() => switchTheme('dark')}>
                  <svg className="canvas-menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                  </svg>
                  Dark
                </button>
                <div className="canvas-menu-label">More</div>
                <button className="canvas-menu-item" onClick={() => { navigate('/about'); setMenuOpen(false); }}>
                  <svg className="canvas-menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
                  </svg>
                  About
                </button>
                <button className="canvas-menu-item" onClick={() => { navigate('/contacts'); setMenuOpen(false); }}>
                  <svg className="canvas-menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>
                  </svg>
                  Contact
                </button>
              </div>
            )}
          </div>

          <Canvas
            imageB64={scrubImage ?? imageB64}
            stencilMode={stencilActive}
            generating={generating}
            brushRadius={brushRadius}
            onStrokesChange={setStrokes}
            width={params.width}
            height={params.height}
            onSizeChange={({ width, height }) => setParams(p => ({ ...p, width, height }))}
          />
          <p className="canvas-area-footer">
            Based on PromptPaint by John Joon Young Chung &amp; Eytan Adar, University of Michigan
          </p>
        </section>
      </main>
    </div>
  );
}
