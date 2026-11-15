# Acceptance evidence

## Scope

Source-only `journeygap-grafana` distribution. No npm package, Grafana application,
real-user event or production deployment was created. Browser tests use a temporary
local Faro-compatible receiver on loopback and actual JourneyGap/Faro libraries.
HTTP receiver acceptance is not proof of durable Grafana Cloud ingestion.

## Versions and provenance

- Node 26.12.1 locally; CI targets Node 24.
- JourneyGap core/web 0.1.0, built from exact commit
  `95834438bb109e088c159f2c41a10791b83f2bf2` (generic extension PR #42 upstream).
- Grafana Faro core/web-sdk/web-tracing 2.14.0, official npm packages.
- JourneyGap's fixed OpenTelemetry trace SDK 2.11.0 and OTLP exporter 0.222.0.
  Faro resolves its own compatible OTel dependencies (in this lockfile, trace-web
  2.12.1 and transformer 0.223.2). Standard span compatibility is exercised, not
  assumed from identical package names. No global tracer provider is installed.
- Vendored archives can be rebuilt from the exact remote commit with
  `scripts/repack-vendor.sh`; hashes are in `vendor/SHA256SUMS`. This rebuild was
  executed successfully. Registry publication of upstream packages is not needed.

## Checks

- `npm run check`: vendor hash verification, Biome, TypeScript, declaration build,
  eight unit tests and independent package acceptance passed.
- `npm run test:browser`: seven Chromium acceptance tests passed.
- `npm audit`: zero vulnerabilities, including development dependencies at the
  time of the check.
- Upstream extension: build/typecheck/lint, 150 tests, six browser tests, schema and
  validator freshness, license/secret/workflow checks, and audit passed locally.
  Its GitHub `check`, `security`, and `containers` jobs also passed.

## What the tests prove

1. An independent npm project installs **only the outer package** as its direct
   dependency. Its bundled unpublished JourneyGap modules resolve without a sibling
   checkout, a private registry or additional package installation commands.
   Both browser and optional analysis entries import, SSR returns an inactive client,
   TypeScript accepts the public API, and Vite builds the independent application.
2. Before consent and when disabled, no telemetry request occurs. Identical init
   reuses the client; conflicting configuration does not take over the page.
3. Real JourneyGap steps pass through official FaroTraceExporter and getTransportBody,
   then parse through JourneyGap core and produce one start, one completion and no
   order anomalies. No mock replaces those SDKs.
4. Payload metadata contains only fixed app/SDK fields. Private input, raw page
   queries, user/browser/OS metadata, authorization and cookies are absent. Product A
   and product B keep distinct service names without product-specific SDK code.
5. Withdrawal drops a pending span queue, actively cancels a held HTTP request,
   and regrant creates different session/attempt IDs. Cross-tab withdrawal stops
   collection. No Faro global replaces host-owned globals.
6. Transient failures retry with identical payload and idempotency key; permanent
   errors do not retry. Retries stop at three attempts, Retry-After cannot extend
   beyond the deadline, and withdrawal cancels retry delays. An unresponsive fetch
   is aborted at the three-second deadline.
7. The browser fixture runs with `script-src 'self'` and no inline/eval exception.
   Empty instrumentations and a disposable transport avoid automatic RUM, replay,
   global-provider replacement and undisposable network listeners.

## Material limits

- Live managed Faro acceptance, Cloud-side metadata enrichment, storage/sampling,
  actual origin policy and account quotas remain deployment work. See
  https://github.com/ysj101/URAMEKU/issues/205.
- The exact upstream API is supplied as bundled, licensed archives while PR #42 is
  under review. Updating it requires repacking and rerunning all checks.
- keepalive is disabled to support active request cancellation. Browser-close
  delivery remains best effort. Already received records cannot be recalled.
- Backend retention is not set by the SDK. An operator must match its notice to
  the actual Grafana settings (URAMEKU selected 30 days).
- The optional analysis entry is not a Grafana query client. Complete retrieval,
  response normalization, sampling awareness and credential handling must happen
  in administrator tooling before claiming a complete journey report.
