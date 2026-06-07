#!/bin/sh
# rebuild216 installer — fetches the CLI from your deployment and installs it.
#   curl -fsSL https://next-app-maaref.vercel.app/cli/install.sh | sh
set -e

BASE="${REBUILD_URL:-https://next-app-maaref.vercel.app}"
DIR="${REBUILD216_DIR:-$HOME/.rebuild216/bin}"

echo "Installing rebuild216 from $BASE …"
mkdir -p "$DIR"
for f in rebuild216.mjs mcp-rebuild.mjs package.json README.md; do
  curl -fsSL "$BASE/cli/$f" -o "$DIR/$f"
done
chmod +x "$DIR/rebuild216.mjs"

cd "$DIR"
npm install --silent
npm install -g . --silent

cat <<'EOF'

✓ rebuild216 installed.

Next steps:
  1) claude login                 # your Anthropic account (subscription)
  2) export GITHUB_TOKEN=...       # to clone/push the project repo
  3) rebuild216 login             # email + password (masked) -> token
  4) rebuild216 "Project name"    # run the agent; /push at the end

EOF
