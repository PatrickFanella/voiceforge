#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$root_dir"

command -v bun >/dev/null || { echo "bun is required" >&2; exit 1; }
command -v docker >/dev/null || { echo "docker is required" >&2; exit 1; }

bun install --frozen-lockfile
bun run verify
bun run doctor
bun audit --audit-level=high
docker compose -f infra/compose.yaml config --quiet

if command -v shellcheck >/dev/null; then
  shellcheck infra/scripts/*.sh
fi

if command -v terraform >/dev/null; then
  terraform -chdir=infra/terraform fmt -check -recursive
  terraform -chdir=infra/terraform init -backend=false -input=false
  terraform -chdir=infra/terraform validate
else
  docker run --rm -v "$root_dir/infra/terraform:/workspace" -w /workspace hashicorp/terraform:1.10.5 fmt -check -recursive
  docker run --rm -v "$root_dir/infra/terraform:/workspace" -w /workspace hashicorp/terraform:1.10.5 init -backend=false -input=false
  docker run --rm -v "$root_dir/infra/terraform:/workspace" -w /workspace hashicorp/terraform:1.10.5 validate
fi

echo "Local production acceptance audit passed. Complete the environment and real-device gates in docs/PRODUCTION_ACCEPTANCE.md before enforcement."
