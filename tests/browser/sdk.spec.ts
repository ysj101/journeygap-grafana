import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { analyze, parseOtlpJson } from "@journeygap/core";
import { expect, test } from "@playwright/test";

let server: Server;
let payloads: {
  body: Record<string, unknown>;
  headers: Record<string, string | string[] | undefined>;
}[];
let statuses: number[];
let hold: boolean;
let aborted: number;
const journeys = [
  {
    id: "first-task",
    steps: [{ id: "started" }, { id: "completed", terminal: true }],
    timeoutMinutes: 30,
  },
];
const relay = {
  schemaVersion: 1 as const,
  allowedOrigins: ["http://127.0.0.1:5189"],
  services: [
    { serviceName: "example-a", journeys },
    { serviceName: "example-b", journeys },
  ],
  retentionDays: 30,
  rateLimitPerMinute: 100,
};
test.beforeEach(async () => {
  payloads = [];
  statuses = [];
  hold = false;
  aborted = 0;
  server = createServer(async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "http://127.0.0.1:5189");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "content-type,idempotency-key",
    );
    res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
    if (req.method === "OPTIONS") {
      res.writeHead(204).end();
      return;
    }
    let body = "";
    for await (const chunk of req) body += chunk;
    payloads.push({ body: JSON.parse(body), headers: req.headers });
    if (hold) {
      res.on("close", () => {
        aborted++;
      });
      return;
    }
    res
      .writeHead(statuses.shift() ?? 200, {
        "Content-Type": "application/json",
      })
      .end("{}");
  });
  await new Promise<void>((resolve) =>
    server.listen(14339, "127.0.0.1", resolve),
  );
  expect((server.address() as AddressInfo).port).toBe(14339);
});
test.afterEach(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

test("real JourneyGap → official Faro exporter/envelope preserves analysis and minimum data", async ({
  page,
}) => {
  await page.goto("/examples/?private=URL-MUST-NOT-LEAK");
  await page.locator("#note").fill("PRIVATE-INPUT-MUST-NOT-LEAK");
  await page.locator("#start").click();
  await page.locator("#flush").click();
  await page.waitForTimeout(5200);
  expect(payloads).toHaveLength(0);
  await page.locator("#allow").click();
  await page.locator("#start").click();
  await page.locator("#finish").click();
  await page.locator("#flush").click();
  await expect.poll(() => payloads.length).toBe(1);
  await expect(page.locator("#status")).toHaveText("Flushed");
  const envelope = payloads[0]!.body;
  expect(Object.keys(envelope).sort()).toEqual(["meta", "traces"]);
  expect(envelope.meta).toEqual({
    app: { name: "example-a" },
    sdk: { name: "journeygap-grafana", version: "0.1.0" },
  });
  const parsed = parseOtlpJson(JSON.stringify(envelope.traces), relay);
  expect(parsed.journeyEvents).toHaveLength(2);
  const report = analyze(parsed.journeyEvents, journeys[0]!, Date.now());
  expect(report.observedStarts).toBe(1);
  expect(report.observedCompletions).toBe(1);
  expect(report.outOfOrderEvents).toBe(0);
  expect(JSON.stringify(envelope)).not.toMatch(
    /URL-MUST-NOT-LEAK|PRIVATE-INPUT|userAgent|browser|http.url|document/,
  );
  expect(payloads[0]!.headers.authorization).toBeUndefined();
  expect(payloads[0]!.headers.cookie).toBeUndefined();
  expect(
    await page.evaluate(
      () => Reflect.has(window, "faro") || Reflect.has(window, "_faroInternal"),
    ),
  ).toBe(false);
});

test("withdrawal drops pending steps, aborts HTTP, and regrant creates fresh identities", async ({
  page,
}) => {
  await page.goto("/examples/");
  await page.locator("#allow").click();
  await page.locator("#start").click();
  await page.locator("#refuse").click();
  await page.locator("#flush").click();
  expect(payloads).toHaveLength(0);
  await page.locator("#allow").click();
  await page.locator("#start").click();
  hold = true;
  await page.locator("#flush").click();
  await expect.poll(() => payloads.length).toBe(1);
  const old = parseOtlpJson(JSON.stringify(payloads[0]!.body.traces), relay)
    .journeyEvents[0]!;
  await page.locator("#refuse").click();
  await expect.poll(() => aborted).toBe(1);
  hold = false;
  await page.locator("#allow").click();
  await page.locator("#start").click();
  await page.locator("#finish").click();
  await page.locator("#flush").click();
  await expect.poll(() => payloads.length).toBe(2);
  const next = parseOtlpJson(
    JSON.stringify(payloads[1]!.body.traces),
    relay,
  ).journeyEvents;
  expect(next).toHaveLength(2);
  expect(next[0]!.sessionId).not.toBe(old.sessionId);
  expect(next[0]!.instanceId).not.toBe(old.instanceId);
});

test("retries transient failures with a stable idempotency key and stops on permanent errors", async ({
  page,
}) => {
  statuses = [503, 200];
  await page.goto("/examples/");
  await page.locator("#allow").click();
  await page.locator("#start").click();
  await page.locator("#flush").click();
  await expect.poll(() => payloads.length).toBe(2);
  expect(payloads[0]!.headers["idempotency-key"]).toBe(
    payloads[1]!.headers["idempotency-key"],
  );
  expect(payloads[0]!.body).toEqual(payloads[1]!.body);
  statuses = [400];
  await page.locator("#finish").click();
  await page.locator("#flush").click();
  await expect.poll(() => payloads.length).toBe(3);
  await expect(page.locator("#status")).toHaveText("Flushed");
  await page.waitForTimeout(500);
  expect(payloads).toHaveLength(3);
});

test("two products work independently and cross-tab withdrawal stops collection", async ({
  page,
  context,
}) => {
  await page.goto("/examples/");
  await page.locator("#allow").click();
  const other = await context.newPage();
  await other.goto("/examples/?product=b");
  await other.locator("#allow").click();
  await other.locator("#start").click();
  await other.locator("#finish").click();
  await other.locator("#flush").click();
  await expect.poll(() => payloads.length).toBe(1);
  expect(
    parseOtlpJson(JSON.stringify(payloads[0]!.body.traces), relay)
      .journeyEvents[0]!.serviceName,
  ).toBe("example-b");
  await page.locator("#refuse").click();
  await expect
    .poll(() =>
      other.evaluate(() => Reflect.get(window, "fixture").getConsent()),
    )
    .toBe(false);
  await other.locator("#start").click();
  await other.locator("#flush").click();
  expect(payloads).toHaveLength(1);
  await page.locator("#allow").click();
  await page.locator("#start").click();
  await page.locator("#flush").click();
  await expect.poll(() => payloads.length).toBe(2);
  expect(
    parseOtlpJson(JSON.stringify(payloads[1]!.body.traces), relay)
      .journeyEvents[0]!.serviceName,
  ).toBe("example-a");
});

test("initialization is idempotent, conflicting configuration is inactive, and shutdown permits reinit", async ({
  page,
}) => {
  await page.goto("/examples/");
  expect(
    await page.evaluate(async () => {
      const { initJourneyGapGrafana } = await import("/dist/index.js");
      return (
        initJourneyGapGrafana(Reflect.get(window, "fixtureConfig")) ===
        Reflect.get(window, "fixture")
      );
    }),
  ).toBe(true);
  const conflict = await page.evaluate(async () => {
    const { initJourneyGapGrafana } = await import("/dist/index.js");
    const client = initJourneyGapGrafana({
      ...Reflect.get(window, "fixtureConfig"),
      serviceName: "other-product",
    });
    client.setConsent(true);
    return client.getConsent();
  });
  expect(conflict).toBe(false);
  await page.locator("#shutdown").click();
  expect(
    await page.evaluate(async () => {
      const { initJourneyGapGrafana } = await import("/dist/index.js");
      const client = initJourneyGapGrafana(
        Reflect.get(window, "fixtureConfig"),
      );
      return client !== Reflect.get(window, "fixture") && !client.getConsent();
    }),
  ).toBe(true);
  expect(payloads).toHaveLength(0);
});

test("explicitly disabled configuration never transmits even when the host calls allow", async ({
  page,
}) => {
  await page.goto("/examples/?enabled=false");
  await page.locator("#allow").click();
  await page.locator("#start").click();
  await page.locator("#finish").click();
  await page.locator("#flush").click();
  expect(
    await page.evaluate(() => Reflect.get(window, "fixture").getConsent()),
  ).toBe(false);
  expect(payloads).toHaveLength(0);
});

test("does not replace unrelated Faro globals already owned by the host", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const existing = { owner: "host-application" };
    Object.defineProperty(window, "faro", {
      value: existing,
      writable: false,
      configurable: false,
    });
    Object.defineProperty(window, "_faroInternal", {
      value: existing,
      writable: false,
      configurable: false,
    });
  });
  await page.goto("/examples/");
  await page.locator("#allow").click();
  await page.locator("#start").click();
  await page.locator("#flush").click();
  await expect.poll(() => payloads.length).toBe(1);
  expect(
    await page.evaluate(() => [
      Reflect.get(window, "faro").owner,
      Reflect.get(window, "_faroInternal").owner,
    ]),
  ).toEqual(["host-application", "host-application"]);
  await page.locator("#shutdown").click();
  expect(
    await page.evaluate(
      () =>
        Reflect.get(window, "faro") === Reflect.get(window, "_faroInternal"),
    ),
  ).toBe(true);
});
