{
  "id": "6eecf3c5",
  "title": "ZSH completions for pearls",
  "tags": [],
  "status": "closed",
  "created_at": "2026-09-03T14:57:47.183Z",
  "priority": 2,
  "closed_at": "2026-09-03T15:25:35.465Z",
  "slug": "zsh-completions-for-pearls"
}

# ZSH completions for pearls

## Description

Implemented as a `pearls completions zsh` subcommand (prints the script to stdout, so it ships in the npm package without extra files). New src/completions.ts embeds ZSH_COMPLETION; src/cli.ts adds the completions command (zsh only; unsupported shells exit 2; defaults to zsh). Covers all commands/aliases, per-command flags, and dynamic pearl-id completion from pearls list-all. Documented in README (Shell completions) and pearls help. Tests: output assertions, unsupported-shell exit code, zsh -n syntax check. 225/225 pass in tsx and dist modes. T16248fbd was a duplicate of this pearl and has been deleted.
