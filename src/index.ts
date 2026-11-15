import type { JourneyGapClient } from "@journeygap/web";
import { getJourneyGapClient, initJourneyGap } from "@journeygap/web";
import type { JourneyGapGrafanaConfig } from "./config.js";
import { validateGrafanaConfig } from "./config.js";
import { createFaroExporter } from "./faro.js";

export type {
  JourneyDefinition,
  JourneyStep,
  TrackAttributes,
} from "@journeygap/web";
export type { JourneyGapGrafanaConfig } from "./config.js";

export interface JourneyGapGrafanaClient extends JourneyGapClient {
  /** Best effort flush; HTTP acceptance does not prove durable Cloud ingestion. */
  flush(): Promise<void>;
}
const noop: JourneyGapGrafanaClient = {
  trackStep() {},
  trackError() {},
  setConsent() {},
  getConsent: () => false,
  flush: async () => {},
  shutdown: async () => {},
};
const KEY = Symbol.for("journeygap-grafana.client.v1");
interface Entry {
  signature: string;
  client: JourneyGapGrafanaClient;
}

/** Single direct dependency. Invalid config or unavailable browser APIs affect measurement only. */
export function initJourneyGapGrafana(
  input: JourneyGapGrafanaConfig,
): JourneyGapGrafanaClient {
  try {
    if (typeof window === "undefined" || typeof document === "undefined")
      return noop;
    const config = validateGrafanaConfig(input);
    if (!config) return noop;
    const signature = JSON.stringify(config);
    const entry = Reflect.get(window, KEY) as Entry | undefined;
    if (entry) return entry.signature === signature ? entry.client : noop;
    // Do not adopt or alter an unrelated JourneyGap instance already on this page.
    if (getJourneyGapClient()) return noop;
    const { collectorUrl: _collectorUrl, ...common } = config;
    const base = initJourneyGap(common, {
      createExporter: () => createFaroExporter(config),
    });
    const client: JourneyGapGrafanaClient = {
      trackStep: (journey, step, attrs) => base.trackStep(journey, step, attrs),
      trackError: (kind) => base.trackError(kind),
      getConsent: () => base.getConsent(),
      setConsent: (value) => base.setConsent(value),
      flush: async () => {
        await base.flush?.();
      },
      async shutdown() {
        try {
          await base.shutdown();
        } finally {
          if (
            (Reflect.get(window, KEY) as Entry | undefined)?.client === client
          )
            Reflect.deleteProperty(window, KEY);
        }
      },
    };
    if (!Reflect.set(window, KEY, { signature, client })) {
      void base.shutdown();
      return noop;
    }
    return client;
  } catch {
    return noop;
  }
}
