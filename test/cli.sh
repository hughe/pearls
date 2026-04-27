#!/usr/bin/env bash
# pearls CLI smoke/integration tests.
#
# Exercises every command the CLI exposes against a scratch todos
# directory, asserting both human and --json output plus the on-disk
# file format. Designed to match the same checks used when developing
# the CLI: create -> list -> get -> update -> append -> claim/release
# -> close/reopen -> delete, plus error paths.
#
# Usage:
#   test/cli.sh                 # use tsx to run src/cli.ts (fast, no build)
#   PEARLS_BIN=dist test/cli.sh # run the built dist/src/cli.js instead
#                               # (first runs `npm run build` if needed)
#
# Exits non-zero on the first failing assertion.

set -euo pipefail

# ---------------------------------------------------------------------------
# Setup
# ---------------------------------------------------------------------------

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

case "${PEARLS_BIN:-tsx}" in
	tsx)
		if [[ ! -x node_modules/.bin/tsx ]]; then
			echo "tsx not installed; run 'npm install' first." >&2
			exit 2
		fi
		PEARLS_CMD=(node_modules/.bin/tsx src/cli.ts)
		;;
	dist)
		if [[ ! -f dist/src/cli.js ]]; then
			echo "Building pearls..." >&2
			npm run --silent build
		fi
		PEARLS_CMD=(node dist/src/cli.js)
		;;
	*)
		# Custom path to a cli entry point.
		PEARLS_CMD=(node "$PEARLS_BIN")
		;;
esac

WORK="$(mktemp -d -t pearls-test.XXXXXX)"
trap 'rm -rf "$WORK"' EXIT

export PI_TODO_PATH="$WORK/todos"
# Deterministic session id so claim/release assertions are stable.
export PEARLS_SESSION="test-session"

pearls() {
	"${PEARLS_CMD[@]}" "$@"
}

# ---------------------------------------------------------------------------
# Assertion helpers
# ---------------------------------------------------------------------------

PASS=0
FAIL=0

pass() {
	PASS=$((PASS + 1))
	printf '  \033[32mok\033[0m %s\n' "$1"
}

fail() {
	FAIL=$((FAIL + 1))
	printf '  \033[31mFAIL\033[0m %s\n' "$1" >&2
	if [[ -n "${2:-}" ]]; then
		printf '       %s\n' "$2" >&2
	fi
}

assert_contains() {
	local haystack="$1" needle="$2" desc="$3"
	if [[ "$haystack" == *"$needle"* ]]; then
		pass "$desc"
	else
		fail "$desc" "expected to contain: $needle"
		printf '       got: %s\n' "$haystack" >&2
	fi
}

assert_not_contains() {
	local haystack="$1" needle="$2" desc="$3"
	if [[ "$haystack" != *"$needle"* ]]; then
		pass "$desc"
	else
		fail "$desc" "expected NOT to contain: $needle"
	fi
}

assert_eq() {
	local got="$1" want="$2" desc="$3"
	if [[ "$got" == "$want" ]]; then
		pass "$desc"
	else
		fail "$desc" "want: $want"
		printf '       got: %s\n' "$got" >&2
	fi
}

assert_status() {
	# Runs "$@" and expects a specific exit code (first arg).
	local want="$1"; shift
	local desc="$1"; shift
	local got=0
	"$@" >/dev/null 2>&1 || got=$?
	if [[ "$got" == "$want" ]]; then
		pass "$desc"
	else
		fail "$desc" "exit want=$want got=$got while running: $*"
	fi
}

section() {
	printf '\n\033[1m%s\033[0m\n' "$1"
}

extract_id() {
	# Parse the first human-output line, which looks like:
	#   TODO-<hex> <title>...
	# Returns just the hex id (no TODO- prefix).
	awk 'NR==1 { sub(/^TODO-/, "", $1); print $1; exit }'
}

# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

section "help"
out="$(pearls help)"
assert_contains "$out" "pearls — agent-friendly todos" "help prints banner"
assert_contains "$out" "create <title...>" "help lists create command"
assert_contains "$out" "--json" "help documents --json"
assert_contains "$out" "quickstart" "help lists quickstart command"

section "quickstart"
out="$(pearls quickstart)"
assert_contains "$out" "agent's guide" "quickstart prints banner"
assert_contains "$out" "pearls claim" "quickstart shows the claim step"
assert_contains "$out" "--json" "quickstart mentions --json output"

section "dir command before any todos"
out="$(pearls dir)"
assert_eq "$out" "$WORK/todos" "dir resolves to \$PI_TODO_PATH"

# A pearls invocation will ensure the dir exists.
[[ -d "$WORK/todos" ]] && pass "todos dir auto-created" || fail "todos dir auto-created"

section "create (human)"
out="$(pearls create "Write docs" --tag docs --tag readme --body "Initial body.")"
assert_contains "$out" "TODO-" "create prints an id"
assert_contains "$out" "Write docs" "create prints title"
assert_contains "$out" "[docs, readme]" "create prints tags"
assert_contains "$out" "status: open" "create defaults to open"
assert_contains "$out" "Initial body." "create echoes body"
ID="$(printf '%s' "$out" | extract_id)"
if [[ ${#ID} -eq 8 ]]; then
	pass "id is 8-char hex ($ID)"
else
	fail "id is 8-char hex" "got '$ID'"
fi

FILE="$WORK/todos/$ID.md"
[[ -f "$FILE" ]] && pass "todo file written at $FILE" || fail "todo file exists"

section "on-disk file format"
first_char="$(head -c1 "$FILE")"
assert_eq "$first_char" "{" "file starts with JSON front matter"
# The JSON object ends at some '}', followed by blank line, then body.
# Just check that both halves are present.
assert_contains "$(cat "$FILE")" "\"id\": \"$ID\"" "front matter contains id"
assert_contains "$(cat "$FILE")" "\"title\": \"Write docs\"" "front matter contains title"
assert_contains "$(cat "$FILE")" "Initial body." "body section present"

section "create (--json shape)"
out="$(pearls create "Second task" --tag qa --json)"
# Agent JSON uses the TODO- prefix on id.
assert_contains "$out" '"id": "TODO-' "json get-shape uses TODO- prefix"
assert_contains "$out" '"title": "Second task"' "json contains title"
assert_contains "$out" '"tags": [' "json contains tags array"
assert_contains "$out" '"status": "open"' "json contains status"
ID2_PREFIX="$(printf '%s' "$out" | sed -n 's/.*"id": "TODO-\([a-f0-9]\{8\}\)".*/\1/p' | head -1)"
[[ ${#ID2_PREFIX} -eq 8 ]] && pass "second id parsed ($ID2_PREFIX)" || fail "second id parsed"

section "list (human)"
out="$(pearls list)"
assert_contains "$out" "Assigned todos (0)" "list shows assigned section"
assert_contains "$out" "Open todos (2)" "list shows 2 open todos"
assert_contains "$out" "Closed todos (0)" "list shows 0 closed"
assert_contains "$out" "Write docs" "list includes first todo"
assert_contains "$out" "Second task" "list includes second todo"

section "list --json (agent shape)"
out="$(pearls list --json)"
assert_contains "$out" '"assigned": []' "json list has empty assigned"
assert_contains "$out" '"open": [' "json list has open array"
assert_contains "$out" '"closed": []' "json list has empty closed"
# Body isn't part of the list payload (matches Pi tool shape).
assert_not_contains "$out" '"body"' "json list omits body field"

section "search"
# Add an easily-matched third todo so search has something distinctive
# to filter on across id / title / tags.
pearls create "Wibble widget" --tag wibble >/dev/null

out="$(pearls search wibble)"
assert_contains "$out" "Wibble widget" "search finds by title"
assert_not_contains "$out" "Second task" "search excludes non-matches"

out="$(pearls search wibble --json)"
assert_contains "$out" '"title": "Wibble widget"' "search --json wraps matches in list shape"
assert_contains "$out" '"open": [' "search --json uses list shape"

# Close the wibble todo so we can test --closed behaviour.
WID="$(printf '%s' "$out" | sed -n 's/.*"id": "TODO-\([a-f0-9]\{8\}\)".*/\1/p' | head -1)"
pearls close "TODO-$WID" >/dev/null

out="$(pearls search wibble)"
assert_not_contains "$out" "Wibble widget" "search excludes closed by default"

out="$(pearls search wibble --closed)"
assert_contains "$out" "Wibble widget" "search --closed includes closed todos"

# Missing-query and no-match behaviours.
assert_status 2 "search with no query errors" pearls search
out="$(pearls search no-such-todo-anywhere-12345)"
assert_eq "$out" "" "search with no matches prints nothing"

# Reopen so later sections don't trip over an unexpected closed todo.
pearls reopen "TODO-$WID" >/dev/null
pearls delete "TODO-$WID" >/dev/null

section "get / show / path"
out="$(pearls get "TODO-$ID")"
assert_contains "$out" "TODO-$ID" "get finds by TODO-<hex>"
assert_contains "$out" "Initial body." "get prints body"

out="$(pearls show "$ID")"
assert_contains "$out" "Initial body." "show accepts raw hex id"

out="$(pearls path "TODO-$ID")"
assert_eq "$out" "$FILE" "path prints absolute file path"

# Bad id is rejected.
assert_status 2 "get rejects bad id"  pearls get NOT-AN-ID
assert_status 1 "get reports missing" pearls get TODO-00000000

section "update (title + tags + body)"
out="$(pearls update "TODO-$ID" --title "Write better docs" --tag docs --tag urgent --body "Replaced body.")"
assert_contains "$out" "Write better docs" "update changed title"
assert_contains "$out" "[docs, urgent]" "update replaced tags"
assert_contains "$out" "Replaced body." "update replaced body"
assert_not_contains "$(cat "$FILE")" "Initial body." "update replaced body on disk"

section "update requires some field"
assert_status 2 "bare update errors" pearls update "TODO-$ID"

section "append (--body, --stdin-body, --body-file)"
out="$(pearls append "TODO-$ID" --body "Appended via flag.")"
assert_contains "$out" "Appended via flag." "append via --body works"

out="$(printf 'Appended via stdin.\n' | pearls append "TODO-$ID" --stdin-body)"
assert_contains "$out" "Appended via stdin." "append via --stdin-body works"

tmpbody="$(mktemp)"
printf 'Appended from file.\n' > "$tmpbody"
out="$(pearls append "TODO-$ID" --body-file "$tmpbody")"
rm -f "$tmpbody"
assert_contains "$out" "Appended from file." "append via --body-file works"

assert_status 2 "empty append errors" pearls append "TODO-$ID"

section "claim / release with sessions"
out="$(pearls claim "TODO-$ID")"
assert_contains "$out" "(assigned: $PEARLS_SESSION)" "claim assigns current session"
# list should now show it in the "Assigned" section.
out="$(pearls list)"
assert_contains "$out" "Assigned todos (1)" "assigned count updated"

# A different session cannot claim without --force.
assert_status 1 "foreign claim blocked without --force" \
	env PEARLS_SESSION=someone-else "${PEARLS_CMD[@]}" claim "TODO-$ID"

# With --force it steals.
out="$(PEARLS_SESSION=someone-else "${PEARLS_CMD[@]}" claim "TODO-$ID" --force)"
assert_contains "$out" "(assigned: someone-else)" "claim --force steals"

# Releasing as the wrong session also requires --force.
assert_status 1 "foreign release blocked without --force" \
	"${PEARLS_CMD[@]}" release "TODO-$ID"

out="$(pearls release "TODO-$ID" --force)"
assert_not_contains "$out" "assigned:" "release --force clears assignment"

section "close / reopen"
out="$(pearls close "TODO-$ID")"
assert_contains "$out" "status: closed" "close sets status"
# `list` mirrors the Pi tool's `list` action: it only shows assigned + open
# (the closed section header still renders with count 0). Use `list-all`
# and `list-all --json` to see closed todos.
out="$(pearls list)"
assert_contains "$out" "Closed todos (0)" "list hides closed todos (Pi parity)"
out="$(pearls list-all)"
assert_contains "$out" "Closed todos (1)" "list-all includes closed todo"
out="$(pearls list-all --json)"
assert_contains "$out" '"status": "closed"' "list-all --json reflects closed"

out="$(pearls reopen "TODO-$ID")"
assert_contains "$out" "status: open" "reopen sets status"

section "closing an assigned todo clears assignment"
pearls claim "TODO-$ID" >/dev/null
pearls close "TODO-$ID" >/dev/null
out="$(pearls get "TODO-$ID")"
assert_not_contains "$out" "assigned:" "closing clears assignment"
pearls reopen "TODO-$ID" >/dev/null

section "--todo-dir flag"
ALT="$WORK/alt-todos"
out="$(pearls --todo-dir "$ALT" list)"
# formatTodoList() returns the string "No todos." for an empty set; it
# only renders the three-section layout when there's at least one todo.
assert_contains "$out" "No todos." "fresh --todo-dir starts empty"
pearls --todo-dir "$ALT" create "In alt dir" >/dev/null
alt_md_count=$(find "$ALT" -maxdepth 1 -name '*.md' -type f | wc -l | tr -d ' ')
assert_eq "$alt_md_count" "1" "--todo-dir wrote exactly one .md into alt directory"

section "delete"
out="$(pearls delete "TODO-$ID")"
assert_contains "$out" "Deleted TODO-$ID" "delete prints confirmation"
[[ ! -f "$FILE" ]] && pass "file removed on delete" || fail "file removed on delete"
assert_status 1 "delete of missing errors" pearls delete "TODO-$ID"

section "--no-gc"
# Can't easily test GC without time travel; just assert the flag is
# accepted and the command still succeeds.
out="$(pearls --no-gc list)"
assert_contains "$out" "Open todos" "--no-gc still produces output"

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------

TOTAL=$((PASS + FAIL))
printf '\n\033[1m%d/%d checks passed\033[0m\n' "$PASS" "$TOTAL"
if [[ "$FAIL" -gt 0 ]]; then
	printf '\033[31m%d failed\033[0m\n' "$FAIL" >&2
	exit 1
fi
