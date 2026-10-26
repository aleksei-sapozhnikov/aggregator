#!/bin/sh
set -eu

# Only public browser settings belong in this file.
jq -n \
  --arg appTitle "${APP_TITLE:-}" \
  --arg timelineDefaultRange "${TIMELINE_DEFAULT_RANGE:-1d}" \
  '{appTitle: $appTitle, timelineDefaultRange: $timelineDefaultRange}' \
  > /usr/share/caddy/config.json

exec caddy run --config /etc/caddy/Caddyfile
