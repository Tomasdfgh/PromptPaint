import { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import './App.css';

const socket = io({ path: '/socket.io' });

function App() {
  const [prompt, setPrompt] = useState('');
  const [status, setStatus] = useState('idle');
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('generation_update', (data) => {
      setStatus(data.status);
    });
    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('generation_update');
    };
  }, []);

  const handleGenerate = () => {
    if (!prompt.trim()) return;
    setStatus('started');
    socket.emit('generate', { prompt });
  };

  return (
    <div className="app">
      <header className="app-header">
        <span className="logo">PromptPaint</span>
        <span className={`connection-dot ${connected ? 'connected' : 'disconnected'}`} title={connected ? 'Connected' : 'Disconnected'} />
      </header>

      <main className="app-body">
        <aside className="sidebar">
          <section className="panel">
            <h2>Prompt</h2>
            <textarea
              className="prompt-input"
              rows={4}
              placeholder="Describe what you want to paint..."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && e.metaKey) handleGenerate(); }}
            />
            <button className="btn-generate" onClick={handleGenerate} disabled={status === 'started'}>
              {status === 'started' ? 'Generating…' : 'Generate'}
            </button>
          </section>
        </aside>

        <section className="canvas-area">
          <div className="canvas-placeholder">
            <p>Canvas coming soon</p>
            <p className="canvas-sub">Your generated image will appear here</p>
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
