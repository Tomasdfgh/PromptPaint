import { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import Sidebar from './components/Sidebar';
import Canvas from './components/Canvas';
import './App.css';

const socket = io({ path: '/socket.io' });

const DEFAULT_PARAMS = {
  prompt: '',
  negative_prompt: '',
  prompt_a: '',
  prompt_b: '',
  from_concept: '',
  to_concept: '',
  intervention_prompt: '',
  alpha: 0.5,
  scale: 1.0,
  steps: 30,
  cfg_scale: 7.5,
  preview_every: 3,
  intervention_step: 15,
};

export default function App() {
  const [connected,   setConnected]   = useState(false);
  const [mode,        setMode]        = useState('standard');
  const [params,      setParams]      = useState(DEFAULT_PARAMS);
  const [generating,  setGenerating]  = useState(false);
  const [step,        setStep]        = useState(0);
  const [totalSteps,  setTotalSteps]  = useState(0);
  const [imageB64,    setImageB64]    = useState(null);
  const [strokes,     setStrokes]     = useState([]);
  const [brushRadius, setBrushRadius] = useState(20);
  const [statusMsg,   setStatusMsg]   = useState('');


  // ---------------------------------------------------------------------------
  // Socket event listeners
  // ---------------------------------------------------------------------------
  useEffect(() => {
    socket.on('connect',    () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

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
    setTotalSteps(params.steps || 30);
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
          <h1 className="logo">PromptPaint</h1>
          <p className="logo-subtitle">Generate art like you are painting</p>
        </div>
        <div className="header-right">
          {statusMsg && <span className="status-msg">{statusMsg}</span>}
          <span
            className={`connection-dot ${connected ? 'connected' : 'disconnected'}`}
            title={connected ? 'Connected' : 'Disconnected'}
          />
        </div>
      </header>

      <main className="app-body">
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
          <Canvas
            imageB64={imageB64}
            stencilMode={mode === 'stencil'}
            brushRadius={brushRadius}
            onStrokesChange={setStrokes}
          />
        </section>
      </main>
    </div>
  );
}
