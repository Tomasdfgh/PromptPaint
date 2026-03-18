import os
import threading

from flask import Flask, jsonify, request
from flask_socketio import SocketIO, emit
from flask_cors import CORS
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'dev-secret-key')

CORS(app, resources={r"/api/*": {"origins": "*"}})

socketio = SocketIO(
    app,
    cors_allowed_origins="*",
    async_mode='eventlet',
    logger=False,
    engineio_logger=False,
)


# ---------------------------------------------------------------------------
# REST endpoints
# ---------------------------------------------------------------------------

@app.route('/api/health', methods=['GET'])
def health():
    from pipeline import get_pipeline
    try:
        get_pipeline()
        model_status = "loaded"
    except RuntimeError:
        model_status = "not loaded"
    return jsonify({'status': 'ok', 'model': model_status})


# ---------------------------------------------------------------------------
# Socket.IO events
# ---------------------------------------------------------------------------

@socketio.on('connect')
def on_connect():
    emit('status', {'message': 'connected'})


@socketio.on('generate')
def on_generate(data):
    """
    Start a generation. Payload shape depends on mode:

    Standard:
      { mode: "standard", prompt, steps, cfg_scale, negative_prompt }

    Mixing:
      { mode: "mixing", prompt_a, prompt_b, alpha, steps, cfg_scale }

    Directional:
      { mode: "directional", prompt, from_concept, to_concept, scale, steps }

    Stencil:
      { mode: "stencil", prompt_a, prompt_b, strokes: [{x,y,radius}], steps }

    Intervention:
      { mode: "intervention", prompt, intervention_prompt, intervention_step, steps }
    """
    from generation import run_generation, generation_state

    if generation_state.running:
        emit('error', {'message': 'Generation already in progress'})
        return

    sid = request.sid

    thread = threading.Thread(
        target=run_generation,
        args=(data, socketio, sid),
        daemon=True,
    )
    thread.start()


@socketio.on('intervene')
def on_intervene(data):
    """
    Hot-swap the active embedding mid-generation.
    { prompt: "new prompt text" }
    """
    from generation import generation_state
    from pipeline import get_pipeline
    from features.embedding import encode_prompt

    if not generation_state.running:
        emit('error', {'message': 'No generation in progress'})
        return

    prompt = data.get('prompt', '')
    pipe = get_pipeline()
    new_emb = encode_prompt(prompt, pipe)
    generation_state.set_embedding(new_emb)
    emit('status', {'message': f'Prompt updated at step {generation_state.current_step}'})


@socketio.on('cancel')
def on_cancel():
    """Cancel the current generation."""
    from generation import generation_state
    generation_state.request_cancel()
    emit('status', {'message': 'Cancellation requested'})


# ---------------------------------------------------------------------------

if __name__ == '__main__':
    # Load model at startup so the first request isn't slow
    from pipeline import load_pipeline
    load_pipeline()

    port = int(os.getenv('PORT', 5000))
    debug = os.getenv('FLASK_DEBUG', 'False').lower() == 'true'
    socketio.run(app, host='0.0.0.0', port=port, debug=debug, allow_unsafe_werkzeug=True)
