import { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import Sidebar from './components/Sidebar';
import Canvas from './components/Canvas';
import About from './components/About';
import Contact from './components/Contact';
import { uoftLogoDataUri } from './assets/uoftLogoBase64';
import './App.css';

const socket = io({ path: '/socket.io' });

const DEFAULT_PARAMS = {
  prompt: '',
  prompt_a: '',
  prompt_b: '',
  prompts: [{ text: '', weight: 1 }, { text: '', weight: 1 }],
  from_concept: '',
  to_concept: '',
  intervention_prompt: '',
  alpha: 0.5,
  scale: 1.0,
  steps: 20,
  guide_scale: 7,
  single_stroke: 100,
  overcoat: 70,
  intervention_step: 15,
};

export default function App() {
  const [mode,        setMode]        = useState('standard');
  const [params,      setParams]      = useState(DEFAULT_PARAMS);
  const [generating,  setGenerating]  = useState(false);
  const [step,        setStep]        = useState(0);
  const [totalSteps,  setTotalSteps]  = useState(0);
  const [imageB64,    setImageB64]    = useState(null);
  const [strokes,     setStrokes]     = useState([]);
  const [brushRadius, setBrushRadius] = useState(20);
  const [statusMsg,   setStatusMsg]   = useState('');
  const [menuOpen,    setMenuOpen]    = useState(false);
  const [showAbout,   setShowAbout]   = useState(false);
  const [showContact, setShowContact] = useState(false);
  const menuRef = useRef(null);

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

    socket.on('progress', (data) => {
      setStep(data.step);
      setTotalSteps(data.total);
      if (data.preview) setImageB64(data.preview);
    });

    socket.on('result', (data) => {
      setImageB64(data.image);
      setGenerating(false);
      setStep(0);
      setStatusMsg('Done');
    });

    socket.on('cancelled', () => {
      setGenerating(false);
      setStep(0);
      setStatusMsg('Cancelled');
    });

    socket.on('error', (data) => {
      setGenerating(false);
      setStatusMsg(`Error: ${data.message}`);
    });

    socket.on('status', (data) => {
      setStatusMsg(data.message);
    });

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('progress');
      socket.off('result');
      socket.off('cancelled');
      socket.off('error');
      socket.off('status');
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------
  const handleGenerate = useCallback(() => {
    if (generating) return;

    const payload = {
      mode,
      ...params,
      strokes: mode === 'stencil' ? strokes : undefined,
    };

    setGenerating(true);
    setStep(0);
    setTotalSteps(params.steps || 20);
    setImageB64(null);
    setStatusMsg('Starting…');
    socket.emit('generate', payload);
  }, [generating, mode, params, strokes]);

  const handleIntervene = useCallback(() => {
    socket.emit('intervene', { prompt: params.intervention_prompt });
    setStatusMsg(`Intervened at step ${step}`);
  }, [params.intervention_prompt, step]);

  const handleCancel = useCallback(() => {
    socket.emit('cancel');
    setStatusMsg('Cancelling…');
  }, []);

  const handleModeChange = useCallback((newMode) => {
    setMode(newMode);
    setStatusMsg('');
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
    <div className="app">
      <header className="app-header">
        <div className="header-title">
          <h1 className="logo logo-clickable" onClick={() => { setShowAbout(false); setShowContact(false); }}>PromptPaint</h1>
          <p className="logo-subtitle">Generate art like you are painting</p>
        </div>
        <div className="header-right">
          <img src={uoftLogoDataUri} alt="University of Toronto" className="uoft-logo" />
        </div>
      </header>

      <main className="app-body">
        {showAbout   && <About   onClose={() => setShowAbout(false)} />}
        {showContact && <Contact onClose={() => setShowContact(false)} />}
        <Sidebar
          mode={mode}               onModeChange={handleModeChange}
          params={params}           onParamsChange={setParams}
          onGenerate={handleGenerate}
          onIntervene={handleIntervene}
          onCancel={handleCancel}
          generating={generating}
          step={step}               totalSteps={totalSteps}
          brushRadius={brushRadius} onBrushRadiusChange={setBrushRadius}
        />

        <section className="canvas-area">

          {/* Hamburger menu — top-left of canvas area */}
          <div className="canvas-menu-container" ref={menuRef}>
            <button className="hamburger-menu" onClick={() => setMenuOpen(o => !o)}>
              <span></span>
              <span></span>
              <span></span>
            </button>
            {menuOpen && (
              <div className="canvas-dropdown">
                <div className="canvas-menu-label">Theme</div>
                <button className="canvas-menu-item">
                  <svg className="canvas-menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
                  </svg>
                  Light
                </button>
                <button className="canvas-menu-item active">
                  <svg className="canvas-menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                  </svg>
                  Dark
                </button>
                <div className="canvas-menu-label">More</div>
                <button className="canvas-menu-item" onClick={() => { setShowAbout(true); setMenuOpen(false); }}>
                  <svg className="canvas-menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
                  </svg>
                  About
                </button>
                <button className="canvas-menu-item" onClick={() => { setShowContact(true); setMenuOpen(false); }}>
                  <svg className="canvas-menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>
                  </svg>
                  Contact
                </button>
              </div>
            )}
          </div>

          <Canvas
            imageB64={imageB64}
            stencilMode={mode === 'stencil'}
            brushRadius={brushRadius}
            onStrokesChange={setStrokes}
          />
          <p className="canvas-area-footer">
            This page is an implementation of the PromptPaint paper. More in About
          </p>
        </section>
      </main>
    </div>
  );
}
