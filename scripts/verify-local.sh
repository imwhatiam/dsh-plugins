#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
npm ci
npm test
npm run pack:check
npm run compat:probe
cat <<'EOF'
Desktop check:
1. Upgrade the DeepSeek Harness app and restart.
2. Open Plugins and confirm dsh-mosaic, dsh-superpowers, dsh-view-background-jobs are loaded.
3. Open the Background jobs panel and the Mosaic settings section.
4. Ask for one dsh-view answer and confirm it renders.
5. Record the result in docs/verification/<dsh-version>.md with status: passed.
EOF
