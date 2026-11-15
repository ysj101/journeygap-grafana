import { describe, expect, it } from "vitest";
import { validateGrafanaConfig } from "../../src/config.js";
import { initJourneyGapGrafana } from "../../src/index.js";

const base = {
  schemaVersion: 1,
  enabled: true,
  serviceName: "test-app",
  collectorUrl: "https://faro.example.org/collect/public-app-key",
  consent: { mode: "opt-in", ui: "external" },
  journeys: [
    {
      id: "task",
      steps: [{ id: "start" }, { id: "done", terminal: true }],
      timeoutMinutes: 30,
    },
  ],
};
describe("configuration boundary", () => {
  it("validates without an OTLP placeholder and does not mutate caller data", () => {
    const original = JSON.stringify(base);
    expect(validateGrafanaConfig(base)?.collectorUrl).toBe(base.collectorUrl);
    expect(JSON.stringify(base)).toBe(original);
  });
  it("rejects credentials, token fields, foreign plain HTTP and non-Faro paths", () => {
    for (const collectorUrl of [
      "http://external.example/collect/key",
      "https://user:pass@example.org/collect/key",
      "https://example.org/collect/key?token=secret",
      "https://example.org/collect/key#secret",
      "https://example.org/v1/traces",
      "javascript:alert(1)",
    ])
      expect(validateGrafanaConfig({ ...base, collectorUrl })).toBeNull();
    expect(
      validateGrafanaConfig({ ...base, headers: { Authorization: "secret" } }),
    ).toBeNull();
    expect(
      validateGrafanaConfig({
        ...base,
        otlpTracesEndpoint: "https://example.org/v1/traces",
      }),
    ).toBeNull();
  });
  it("applies JourneyGap semantic validation to each product", () => {
    expect(
      validateGrafanaConfig({
        ...base,
        journeys: [
          {
            id: "task",
            steps: [{ id: "same" }, { id: "same", terminal: true }],
            timeoutMinutes: 30,
          },
        ],
      }),
    ).toBeNull();
    expect(
      validateGrafanaConfig({
        ...base,
        collectorUrl: "http://127.0.0.1:4318/collect/local",
      }),
    ).not.toBeNull();
  });
  it("can be imported and called during SSR without touching a browser", async () => {
    const client = initJourneyGapGrafana(
      base as Parameters<typeof initJourneyGapGrafana>[0],
    );
    client.setConsent(true);
    client.trackStep("task", "start");
    expect(client.getConsent()).toBe(false);
    await client.flush();
    await client.shutdown();
  });
});
