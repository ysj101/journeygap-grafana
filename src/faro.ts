import {
  InternalLoggerLevel,
  initializeFaro,
  TransportItemType,
} from "@grafana/faro-core";
import { FaroTraceExporter } from "@grafana/faro-web-tracing";
import { safeVersion } from "@journeygap/core";
import type { JourneyGapExporter } from "@journeygap/web";
import type { JourneyGapGrafanaConfig } from "./config.js";
import { ConsentTransport } from "./transport.js";

/** Constructed only inside JourneyGap's opt-in epoch. */
export function createFaroExporter(
  config: JourneyGapGrafanaConfig,
): JourneyGapExporter {
  const version = safeVersion(config.serviceVersion);
  const transport = new ConsentTransport(config.collectorUrl, {
    name: config.serviceName,
    ...(version ? { version } : {}),
  });
  const faro = initializeFaro({
    app: { name: config.serviceName },
    transports: [transport],
    instrumentations: [],
    metas: [],
    batching: { enabled: false },
    sessionTracking: { enabled: false, persistent: false },
    dedupe: false,
    isolate: true,
    preventGlobalExposure: true,
    globalObjectKey: "journeygap-grafana",
    internalLoggerLevel: InternalLoggerLevel.OFF,
    paused: false,
    unpatchedConsole: console,
    parseStacktrace: () => ({ frames: [] }),
    beforeSend: (item) => (item.type === TransportItemType.TRACE ? item : null),
  });
  const official = new FaroTraceExporter({ api: faro.api });
  let closed = false;
  const discard = () => {
    closed = true;
    transport.discard();
    faro.pause();
    faro.transports.remove(transport);
  };
  return {
    exporter: {
      export(spans, callback) {
        if (closed) {
          callback({ code: 1 });
          return;
        }
        try {
          official.export(spans, (result) => {
            if (result.code !== 0) {
              callback(result);
              return;
            }
            // The official exporter acknowledges API handoff synchronously. Await actual HTTP completion.
            void transport.flush().then(
              (ok) => callback({ code: ok && !closed ? 0 : 1 }),
              () => callback({ code: 1 }),
            );
          });
        } catch {
          callback({ code: 1 });
        }
      },
      async forceFlush() {
        await transport.flush();
      },
      async shutdown() {
        discard();
        await transport.flush();
        await official.shutdown();
      },
    },
    discard,
    async forceFlush() {
      await transport.flush();
    },
  };
}
