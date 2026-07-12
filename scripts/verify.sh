#!/usr/bin/env bash
set -euo pipefail

node node_modules/typescript/bin/tsc --noEmit
node node_modules/expo/bin/cli lint
node node_modules/vitest/vitest.mjs run
node node_modules/expo/bin/cli export --platform web --clear --max-workers 1
