import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const entries = readFileSync("vendor/SHA256SUMS", "utf8").trim().split("\n");
for (const line of entries) {
  const [expected, file] = line.split(/\s+/);
  assert(file && !file.includes("..") && file.startsWith("vendor/"));
  assert.equal(
    createHash("sha256").update(readFileSync(file)).digest("hex"),
    expected,
  );
}
console.log("PASS: vendored archive SHA256s match reviewed inputs.");
