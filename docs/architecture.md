# Architecture

Applications install **journeygap-grafana** only. This distribution depends on
JourneyGap and the official Faro packages. JourneyGap core/web depend on no Grafana
code. Product-specific journey definitions, consent UI, receiver URL and notices
remain with the product.

```text
product → journeygap-grafana → @journeygap/web → @journeygap/core
                            → FaroTraceExporter / Faro core envelope
                            → consent-owned HTTP transport → managed Faro collector
```

JourneyGap owns the bounded span queue, step validation, consent and epoch IDs. A
standard OpenTelemetry SpanExporter factory is created on each consent grant. The
adapter owns only that epoch's Faro instance, network controller, retry delays and
pending requests. Withdrawal is synchronous: JourneyGap drops queued spans and the
adapter aborts requests/delays and pauses/removes its transport. Regrant creates
independent resources. Old callbacks cannot mark the new epoch as delivered.

Faro core is initialized with empty instrumentations/metas, isolated globals,
disabled batching and disabled Faro session tracking. The transport constructs
fixed app/SDK metadata instead of inheriting browser, user, page, source-map or
session metadata. JourneyGap IDs stay inside the spans; no second session identity
is generated. A standard Faro exporter callback acknowledges API handoff before
HTTP; the adapter defers its callback until the matching transport work settles.

Why not simply use official FetchTransport? The reviewed 2.14.0 constructor adds
pagehide/pageshow listeners without a public disposal method. Recreating it for
consent epochs would retain page listeners. This adapter uses official trace and
envelope conversion with a small disposable network boundary instead. It does not
patch globals or vendor internals. keepalive is disabled for active cancellation;
unload delivery is best effort.

The package does not provision receivers, establish a retention policy, or query
Tempo. `journeygap-grafana/analysis` reexports pure JourneyGap functions without
browser initialization. A Grafana/Tempo export must be normalized and retrieved
completely on an authorized administrator's machine. This SDK does not turn sampled
or capped trace searches into a complete journey cohort.
