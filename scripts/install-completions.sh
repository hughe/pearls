#!/usr/bin/env bash
# Install zsh completions for pearls for the current user.
#
# Destination is chosen automatically:
#   - oh-my-zsh users:  $ZSH/custom/completions (already on fpath;
#     no .zshrc changes needed)
#   - everyone else:    ~/.zfunc (create it and add it to fpath yourself;
#     instructions are printed)
#
# Override the destination with ZFUNC_DIR=<dir> scripts/install-completions.sh
#
# Usage:  scripts/install-completions.sh
set -euo pipefail

# --- locate a pearls binary --------------------------------------------------

pearls_bin=""
if command -v pearls >/dev/null 2>&1; then
	pearls_bin="pearls"
else
	root="$(cd "$(dirname "$0")/.." && pwd)"
	if [[ -f "$root/dist/src/cli.js" ]]; then
		pearls_bin="$root/dist/src/cli.js"
	else
		cat >&2 <<EOF
pearls: no 'pearls' on PATH and no build in this checkout.
Install pearls first (scripts/install.sh) or run 'npm run build'.
EOF
		exit 1
	fi
fi

# --- pick a destination --------------------------------------------------------

omz_dir=""
if [[ -n "${ZSH:-}" && -d "$ZSH" ]]; then
	omz_dir="$ZSH"
elif [[ -d "$HOME/.oh-my-zsh" ]]; then
	omz_dir="$HOME/.oh-my-zsh"
fi

if [[ -n "$omz_dir" ]]; then
	default_dest="$omz_dir/custom/completions"
else
	default_dest="$HOME/.zfunc"
fi
dest="${ZFUNC_DIR:-$default_dest}"
mkdir -p "$dest"

# --- install --------------------------------------------------------------------

if [[ -f "$pearls_bin" ]]; then
	node "$pearls_bin" completions zsh > "$dest/_pearls"
else
	"$pearls_bin" completions zsh > "$dest/_pearls"
fi

echo "==> Installed completions: $dest/_pearls"

# --- tell the user what's left to do --------------------------------------------

if [[ -n "$omz_dir" && "$dest" == "$omz_dir/custom/completions" ]]; then
	echo "==> oh-my-zsh loads this directory automatically — just restart your shell (\`exec zsh\`)"
	echo "==> then try: pearls <TAB>"
	exit 0
fi

zshrc="${ZDOTDIR:-$HOME}/.zshrc"
if [[ -f "$zshrc" ]] && grep -qE "(^|[^#]*\s)fpath=.*$dest" "$zshrc"; then
	echo "==> Restart your shell (\`exec zsh\`) and try: pearls <TAB>"
else
	cat <<EOF
==> Almost done — make sure your .zshrc loads completions:

  fpath=($dest \$fpath)
  autoload -Uz compinit && compinit

then restart your shell (\`exec zsh\`) and try: pearls <TAB>

If completions seem stale, clear zsh's cache:  rm -f ~/.zcompdump* && exec zsh
EOF
fi
