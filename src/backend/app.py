import csv
import json
import os
import time
from datetime import datetime, timezone

import docker
import requests
from dotenv import load_dotenv
from flask import Flask, jsonify, request
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
    max_http_buffer_size=20_000_000,  # 20MB — needed for stencil image payloads
)

MODEL_URL            = os.getenv('MODEL_SERVICE_URL', 'http://model:8000')
MODEL_CONTAINER_NAME = os.getenv('MODEL_CONTAINER_NAME', 'promptpaint-model')
LOGS_DIR             = os.getenv('LOGS_DIR', '/app/logs')

# In-memory rate limit store: ip -> last request timestamp
_model_start_times: dict[str, float] = {}
MODEL_START_COOLDOWN = 300  # seconds
CONTACT_LOG    = os.path.join(LOGS_DIR, 'contact_messages.csv')
PROMPT_LOG     = os.path.join(LOGS_DIR, 'prompt_request_logs.csv')
TRAFFIC_LOG    = os.path.join(LOGS_DIR, 'traffic_log.csv')
UPLOAD_LOG     = os.path.join(LOGS_DIR, 'image_upload_log.csv')
MODEL_START_LOG = os.path.join(LOGS_DIR, 'model_start_requests.csv')

os.makedirs(LOGS_DIR, exist_ok=True)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def get_client_ip():
    """Return the real client IP, honoring common proxy headers."""
    if request.headers.get('X-Forwarded-For'):
        return request.headers.get('X-Forwarded-For').split(',')[0].strip()
    if request.headers.get('X-Real-IP'):
        return request.headers.get('X-Real-IP').strip()
    if request.headers.get('CF-Connecting-IP'):
        return request.headers.get('CF-Connecting-IP').strip()
    return request.remote_addr or 'unknown'


def write_csv_row(filepath, headers, row):
    """Append a row to a CSV file, writing headers if the file is new."""
    file_exists = os.path.exists(filepath)
    try:
        with open(filepath, 'a', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)
            if not file_exists:
                writer.writerow(headers)
            writer.writerow(row)
    except Exception as e:
        print(f'✗ Failed to write CSV {filepath}: {e}')


# ---------------------------------------------------------------------------
# REST
# ---------------------------------------------------------------------------

@app.route('/api/contact/message', methods=['POST'])
def contact_message():
    body = request.get_json(silent=True) or {}
    subject = (body.get('subject') or '').strip()
    message = (body.get('message') or '').strip()

    if not subject or not message:
        return jsonify({'error': 'Subject and message are required.'}), 400

    ip        = get_client_ip()
    timestamp = datetime.now(timezone.utc).isoformat()

    write_csv_row(
        CONTACT_LOG,
        ['timestamp', 'ip', 'subject', 'message'],
        [timestamp, ip, subject, message],
    )
    print(f'✓ Contact message received | IP: {ip} | Subject: {subject[:40]}')
    return jsonify({'status': 'ok'}), 200


@app.route('/api/log/upload', methods=['POST'])
def log_upload():
    body = request.get_json(silent=True) or {}
    ip        = get_client_ip()
    timestamp = datetime.now(timezone.utc).isoformat()
    width     = body.get('width', '')
    height    = body.get('height', '')
    write_csv_row(
        UPLOAD_LOG,
        ['timestamp', 'ip', 'width', 'height'],
        [timestamp, ip, width, height],
    )
    return jsonify({'status': 'ok'}), 200


@app.route('/api/health', methods=['GET'])
def health():
    try:
        r = requests.get(f'{MODEL_URL}/health', timeout=3)
        model_status = r.json()
    except Exception:
        model_status = 'unreachable'
    return jsonify({'status': 'ok', 'model': model_status})


@app.route('/api/model/start', methods=['POST'])
def model_start():
    ip        = get_client_ip()
    now       = time.time()
    timestamp = datetime.now(timezone.utc).isoformat()
    last = _model_start_times.get(ip, 0)
    if now - last < MODEL_START_COOLDOWN:
        remaining = int(MODEL_START_COOLDOWN - (now - last))
        write_csv_row(MODEL_START_LOG, ['timestamp', 'ip', 'status'], [timestamp, ip, 'rate_limited'])
        return jsonify({'status': 'rate_limited', 'retry_after': remaining}), 429

    try:
        client    = docker.from_env()
        container = client.containers.get(MODEL_CONTAINER_NAME)
        if container.status == 'running':
            write_csv_row(MODEL_START_LOG, ['timestamp', 'ip', 'status'], [timestamp, ip, 'already_running'])
            return jsonify({'status': 'already_running'}), 200
        container.start()
        _model_start_times[ip] = now
        write_csv_row(MODEL_START_LOG, ['timestamp', 'ip', 'status'], [timestamp, ip, 'starting'])
        print(f'✓ Model container start requested | IP: {ip}')
        return jsonify({'status': 'starting'}), 200
    except docker.errors.NotFound:
        write_csv_row(MODEL_START_LOG, ['timestamp', 'ip', 'status'], [timestamp, ip, 'error_not_found'])
        return jsonify({'status': 'error', 'message': f'Container "{MODEL_CONTAINER_NAME}" not found'}), 404
    except Exception as e:
        write_csv_row(MODEL_START_LOG, ['timestamp', 'ip', 'status'], [timestamp, ip, f'error: {e}'])
        return jsonify({'status': 'error', 'message': str(e)}), 500


# ---------------------------------------------------------------------------
# Socket.IO
# ---------------------------------------------------------------------------

@socketio.on('connect')
def on_connect():
    timestamp = datetime.now(timezone.utc).isoformat()
    ip = get_client_ip()
    write_csv_row(
        TRAFFIC_LOG,
        ['timestamp', 'ip'],
        [timestamp, ip],
    )


@socketio.on('generate')
def on_generate(data):
    """
    Forward the generate request to the model service and stream
    progress events back to the client via Socket.IO.

    Uses socketio.start_background_task (eventlet-safe) instead of
    raw threading.Thread.
    """
    from flask import request as flask_request
    sid = flask_request.sid
    data['session_id'] = sid

    # Log prompt composition (non-zero prompts + directional prompts)
    try:
        timestamp = datetime.now(timezone.utc).isoformat()
        ip = get_client_ip()
        prompts = data.get('prompts', [])
        active_prompts = [p for p in prompts if float(p.get('weight', 0)) > 0.001 and p.get('text', '').strip()]
        composition = '; '.join(f'"{p["text"]}" ({round(float(p["weight"]) * 100)}%)' for p in active_prompts)
        directional = data.get('directional_prompts', [])
        active_dir = [d for d in directional if d.get('from', '').strip() and d.get('to', '').strip() and float(d.get('scale', 0)) != 0]
        dir_str = '; '.join(
            f'from="{d["from"]}" to="{d["to"]}" scale={d.get("scale",1)}'
            for d in active_dir
        ) or '(none)'
        write_csv_row(
            PROMPT_LOG,
            ['timestamp', 'ip', 'mode', 'composition', 'directional_prompts', 'steps', 'width', 'height'],
            [timestamp, ip, data.get('mode', ''), composition, dir_str,
             data.get('steps', ''), data.get('width', ''), data.get('height', '')],
        )
    except Exception as e:
        print(f'✗ Failed to log prompt request: {e}')

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
                    socketio.sleep(0)
        except Exception as e:
            socketio.emit('error', {'message': str(e)}, to=sid)

    socketio.start_background_task(stream_generation, sid, data)


# ---------------------------------------------------------------------------

if __name__ == '__main__':
    port  = int(os.getenv('PORT', 5000))
    debug = os.getenv('FLASK_DEBUG', 'False').lower() == 'true'
    socketio.run(app, host='0.0.0.0', port=port, debug=debug, allow_unsafe_werkzeug=True)
