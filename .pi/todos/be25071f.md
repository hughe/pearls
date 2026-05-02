{
  "id": "be25071f",
  "title": "Add a few tests for CLI argument parsing and round-trip through todo.ts storage",
  "tags": [
    "cli",
    "tests"
  ],
  "status": "closed",
  "created_at": "2026-04-26T23:54:08.585Z"
}

## Done

Added two new test sections in `test/cli.sh` (132 → 168 checks):

### CLI argument parsing (13 checks)
- `--version`, `-h`, `-q` short flags
- Command aliases: `new`/`add`, `edit`, `rm`, `show`
- `--tag=value` inline syntax
- `--title` flag for create
- `--type memory`
- Unknown short flag and unknown command error paths
- `--` separator for titles starting with dashes

### Create → list → get JSON round-trip (21 checks)
- Full field verification through create/get --json
- list --json includes fields (minus body)
- Update → get persistence check
- Append preserves original body
- Close/reopen status + closed_at round-trip
- Claim/release assignment round-trip

PR: https://github.com/hughe/pearls/pull/10
