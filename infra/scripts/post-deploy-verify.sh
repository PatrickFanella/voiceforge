#!/usr/bin/env bash
set -euo pipefail
api_url="${1:?API URL is required}"
for attempt in {1..30}; do
  if response="$(curl --fail --silent --show-error --max-time 5 "$api_url/v1/health")"; then
    [[ "$response" == *'"status":"ok"'* ]] && exit 0
  fi
  sleep 5
done
echo "Post-deploy health verification failed; ECS deployment circuit breaker should roll back." >&2
exit 1
