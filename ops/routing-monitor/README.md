# Routing monitor

The frontend's Activity page needs per-request evidence. This optional internal service subscribes to CPA's authenticated native RESP usage stream, keeps a sanitized SQLite history, and exposes read-only observations. It does not change model routing or account priority.

## Deployment

The compose file joins CPA's existing `cli-proxy-api_default` Docker network. The backend hostname must be `cli-proxy-api`; set `CPA_HOST` and `CPA_PORT` if the installation differs. No monitor port is published. The frontend reads `http://fleet-routing-monitor:8787/events` through CPA's authenticated `/v8/management/requests/api-call` endpoint with `proxy_url: direct`.

Place the files in a private directory beside CPA. Prepare the runtime paths on the host:

```bash
install -d -m 700 -o 65532 -g 65532 data
install -m 400 -o 65532 -g 65532 /private/path/to/management-key management-key
docker compose -p fleet-routing-monitor up -d --build
```

`management-key` contains the existing CPA management key, with no variable name or quotes. Keep it outside version control. The image runs as UID 65532 with a read-only filesystem and no Linux capabilities. SQLite observations live in `data/routing.sqlite`, mode 600. The collector process owns an exclusive file lock; run only one collector for a given data directory.

## Evidence and retention

- A provider replacement means a successful request named a known provider's model family and CPA reported serving it through a different provider family. An arbitrary alias mapping is a separate event.
- Requested model comes from CPA's alias; served provider/model and effort come from the actual execution record. A prior failure is correlated only by CPA's request ID. Absent reasons stay unknown.
- Account changes compare consecutive successful observations in the same reported session. Only verified email metadata or opaque account IDs are exposed.
- Cache hit is cache-read input tokens divided by total input tokens over successful requests in the last 15 minutes. Only complete canonical schema-v2 accounting is accepted; legacy overlapping counters are excluded. Write tokens are shown separately.
- A cache-drop marker compares consecutive successful same-session requests within ten minutes, both with at least 4,096 input tokens. It requires a previous hit of at least 50% and a fall of at least 25 percentage points. New context, expiry, and routing can all change reuse.
- The service retains up to seven days and 100,000 observations, pruning every five minutes. The API returns the latest 200 and an aggregate cache summary. It records completed observations, not in-flight work.

The raw CPA queue includes credentials, headers, and error bodies. The collector whitelists routing/timing fields, opaque IDs, and canonical counters before persistence. It never saves raw usage records, source strings, API keys, access-token hashes, headers, prompts, response bodies, or IPs. Do not log or dump raw queue data while debugging.

CPA broadcasts new usage records to native subscribers instead of retaining them in the queue while subscribers are connected. This collector subscribes first, then reads up to 2,000 retained records on startup. Concurrent collectors can receive the same stream; the SQLite primary key deduplicates observations. History before installation, downtime beyond CPA's queue retention, and queue consumers that ran before the collector may leave gaps. Monitor disconnection and cache coverage are surfaced in the UI.

## Validation

```bash
python3 -m unittest discover -s ops/routing-monitor -v
bun test tests/routingMonitor.test.ts
```

The Python suite covers persistence, deduplication, provider/account changes, request correlation, canonical cache accounting, secret exclusion, and bounded RESP decoding. Browser QA must additionally check a real completed request, unavailable-monitor state, and mobile details.
