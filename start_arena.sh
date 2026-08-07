#!/bin/bash
# Start Project Beatles arena locally (uses bundled portable Node — no system install needed)
ROOT="$(cd "$(dirname "$0")" && pwd)"
export PATH="$ROOT/.tools/node/bin:$PATH"
cd "$ROOT/web"
if [ ! -d node_modules ]; then
  echo "Installing dependencies…"
  npm install
fi
echo "Starting http://localhost:3000"
npm run dev -- -p 3000
