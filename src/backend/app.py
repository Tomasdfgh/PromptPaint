import json
import os

import requests
from dotenv import load_dotenv
from flask import Flask, jsonify
from flask_cors import CORS
from flask_socketio import SocketIO, emit

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

MODEL_URL = os.getenv('MODEL_SERVICE_URL', 'http://model:8000')


# ---------------------------------------------------------------------------
# REST
# ---------------------------------------------------------------------------

@app.route('/api/health', methods=['GET'])
def health():
    try:
        r = requests.get(f'{MODEL_URL}/health', timeout=3)
        model_status = r.json()
    except Exception:
        model_status = 'unreachable'
    return jsonify({'status': 'ok', 'model': model_status})


# ---------------------------------------------------------------------------
# Socket.IO
# ---------------------------------------------------------------------------

@socketio.on('connect')
def on_connect():
    emit('status', {'message': 'connected'})


@socketio.on('generate')
def on_generate(data):
    """
    Forward the generate request to the model service and stream
    progress events back to the client via Socket.IO.

    Uses socketio.start_background_task (eventlet-safe) instead of
    raw threading.Thread.
    """
    from flask_socketio import rooms
    sid = rooms()[0]  # current socket session id

    def stream_generation(sid, data):
        try:
            with requests.post(
                f'{MODEL_URL}/generate',
                json=data,
                stream=True,
                timeout=600,
            ) as resp:
                for line in resp.iter_lines():
                    if not line:
                        continue
                    event = json.loads(line)
                    etype = event.pop('type', 'progress')
                    socketio.emit(etype, event, to=sid)
        except Exception as e:
            socketio.emit('error', {'message': str(e)}, to=sid)

    socketio.start_background_task(stream_generation, sid, data)


@socketio.on('intervene')
def on_intervene(data):
    """Hot-swap prompt mid-generation."""
    try:
        r = requests.post(f'{MODEL_URL}/intervene', json=data, timeout=5)
        emit('status', r.json())
    except Exception as e:
        emit('error', {'message': str(e)})


@socketio.on('cancel')
def on_cancel():
    try:
        requests.post(f'{MODEL_URL}/cancel', timeout=3)
        emit('status', {'message': 'Cancellation requested'})
    except Exception as e:
        emit('error', {'message': str(e)})


# ---------------------------------------------------------------------------

if __name__ == '__main__':
    port  = int(os.getenv('PORT', 5000))
    debug = os.getenv('FLASK_DEBUG', 'False').lower() == 'true'
    socketio.run(app, host='0.0.0.0', port=port, debug=debug, allow_unsafe_werkzeug=True)
