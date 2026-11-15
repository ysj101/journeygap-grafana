import type { Meta, TransportItem } from "@grafana/faro-core";
import {
  BaseTransport,
  getTransportBody,
  TransportItemType,
} from "@grafana/faro-core";

/** Official Faro envelope + a consent-owned HTTP lifecycle. No global listeners. */
export class ConsentTransport extends BaseTransport {
  readonly name = "journeygap-grafana:transport";
  readonly version = "0.1.0";
  private readonly controller = new AbortController();
  private readonly pending = new Set<Promise<boolean>>();
  private closed = false;
  private lastResult = true;
  constructor(
    private readonly url: string,
    private readonly app: { name: string; version?: string },
  ) {
    super();
  }

  override getIgnoreUrls() {
    return [this.url];
  }

  send(input: TransportItem | TransportItem[]): Promise<void> {
    if (this.closed) return Promise.resolve();
    const items = (Array.isArray(input) ? input : [input]).filter(
      (item) => item.type === TransportItemType.TRACE,
    );
    if (!items.length) return Promise.resolve();
    // One in-flight batch. JourneyGap retains its own bounded waiting queue.
    if (this.pending.size) {
      this.lastResult = false;
      return Promise.resolve();
    }
    const meta: Meta = {
      app: { ...this.app },
      sdk: { name: "journeygap-grafana", version: this.version },
    };
    const body = getTransportBody(items.map((item) => ({ ...item, meta })));
    const text = JSON.stringify(body);
    if (new TextEncoder().encode(text).length > 256 * 1024) {
      this.lastResult = false;
      return Promise.resolve();
    }
    const request = this.deliver(text)
      .catch(() => false)
      .then((ok) => {
        this.lastResult = ok;
        return ok;
      });
    this.pending.add(request);
    // Register removal after callers have had a chance to snapshot pending work.
    void request.finally(() => this.pending.delete(request));
    return request.then(() => {});
  }

  async flush(): Promise<boolean> {
    const results = await Promise.all([...this.pending]);
    return results.every(Boolean) && this.lastResult;
  }

  discard(): void {
    this.closed = true;
    this.controller.abort();
  }

  private async deliver(body: string): Promise<boolean> {
    const controller = new AbortController();
    const abort = () => controller.abort();
    this.controller.signal.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(abort, 3000);
    const deadline = Date.now() + 3000;
    const key = crypto.randomUUID();
    try {
      for (
        let attempt = 0;
        attempt < 3 && !this.closed && !controller.signal.aborted;
        attempt++
      ) {
        let wait = 100 * 2 ** attempt;
        try {
          const response = await fetch(this.url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Idempotency-Key": key,
            },
            body,
            signal: controller.signal,
            credentials: "omit",
            redirect: "error",
            referrerPolicy: "no-referrer",
            keepalive: false,
          });
          await response.body?.cancel();
          if (response.ok) return true;
          if (![429, 502, 503, 504].includes(response.status)) return false;
          const retry = response.headers.get("Retry-After");
          if (retry !== null) {
            const milliseconds = /^\d+(?:\.\d+)?$/.test(retry)
              ? Number(retry) * 1000
              : Date.parse(retry) - Date.now();
            if (Number.isFinite(milliseconds))
              wait = Math.max(wait, milliseconds);
          }
        } catch (error) {
          if (controller.signal.aborted || !(error instanceof TypeError))
            return false;
        }
        if (attempt === 2 || wait >= deadline - Date.now()) return false;
        await new Promise<void>((resolve) => {
          if (controller.signal.aborted) return resolve();
          const finish = () => {
            clearTimeout(delay);
            controller.signal.removeEventListener("abort", finish);
            resolve();
          };
          const delay = setTimeout(finish, wait);
          controller.signal.addEventListener("abort", finish, { once: true });
        });
      }
      return false;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
      this.controller.signal.removeEventListener("abort", abort);
    }
  }
}
