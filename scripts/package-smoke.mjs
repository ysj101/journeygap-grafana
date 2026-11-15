import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(".");
const temporary = mkdtempSync(join(tmpdir(), "journeygap-grafana-consumer-"));
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
try {
  const packed = JSON.parse(
    execFileSync(
      npm,
      ["pack", "--ignore-scripts", "--json", "--pack-destination", temporary],
      { cwd: root, encoding: "utf8" },
    ),
  );
  const archive = join(temporary, packed[0].filename);
  const names = execFileSync("tar", ["-tzf", archive], { encoding: "utf8" });
  assert(
    names.includes("package/node_modules/@journeygap/web/dist/index.js"),
    "unpublished SDK must be bundled",
  );
  assert(names.includes("package/LICENSE"));
  const app = join(temporary, "app");
  mkdirSync(app);
  writeFileSync(
    join(app, "package.json"),
    JSON.stringify({
      name: "independent-consumer",
      private: true,
      type: "module",
    }),
  );
  execFileSync(npm, ["install", "--ignore-scripts", "--no-audit", archive], {
    cwd: app,
    stdio: "pipe",
  });
  const pkg = JSON.parse(readFileSync(join(app, "package.json"), "utf8"));
  assert.deepEqual(Object.keys(pkg.dependencies), ["journeygap-grafana"]);
  const source = `import { initJourneyGapGrafana } from 'journeygap-grafana';
import { analyze } from 'journeygap-grafana/analysis';
if (typeof analyze !== 'function') throw new Error('Missing analysis entry');
const client = initJourneyGapGrafana({ schemaVersion: 1, enabled: true, serviceName: 'independent-app', collectorUrl: 'https://example.org/collect/public-app-key', consent: {mode:'opt-in',ui:'external'}, journeys: [{id:'task', steps:[{id:'started'},{id:'done',terminal:true}], timeoutMinutes:30}] });
client.trackStep('task','started'); await client.flush(); await client.shutdown();`;
  writeFileSync(join(app, "main.mjs"), source);
  execFileSync(process.execPath, ["main.mjs"], { cwd: app, stdio: "pipe" });
  writeFileSync(join(app, "main.ts"), source);
  execFileSync(
    process.execPath,
    [
      join(root, "node_modules/typescript/bin/tsc"),
      "--noEmit",
      "--strict",
      "--skipLibCheck",
      "--module",
      "NodeNext",
      "--target",
      "ES2023",
      "main.ts",
    ],
    { cwd: app, stdio: "pipe" },
  );
  writeFileSync(
    join(app, "index.html"),
    '<html><body><script type="module" src="/main.ts"></script></body></html>',
  );
  execFileSync(
    process.execPath,
    [join(root, "node_modules/vite/bin/vite.js"), "build"],
    { cwd: app, stdio: "pipe" },
  );
  console.log(
    "PASS: one direct dependency, bundled unpublished SDK, independent npm install, SSR import, typecheck and Vite build.",
  );
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
