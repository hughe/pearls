#!/usr/bin/env bash
# Install pearls globally for the current user — no root required.
#
# Builds this checkout and installs it into the user's npm prefix
# (nvm/npm-managed; `npm config get prefix`). If your prefix is
# system-owned (e.g. /usr/local), set a user prefix first:
#
#   npm config set prefix ~/.npm-global
#
# Usage:  scripts/install.sh
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

# --- prerequisites ----------------------------------------------------------

if ! command -v node >/dev/null 2>&1; then
	echo "pearls: node is required but not installed." >&2
	exit 1
fi
node_major="$(node -p 'process.versions.node.split(".")[0]')"
if (( node_major < 20 )); then
	echo "pearls: Node >= 20 required (found $(node --version))." >&2
	exit 1
fi
if ! command -v npm >/dev/null 2>&1; then
	echo "pearls: npm is required but not installed." >&2
	exit 1
fi

# Refuse to sudo: a system-owned prefix means the install would need root.
# Point users at a user prefix instead (see header comment).
prefix="$(npm config get prefix)"
if [[ ! -w "$prefix" ]]; then
	cat >&2 <<EOF
pearls: npm prefix '$prefix' is not writable by this user.

Install without root by setting a user prefix first:

  npm config set prefix ~/.npm-global
  export PATH="\$HOME/.npm-global/bin:\$PATH"   # add to your shell rc

then re-run scripts/install.sh.
EOF
	exit 1
fi

# --- build -------------------------------------------------------------------

echo "==> Installing dependencies"
npm install

echo "==> Building"
npm run build

echo "==> Installing into '$prefix' (user prefix, no sudo)"
npm install -g .

# --- verify ------------------------------------------------------------------

if [[ ! -x "$prefix/bin/pearls" ]]; then
	echo "pearls: install finished but '$prefix/bin/pearls' is missing." >&2
	exit 1
fi
version="$("$prefix/bin/pearls" --version)"
echo "==> Installed: $prefix/bin/pearls ($version)"

if ! command -v pearls >/dev/null 2>&1; then
	cat <<EOF
note: '$prefix/bin' is not on your PATH. Add:

  export PATH="$prefix/bin:\$PATH"

to your shell rc, or link it into a directory that already is.
EOF
fi

echo "==> Tip: run scripts/install-completions.sh for zsh completions."
