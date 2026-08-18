#!/bin/zsh
# serve-portrait.sh
# Starts the static file server for the portrait menu display.
# Runs via launchd — must set PATH explicitly (launchd doesn't inherit shell env).

export PATH="/opt/homebrew/opt/node@22/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

SERVE="/Users/openclaw-user/.openclaw/workspace/square-digital-menu-poc/node_modules/.bin/serve"
ROOT="/Users/openclaw-user/.openclaw/workspace/square-digital-menu-poc-portrait"

exec "$SERVE" "$ROOT" -p 4000 --no-clipboard
