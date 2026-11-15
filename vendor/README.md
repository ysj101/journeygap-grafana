# Source provenance

JourneyGap source: https://github.com/ysj101/jorney_gap

Exact source commit: `95834438bb109e088c159f2c41a10791b83f2bf2`.
Generic extension review: https://github.com/ysj101/jorney_gap/pull/42
Base: `96c01aaeccd022c556f64fff5a4777604446734a`.
License: Apache-2.0 (LICENSE here and inside both archives).

These are the unmodified `pnpm pack` outputs after installing the source lockfile
and building on Node 26.12.1 / pnpm 10.30.2. The source commit adds the endpoint-free
custom SpanExporter API used by this distribution. It was merged in upstream PR #42; it is not published. The packages remain at their unpublished upstream version 0.1.0.

Run `sh scripts/repack-vendor.sh` with pnpm 10.30.2 to regenerate the archives.
Run `npm install --ignore-scripts ./vendor/journeygap-core-0.1.0.tgz
./vendor/journeygap-web-0.1.0.tgz` on one line to refresh installed files and the lock.
Review SHA256SUMS, generated files and lockfile before committing an update.
`npm run verify:vendor` checks the archive hashes.

The distribution's `bundledDependencies` includes core/web because they are not
published. The independent consumer test proves that installing only the outer
archive works without a sibling checkout or private registry. Once upstream is
published, migrate to exact registry dependencies and remove this temporary
bundling; do not silently switch the implementation.

No npm package or credential was published during this work.
