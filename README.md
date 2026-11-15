# journeygap-grafana

A **single direct dependency** for consent-gated JourneyGap journeys delivered to a
Grafana Faro browser collector. The application owns its journeys and consent UI;
this distribution connects the existing JourneyGap and official Grafana libraries.
It does not require a Relay, Collector, or application backend on the ingest path.

**Pre-release, source-only:** npm publication and live Grafana Cloud acceptance have
not occurred. The package name is provisional and `private: true` prevents accidental
publication. Browser acceptance uses a local Faro-compatible HTTP receiver, not an
actual Cloud stack. This is a reusable SDK; no product-specific cases are included.

## Build and install one package

Requires Node.js 24+. Build and pack this repository:

```sh
npm ci --ignore-scripts
npm run build
npm pack --ignore-scripts
```

In an independent application's directory:

```sh
npm install /absolute/path/to/journeygap-grafana-0.1.0.tgz
```

JourneyGap upstream packages are still unpublished. Their reviewed source archives
are bundled into this distribution, so an application does **not** need to install
`@journeygap/web`, `@journeygap/core`, or the Faro packages individually. The package
smoke test verifies this in a separate npm project, including TypeScript and Vite.
See [vendor provenance](vendor/README.md) for the upstream change and rebuild procedure.

## Browser API

```ts
import { initJourneyGapGrafana } from "journeygap-grafana";

const analytics = initJourneyGapGrafana({
  schemaVersion: 1,
  enabled: true,
  serviceName: "my-product",
  collectorUrl: "https://YOUR-FARO-COLLECTOR/collect/YOUR-PUBLIC-APP-KEY",
  consent: { mode: "opt-in", ui: "external" },
  journeys: [
    {
      id: "first-task",
      steps: [{ id: "started" }, { id: "completed", terminal: true }],
      timeoutMinutes: 30,
    },
  ],
});

// Connect these to equally available allow/refuse controls. Never grant by default.
allowButton.addEventListener("click", () => analytics.setConsent(true));
refuseButton.addEventListener("click", () => analytics.setConsent(false));

// At actual application milestones, not in renders or from saved history:
analytics.trackStep("first-task", "started");
analytics.trackStep("first-task", "completed");
```

`serviceName` and journey/step IDs use JourneyGap's lowercase ID syntax. Routes,
`serviceVersion` and low-cardinality `attributesAllowlist` are optional. Unknown
configuration properties (including authorization headers/tokens) are rejected.
The Faro URL must be HTTPS; HTTP is accepted only on explicit loopback hosts for
local tests. Credentials, query strings, fragments, and non-`/collect/<app-key>` paths
are rejected. The embedded Faro app key is public, not a Cloud API or admin token.

`enabled: false`, invalid input, unavailable browser APIs or exporter construction
failures leave measurement off. The API is a no-op during server-side rendering.
Initialize on the browser side of SSR applications. Identical initialization in a
tab reuses the same client; a conflicting configuration returns an inactive client
and leaves the first one untouched. An unrelated pre-existing JourneyGap client
is never adopted. Await `shutdown()` before deliberately creating a new instance.

## Consent and lifecycle

- No exporter, Faro instance, telemetry IDs or requests are created before consent.
- `external` mode needs an explicit grant on each initialization, even if a previous
  preference exists. The product owns the prompt, notice and restoration policy.
- `compact` mode uses JourneyGap's built-in allow/refuse controls and can restore a
  previous explicit grant. Both modes use JourneyGap's documented storage keys.
- Withdrawal immediately discards waiting spans, aborts active fetches and retry
  delays, and deletes the current tab identity. A later grant creates a fresh
  exporter and journey instances. Cross-tab withdrawal and cleared consent storage
  are handled by JourneyGap.
- `flush()` is best effort and waits for current queued work. An HTTP success means
  receiver acceptance, not confirmed durable storage in Grafana Cloud.
- `shutdown()` discards rather than drains data. It removes JourneyGap's listeners
  and releases consent-owned resources. Use `await analytics.flush()` first only
  when collection is still authorized and a best-effort send is intended.
- Fetch uses `credentials: 'omit'`, no referrer, no redirects, at most three attempts
  for transient failures, a stable idempotency key, and a three-second batch deadline.
  `keepalive` is intentionally disabled so withdrawal can cancel the active request.
  Page-close delivery is therefore not guaranteed. Already received data cannot be
  recalled by browser cancellation.

The distribution does not initialize global OpenTelemetry providers or expose a
Faro global. It works alongside an unrelated Faro instance. It disables automatic
RUM, replay, console, network/error instrumentation, browser/OS/page metadata, and
Faro session tracking. Only JourneyGap's defined spans and fixed app/SDK metadata
are passed to the collector. Custom attributes still pass JourneyGap's privacy
filter. Session/attempt IDs are pseudonymous, not a guarantee of anonymity.

## Why a small transport adapter remains

`FaroTraceExporter` from `@grafana/faro-web-tracing` performs the official trace
conversion. Faro core's public `getTransportBody` produces the official envelope.
No private exporter internals or global fetch patches are used.

The evaluated Faro 2.14.0 `FetchTransport` installs page lifecycle listeners without
an exposed disposal API; its exporter acknowledges API handoff before HTTP delivery.
For consent-scoped teardown this distribution supplies a small `BaseTransport`
implementation owning abort, deadline and retry resources. Serialization remains in
the official libraries. HTTP acceptance is awaited before reporting export success.
No extra Faro batching queue or unremovable transport listeners are installed.

## Grafana setup and analysis

Create a Frontend Observability application and permit the exact application Origin.
Configure CSP `connect-src` for its collector. CORS restricts browser origins but is
not authentication; public endpoints remain forgeable. Review receiver quotas,
sampling, costs, processor locations and access logs for the actual deployment.
The SDK does **not** create apps, set retention, store API tokens, or activate Cloud
collection automatically. Retention belongs to Grafana and the operator's notice.

JourneyGap analysis is available without a direct core dependency:

```ts
import { analyze, parseOtlpJson } from "journeygap-grafana/analysis";
```

These are pure JourneyGap functions, not a Cloud query client. They accept the
existing JourneyGap/OTLP contracts. For a captured Faro envelope, its `traces` field
contains OTLP data. A real Tempo query response may need normalization before import.
Cloud export, complete time-window retrieval and CLI automation are separate work;
never put read credentials in a player browser. Missing events do not prove why
someone stopped. A span-count ratio is not automatically a journey completion rate.

## Validation

```sh
npm run check
npx playwright install chromium
npm run test:browser
npm audit
```

Acceptance covers real JourneyGap + official Faro serialization, independent product
names, no requests before consent, minimal payloads, pending discard, active HTTP
abort, regrant identities, cross-tab withdrawal, retry bounds, and package installation.
See [acceptance evidence](docs/acceptance.md). CI runs on Node 24.

License: Apache-2.0. Dependencies retain their own licenses.
