import { TransportItemType } from "@grafana/faro-core";
import { afterEach, expect, it, vi } from "vitest";
import { ConsentTransport } from "../../src/transport.js";

const item = {
  type: TransportItemType.TRACE,
  payload: { resourceSpans: [] },
  meta: {
    user: { id: "PRIVATE-USER" },
    page: { url: "https://private.example/?secret=value" },
  },
};
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it("caps failed delivery at three attempts and strips caller metadata", async () => {
  const fetch = vi.fn(async () => new Response("{}", { status: 503 }));
  vi.stubGlobal("fetch", fetch);
  const transport = new ConsentTransport(
    "https://collector.example/collect/key",
    { name: "test-product" },
  );
  await transport.send(item);
  expect(await transport.flush()).toBe(false);
  expect(fetch).toHaveBeenCalledTimes(3);
  const body = JSON.parse(
    (fetch.mock.calls as unknown as [string, RequestInit][])[0]![1]
      .body as string,
  );
  expect(body.meta).toEqual({
    app: { name: "test-product" },
    sdk: { name: "journeygap-grafana", version: "0.1.0" },
  });
  const calls = fetch.mock.calls as unknown as [string, RequestInit][];
  expect(
    new Set(
      calls.map(
        (call) =>
          (call[1].headers as Record<string, string>)["Idempotency-Key"],
      ),
    ).size,
  ).toBe(1);
  transport.discard();
});
it("does not wait past its deadline for a large Retry-After", async () => {
  const fetch = vi.fn(
    async () =>
      new Response("{}", { status: 429, headers: { "Retry-After": "1000" } }),
  );
  vi.stubGlobal("fetch", fetch);
  const transport = new ConsentTransport(
    "https://collector.example/collect/key",
    { name: "test-product" },
  );
  await transport.send(item);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(await transport.flush()).toBe(false);
  transport.discard();
});
it("withdrawal cancels a retry delay and prevents another request", async () => {
  vi.useFakeTimers();
  const fetch = vi.fn(async () => new Response("{}", { status: 503 }));
  vi.stubGlobal("fetch", fetch);
  const transport = new ConsentTransport(
    "https://collector.example/collect/key",
    { name: "test-product" },
  );
  const sending = transport.send(item);
  await vi.advanceTimersByTimeAsync(0);
  transport.discard();
  await sending;
  await vi.advanceTimersByTimeAsync(1000);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(await transport.flush()).toBe(false);
});
it("aborts an unresponsive fetch at the batch deadline", async () => {
  vi.useFakeTimers();
  let aborted = false;
  vi.stubGlobal(
    "fetch",
    (_url: string, options: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        options.signal?.addEventListener(
          "abort",
          () => {
            aborted = true;
            reject(new DOMException("aborted", "AbortError"));
          },
          { once: true },
        );
      }),
  );
  const transport = new ConsentTransport(
    "https://collector.example/collect/key",
    { name: "test-product" },
  );
  const sending = transport.send(item);
  await vi.advanceTimersByTimeAsync(3000);
  await sending;
  expect(aborted).toBe(true);
  expect(await transport.flush()).toBe(false);
  transport.discard();
});
