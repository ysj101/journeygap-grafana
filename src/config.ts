import { validateExporterConfig } from "@journeygap/core";
import type { JourneyGapExporterConfig } from "@journeygap/web";

export interface JourneyGapGrafanaConfig extends JourneyGapExporterConfig {
  /** Public Faro application collector URL, never an OTLP/admin token. */
  collectorUrl: string;
}

export function validateGrafanaConfig(
  input: unknown,
): JourneyGapGrafanaConfig | null {
  try {
    if (!input || typeof input !== "object" || Array.isArray(input))
      return null;
    const keys = new Set([
      "schemaVersion",
      "enabled",
      "serviceName",
      "serviceVersion",
      "consent",
      "routes",
      "journeys",
      "attributesAllowlist",
      "$comment",
      "collectorUrl",
    ]);
    if (Object.keys(input).some((key) => !keys.has(key))) return null;
    const { collectorUrl, ...common } = input as Record<string, unknown>;
    if (typeof collectorUrl !== "string" || collectorUrl.length > 2048)
      return null;
    const url = new URL(collectorUrl);
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (
      (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !/\/collect\/[A-Za-z0-9_-]{1,256}$/.test(url.pathname)
    )
      return null;
    const validated = validateExporterConfig(common);
    return validated.valid ? { ...validated.value, collectorUrl } : null;
  } catch {
    return null;
  }
}
