"""Read CPA's authenticated usage subscription; persist only routing observations."""
import datetime as dt
import hashlib
import json
import os
import re
import select
import socket
import sqlite3
import threading
import time
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

MAX_PAYLOAD = 8 * 1024 * 1024
IDENTIFIER = re.compile(r'^[a-zA-Z0-9][a-zA-Z0-9._:/()+-]{0,159}$')
OPAQUE_ID = re.compile(r'^[a-fA-F0-9-]{8,128}$')
EFFORTS = {'none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'auto'}


def identifier(value):
    return value if isinstance(value, str) and IDENTIFIER.fullmatch(value) and not value.lower().startswith(('sk-', 'bearer')) else ''


def opaque_id(value):
    if not isinstance(value, str) or not value:
        return ''
    return value if OPAQUE_ID.fullmatch(value) else hashlib.sha256(value.encode()).hexdigest()[:32]


def number(value, maximum=10**12):
    return min(maximum, max(0, value)) if isinstance(value, (int, float)) and not isinstance(value, bool) and value == value else 0


def model_family(model):
    name = model.lower().split('/')[-1]
    for prefixes, family in [(('claude-',), 'claude'), (('gpt-', 'o1', 'o3', 'o4'), 'openai'), (('gemini-',), 'google'), (('grok-',), 'xai'), (('kimi-',), 'kimi')]:
        if name.startswith(prefixes):
            return family
    return ''


def provider_family(provider):
    return {'codex': 'openai', 'openai': 'openai', 'openai-compatibility': 'openai', 'gemini': 'google', 'vertex': 'google', 'antigravity': 'google'}.get(provider, provider)


def normalize_cache(record):
    breakdown = record.get('token_breakdown')
    if not isinstance(breakdown, dict) or breakdown.get('schema_version') != 2 or breakdown.get('quality') != 'complete':
        return None
    values = breakdown.get('input')
    if not isinstance(values, dict):
        return None
    keys = ('total_tokens', 'uncached_tokens', 'cache_read_tokens', 'cache_write_tokens')
    if any(type(values.get(key)) is not int or not 0 <= values[key] <= 10**12 for key in keys):
        return None
    if values['total_tokens'] != sum(values[key] for key in keys[1:]):
        return None
    return {key: values[key] for key in keys}


def hit(cache):
    return 100 * cache['cache_read_tokens'] / cache['total_tokens'] if cache and cache['total_tokens'] else None


def normalize(record):
    if not isinstance(record, dict):
        return None
    try:
        requested_at = dt.datetime.fromisoformat(str(record.get('timestamp', '')).replace('Z', '+00:00')).timestamp()
        if not 0 < requested_at < time.time() + 86400:
            return None
    except (ValueError, OverflowError):
        return None
    provider, model = identifier(record.get('provider')), identifier(record.get('model'))
    if not provider or not model:
        return None
    requested_model = identifier(record.get('alias')) or model
    family = model_family(requested_model)
    failed = record.get('failed') is True
    kind = 'failed_attempt' if failed else 'provider_replacement' if family and family != provider_family(provider) else 'model_mapping' if requested_model != model else 'direct'
    fail = record.get('fail') if isinstance(record.get('fail'), dict) else {}
    latency = number(record.get('latency_ms'), 86400000)
    event = {
        'requested_at': int(requested_at * 1000), 'completed_at': int(requested_at * 1000 + latency),
        'provider': provider, 'requested_provider': family, 'requested_model': requested_model,
        'actual_model': model, 'response_model': identifier(record.get('response_model')),
        'kind': kind, 'failed': failed, 'status_code': int(number(fail.get('status_code'), 599)) if failed else 200,
        'effort': record.get('reasoning_effort') if isinstance(record.get('reasoning_effort'), str) and record['reasoning_effort'] in EFFORTS else '',
        'latency_ms': latency, 'session_id': opaque_id(record.get('session_id')),
        'parent_session_id': opaque_id(record.get('parent_session_id')),
        'trace_id': opaque_id(record.get('request_id')),
        'account_id': opaque_id(record.get('auth_index')), 'cache': normalize_cache(record),
    }
    event['id'] = opaque_id(record.get('execution_id')) or hashlib.sha256(json.dumps(event, sort_keys=True).encode()).hexdigest()
    return event


class Store:
    def __init__(self, path):
        self.path = str(path)
        self.lock = threading.RLock()
        self.connected = False
        self.last_seen = 0
        self.disconnections = 0
        self.last_error = ''
        self.accounts = {}
        with self.connect() as db:
            db.executescript('''CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, completed_at INTEGER, kind TEXT, session_id TEXT, trace_id TEXT, failed INTEGER, body TEXT);
                CREATE INDEX IF NOT EXISTS events_time ON events(completed_at);
                CREATE INDEX IF NOT EXISTS events_session ON events(session_id, completed_at);
                CREATE INDEX IF NOT EXISTS events_trace ON events(trace_id);''')
        os.chmod(self.path, 0o600)

    def connect(self):
        return sqlite3.connect(self.path, timeout=10)

    def add(self, raw):
        event = normalize(raw)
        if event is None:
            return
        with self.connect() as db:
            db.execute('INSERT OR IGNORE INTO events VALUES (?, ?, ?, ?, ?, ?, ?)', (event['id'], event['completed_at'], event['kind'], event['session_id'], event['trace_id'], event['failed'], json.dumps(event)))

    def prune(self):
        with self.connect() as db:
            db.execute('DELETE FROM events WHERE completed_at < ?', (int((time.time() - 7 * 86400) * 1000),))
            db.execute('DELETE FROM events WHERE id IN (SELECT id FROM events ORDER BY completed_at DESC LIMIT -1 OFFSET 100000)')

    def snapshot(self):
        with self.connect() as db, self.lock:
            def enrich(body):
                event = json.loads(body)
                event['account'] = self.accounts.get(event['account_id'], '')
                previous = db.execute('SELECT body FROM events WHERE session_id = ? AND session_id != ? AND failed = 0 AND completed_at < ? ORDER BY completed_at DESC LIMIT 1', (event['session_id'], '', event['completed_at'])).fetchone() if not event['failed'] else None
                event['account_changed'] = False
                event['previous_cache_hit'] = None
                event['cache_drop'] = False
                if previous:
                    previous = json.loads(previous[0])
                    previous_hit, current_hit = hit(previous.get('cache')), hit(event.get('cache'))
                    event['previous_cache_hit'] = previous_hit
                    event['cache_drop'] = bool(previous_hit is not None and current_hit is not None and previous_hit >= 50 and previous_hit - current_hit >= 25 and previous['cache']['total_tokens'] >= 4096 and event['cache']['total_tokens'] >= 4096 and event['completed_at'] - previous['completed_at'] < 600000)
                    event['account_changed'] = bool(previous['provider'] == event['provider'] and previous['account_id'] and event['account_id'] and previous['account_id'] != event['account_id'])
                    if event['account_changed'] and event['kind'] == 'direct':
                        event['kind'] = 'account_change'
                failures = db.execute('SELECT body FROM events WHERE trace_id = ? AND trace_id != ? AND failed = 1 AND completed_at <= ? ORDER BY completed_at LIMIT 20', (event['trace_id'], '', event['completed_at'])).fetchall()
                event['attempts'] = [{'provider': attempt['provider'], 'model': attempt['actual_model'], 'status_code': attempt['status_code']} for (body,) in failures if (attempt := json.loads(body))['id'] != event['id']]
                codes = [attempt['status_code'] for attempt in event['attempts']]
                event['reason'] = 'rate_limit' if 429 in codes else 'authentication' if any(code in (401, 403) for code in codes) else 'upstream_error' if any(code >= 500 for code in codes) else 'not_reported'
                return event
            rows = db.execute('SELECT body FROM events ORDER BY completed_at DESC LIMIT 200').fetchall()
            last = db.execute('SELECT body FROM events WHERE failed = 0 ORDER BY completed_at DESC LIMIT 1').fetchone()
            replacement = db.execute("SELECT body FROM events WHERE kind = 'provider_replacement' ORDER BY completed_at DESC LIMIT 1").fetchone()
            cache_rows = db.execute("SELECT json_extract(body, '$.provider'), json_extract(body, '$.actual_model'), COUNT(*), SUM(CASE WHEN json_extract(body, '$.cache.total_tokens') IS NOT NULL THEN 1 ELSE 0 END), SUM(json_extract(body, '$.cache.total_tokens')), SUM(json_extract(body, '$.cache.cache_read_tokens')), SUM(json_extract(body, '$.cache.cache_write_tokens')) FROM events WHERE failed = 0 AND completed_at >= ? GROUP BY 1, 2", (int((time.time() - 900) * 1000),)).fetchall()
            cache_groups = [{'provider': row[0], 'model': row[1], 'requests': row[2], 'reported_requests': row[3], 'input_tokens': row[4] or 0, 'read_tokens': row[5] or 0, 'write_tokens': row[6] or 0} for row in cache_rows]
            cache_summary = {key: sum(group[key] for group in cache_groups) for key in ('requests', 'reported_requests', 'input_tokens', 'read_tokens', 'write_tokens')}
            cache_summary['groups'] = cache_groups
            return {
                'cache_summary': cache_summary,
                'version': 1, 'server_time': int(time.time() * 1000),
                'connected': self.connected and time.time() - self.last_seen < 35,
                'last_seen': int(self.last_seen * 1000), 'disconnections': self.disconnections,
                'last_error': self.last_error, 'retention_days': 7,
                'events': [enrich(row[0]) for row in rows],
                'latest_served': enrich(last[0]) if last else None,
                'latest_replacement': enrich(replacement[0]) if replacement else None,
            }


def resp_command(*args):
    parts = [arg.encode() for arg in args]
    return b'*%d\r\n' % len(parts) + b''.join(b'$%d\r\n' % len(part) + part + b'\r\n' for part in parts)


def read_exact(reader, size):
    data = bytearray()
    while len(data) < size:
        part = reader.read(size - len(data))
        if not part:
            raise EOFError('closed')
        data.extend(part)
    return bytes(data)


def read_resp(reader, depth=0):
    if depth > 4:
        raise ValueError('depth')
    prefix = read_exact(reader, 1)
    line = reader.readline(256)
    if not line.endswith(b'\r\n'):
        raise ValueError('line')
    value = line[:-2]
    if prefix == b'-':
        raise ValueError('upstream authentication or protocol error')
    if prefix in (b'+', b':'):
        return value
    if prefix == b'$':
        size = int(value)
        if size == -1:
            return None
        if not 0 <= size <= MAX_PAYLOAD:
            raise ValueError('size')
        payload = read_exact(reader, size)
        if read_exact(reader, 2) != b'\r\n':
            raise ValueError('terminator')
        return payload
    if prefix == b'*':
        size = int(value)
        if not 0 <= size <= 16:
            raise ValueError('array')
        return [read_resp(reader, depth + 1) for _ in range(size)]
    raise ValueError('prefix')


def management_get(base, key, path):
    request = urllib.request.Request(base + '/v8/management' + path, headers={'Authorization': 'Bearer ' + key})
    with urllib.request.urlopen(request, timeout=15) as response:
        data = response.read(MAX_PAYLOAD + 1)
        if len(data) > MAX_PAYLOAD:
            raise ValueError('size')
        return json.loads(data)


def collect(store, host, port, key):
    base = f'http://{host}:{port}'
    backfill_done = False
    while True:
        try:
            with socket.create_connection((host, port), timeout=20) as sock, sock.makefile('rb', buffering=0) as reader:
                sock.sendall(resp_command('AUTH', key))
                if read_resp(reader) != b'OK':
                    raise ValueError('auth')
                sock.sendall(resp_command('SUBSCRIBE', 'usage'))
                ready = read_resp(reader)
                if not isinstance(ready, list) or ready[0] != b'subscribe':
                    raise ValueError('subscribe')
                with store.lock:
                    store.connected, store.last_seen, store.last_error = True, time.time(), ''
                # Subscribe first, then drain the retained backlog through a separate connection.
                if not backfill_done:
                    rows = management_get(base, key, '/observability/usage/queue?count=2000')
                    if isinstance(rows, list):
                        for record in rows:
                            store.add(record)
                    backfill_done = True
                last_accounts = 0
                last_ping = 0
                while True:
                    now = time.time()
                    if now - last_accounts > 300:
                        try:
                            files = management_get(base, key, '/credentials').get('files', [])
                            names = {opaque_id(f.get('auth_index')): f['email'] for f in files if isinstance(f, dict) and isinstance(f.get('email'), str) and re.fullmatch(r'[^\s@]{1,100}@[^\s@]{1,100}', f['email'])}
                            with store.lock:
                                store.accounts = names
                        except (OSError, ValueError, AttributeError):
                            pass
                        store.prune()
                        last_accounts = now
                    if now - last_ping >= 10:
                        sock.sendall(resp_command('PING'))
                        last_ping = now
                    if not select.select([sock], [], [], 5)[0]:
                        if now - store.last_seen > 30:
                            raise TimeoutError('heartbeat')
                        continue
                    message = read_resp(reader)
                    with store.lock:
                        store.last_seen = time.time()
                    if isinstance(message, list) and len(message) == 3 and message[0] == b'message':
                        store.add(json.loads(message[2]))
        except (OSError, ValueError, EOFError, sqlite3.Error, TypeError):
            with store.lock:
                store.connected = False
                store.disconnections += 1
                store.last_error = 'upstream_unavailable'
            time.sleep(3)


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path not in ('/events', '/health'):
            self.send_error(404)
            return
        data = json.dumps(self.server.store.snapshot(), allow_nan=False).encode()
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *_args):
        pass


def main():
    import fcntl
    os.umask(0o077)
    directory = Path(os.environ.get('DATA_DIR', '/data'))
    directory.mkdir(parents=True, exist_ok=True)
    lock = (directory / 'collector.lock').open('w')
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    key = Path(os.environ.get('CPA_KEY_FILE', '/run/secrets/management-key')).read_text().strip()
    if not key:
        raise ValueError('missing management key')
    store = Store(directory / 'routing.sqlite')
    threading.Thread(target=collect, args=(store, os.environ.get('CPA_HOST', 'cli-proxy-api'), int(os.environ.get('CPA_PORT', '8317')), key), daemon=True).start()
    server = ThreadingHTTPServer(('0.0.0.0', 8787), Handler)
    server.store = store
    server.serve_forever()


if __name__ == '__main__':
    main()
