import csv
import json
import os
import secrets
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

# Use SECRET_KEY from env; fall back to a per-process random key with a warning.
_secret_key = os.getenv('SECRET_KEY')
if not _secret_key or _secret_key in ('dev-secret-key', 'change-me-in-production', 'change-me-to-a-random-secret'):
    _secret_key = secrets.token_hex(32)
    print('⚠ WARNING: SECRET_KEY not set or using a placeholder. Generated a random key — sessions will not persist across restarts.')
app.config['SECRET_KEY'] = _secret_key

# CORS origins: comma-separated list or "*". Set ALLOWED_ORIGINS in .env for production.
_origins_env = os.getenv('ALLOWED_ORIGINS', '*')
_allowed_origins = [o.strip() for o in _origins_env.split(',')] if _origins_env != '*' else '*'

CORS(app, resources={r"/api/*": {"origins": _allowed_origins}})

socketio = SocketIO(
    app,
    cors_allowed_origins=_allowed_origins,
    async_mode='eventlet',
    logger=False,
    engineio_logger=False,
    max_http_buffer_size=20_000_000,  # 20MB — needed for stencil image payloads
)

MODEL_URL            = os.getenv('MODEL_SERVICE_URL', 'http://model:8000')
MODEL_CONTAINER_NAME = os.getenv('MODEL_CONTAINER_NAME', 'promptpaint-model')
LOGS_DIR             = os.getenv('LOGS_DIR', '/app/logs')

# In-memory rate limit stores: ip -> last request timestamp (or active count)
_model_start_times:   dict[str, float] = {}   # last fresh-start timestamp per IP
_model_restart_times: dict[str, float] = {}   # last restart timestamp per IP
_contact_times:       dict[str, float] = {}
_upload_times:        dict[str, float] = {}
_ip_generate_count:   dict[str, int]   = {}   # active generation jobs per IP

MODEL_START_COOLDOWN   = 300  # seconds — fresh start (container stopped)
MODEL_RESTART_COOLDOWN = 30   # seconds — restart (container running but unresponsive)
CONTACT_COOLDOWN       = 30   # seconds
UPLOAD_COOLDOWN        = 5    # seconds
IP_GENERATE_MAX        = 1    # max simultaneous generate jobs per IP
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


def _sanitize_csv(value) -> str:
    """Prevent formula injection: escape values that start with formula trigger characters."""
    s = str(value)
    if s and s[0] in ('=', '+', '-', '@', '\t', '\r'):
        return "'" + s
    return s


def write_csv_row(filepath, headers, row):
    """Append a row to a CSV file, writing headers if the file is new."""
    file_exists = os.path.exists(filepath)
    try:
        with open(filepath, 'a', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)
            if not file_exists:
                writer.writerow(headers)
            writer.writerow([_sanitize_csv(v) for v in row])
    except Exception as e:
        print(f'✗ Failed to write CSV {filepath}: {e}')


# ---------------------------------------------------------------------------
# REST
# ---------------------------------------------------------------------------

_CONTACT_SUBJECT_MAX = 200
_CONTACT_MESSAGE_MAX = 5000


@app.route('/api/contact/message', methods=['POST'])
def contact_message():
    ip  = get_client_ip()
    now = time.time()
    if now - _contact_times.get(ip, 0) < CONTACT_COOLDOWN:
        return jsonify({'error': 'Too many requests. Please wait before submitting again.'}), 429
    _contact_times[ip] = now

    body = request.get_json(silent=True) or {}
    subject = (body.get('subject') or '').strip()
    message = (body.get('message') or '').strip()

    if not subject or not message:
        return jsonify({'error': 'Subject and message are required.'}), 400

    if len(subject) > _CONTACT_SUBJECT_MAX or len(message) > _CONTACT_MESSAGE_MAX:
        return jsonify({'error': 'Subject or message is too long.'}), 400

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
    ip  = get_client_ip()
    now = time.time()
    if now - _upload_times.get(ip, 0) < UPLOAD_COOLDOWN:
        return jsonify({'status': 'ok'}), 200  # silently drop, not worth bothering the client
    _upload_times[ip] = now

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


def _model_is_responsive() -> bool:
    """Return True if the model HTTP service is actually answering requests."""
    try:
        r = requests.get(f'{MODEL_URL}/health', timeout=2)
        return r.status_code == 200
    except Exception:
        return False


@app.route('/api/model/start', methods=['POST'])
def model_start():
    ip        = get_client_ip()
    now       = time.time()
    timestamp = datetime.now(timezone.utc).isoformat()

    try:
        client    = docker.from_env()
        container = client.containers.get(MODEL_CONTAINER_NAME)

        if container.status == 'running':
            if _model_is_responsive():
                # Container up and model is healthy — nothing to do.
                write_csv_row(MODEL_START_LOG, ['timestamp', 'ip', 'status'], [timestamp, ip, 'already_running'])
                return jsonify({'status': 'already_running'}), 200

            # Container is running but the model service is not responding
            # (e.g. crashed, OOM, still loading after a previous unhealthy state).
            # Apply a short cooldown to avoid hammering restarts.
            last_restart = _model_restart_times.get(ip, 0)
            if now - last_restart < MODEL_RESTART_COOLDOWN:
                remaining = int(MODEL_RESTART_COOLDOWN - (now - last_restart))
                write_csv_row(MODEL_START_LOG, ['timestamp', 'ip', 'status'], [timestamp, ip, 'rate_limited'])
                return jsonify({'status': 'rate_limited', 'retry_after': remaining}), 429

            container.restart()
            _model_restart_times[ip] = now
            write_csv_row(MODEL_START_LOG, ['timestamp', 'ip', 'status'], [timestamp, ip, 'restarting'])
            print(f'✓ Model container restarted (was unresponsive) | IP: {ip}')
            return jsonify({'status': 'starting'}), 200

        # Container is stopped — apply the longer fresh-start cooldown.
        last_start = _model_start_times.get(ip, 0)
        if now - last_start < MODEL_START_COOLDOWN:
            remaining = int(MODEL_START_COOLDOWN - (now - last_start))
            write_csv_row(MODEL_START_LOG, ['timestamp', 'ip', 'status'], [timestamp, ip, 'rate_limited'])
            return jsonify({'status': 'rate_limited', 'retry_after': remaining}), 429

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
        print(f'✗ model_start error | IP: {ip} | {e}')
        return jsonify({'status': 'error', 'message': 'An unexpected error occurred.'}), 500


# ---------------------------------------------------------------------------
# Socket.IO
# ---------------------------------------------------------------------------

# _ip_generate_count tracks active generate jobs per IP (defined above with rate limit stores).


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
    ip  = get_client_ip()

    # Per-IP concurrency limit: prevents curl attacks opening many connections.
    if _ip_generate_count.get(ip, 0) >= IP_GENERATE_MAX:
        emit('error', {'message': 'A generation is already in progress. Please wait.'})
        return
    _ip_generate_count[ip] = _ip_generate_count.get(ip, 0) + 1

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

    def stream_generation(sid, ip, data):
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
            print(f'✗ stream_generation error | sid={sid} | {e}')
            socketio.emit('error', {'message': 'An error occurred during generation.'}, to=sid)
        finally:
            _ip_generate_count[ip] = max(0, _ip_generate_count.get(ip, 1) - 1)

    socketio.start_background_task(stream_generation, sid, ip, data)


# ---------------------------------------------------------------------------

if __name__ == '__main__':
    port  = int(os.getenv('PORT', 5000))
    debug = os.getenv('FLASK_DEBUG', 'False').lower() == 'true'
    # allow_unsafe_werkzeug suppresses a Flask-SocketIO warning about Werkzeug's
    # dev server; only needed (and acceptable) in debug mode.
    socketio.run(app, host='0.0.0.0', port=port, debug=debug,
                 allow_unsafe_werkzeug=debug)
