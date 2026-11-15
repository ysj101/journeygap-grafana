import { initJourneyGapGrafana } from "../dist/index.js";

const params = new URLSearchParams(location.search);
const config = {
  schemaVersion: 1,
  enabled: params.get("enabled") !== "false",
  serviceName: params.get("product") === "b" ? "example-b" : "example-a",
  collectorUrl: "http://127.0.0.1:14339/collect/synthetic-app-key",
  consent: { mode: "opt-in", ui: "external" },
  routes: [{ id: "fixture", pattern: "/examples/" }],
  journeys: [
    {
      id: "first-task",
      steps: [{ id: "started" }, { id: "completed", terminal: true }],
      timeoutMinutes: 30,
    },
  ],
} satisfies Parameters<typeof initJourneyGapGrafana>[0];
const client = initJourneyGapGrafana(config);
Object.assign(window, { fixture: client, fixtureConfig: config });
const bind = (id: string, action: () => void | Promise<void>) =>
  document.getElementById(id)?.addEventListener("click", () => {
    void action();
  });
bind("allow", () => client.setConsent(true));
bind("refuse", () => client.setConsent(false));
bind("start", () => client.trackStep("first-task", "started"));
bind("finish", () => client.trackStep("first-task", "completed"));
bind("flush", async () => {
  await client.flush();
  const output = document.getElementById("status");
  if (output) output.textContent = "Flushed";
});
bind("shutdown", () => client.shutdown());
