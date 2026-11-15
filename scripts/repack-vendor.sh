#!/bin/sh
# Build the exact generic extension used by this distribution. Never publish.
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
SOURCE=$(mktemp -d)
trap 'rm -rf "$SOURCE"' EXIT HUP INT TERM
git clone --quiet https://github.com/ysj101/jorney_gap.git "$SOURCE"
git -C "$SOURCE" checkout --quiet 95834438bb109e088c159f2c41a10791b83f2bf2
(cd "$SOURCE" && pnpm install --frozen-lockfile && pnpm build)
for PACKAGE in core web; do
 pnpm --dir "$SOURCE/packages/$PACKAGE" pack --pack-destination "$ROOT/vendor"
done
cp "$SOURCE/LICENSE" "$ROOT/vendor/LICENSE"
(cd "$ROOT" && shasum -a 256 vendor/*.tgz > vendor/SHA256SUMS)
