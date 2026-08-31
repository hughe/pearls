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
#   PEARLS_BIN=dist test/cli.sh # build, then run dist/src/cli.js instead
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
		# Always rebuild. Testing whether dist/ merely exists means a stale
		# build silently passes for the code it was built from, not the code
		# in the working tree.
		echo "Building pearls..." >&2
		npm run --silent build
		PEARLS_CMD=(node dist/src/cli.js)
		;;
	*)
		# Custom path to a cli entry point.
		PEARLS_CMD=(node "$PEARLS_BIN")
		;;
esac

WORK="$(mktemp -d -t pearls-test.XXXXXX)"
trap 'rm -rf "$WORK"' EXIT

export PEARLS_DIR="$WORK/todos"
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
	#   T<hex> <title>...   (M<hex> for memories)
	# Returns just the hex id, with no prefix letter.
	awk 'NR==1 { sub(/^[TM]/, "", $1); print $1; exit }'
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
assert_eq "$out" "$WORK/todos" "dir resolves to \$PEARLS_DIR"

# A pearls invocation will ensure the dir exists.
[[ -d "$WORK/todos" ]] && pass "todos dir auto-created" || fail "todos dir auto-created"

section "create (human)"
out="$(pearls create "Write docs" --tag docs --tag readme --body "Initial body.")"
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
assert_contains "$out" "T$ID" "create prints the id as T<hex>"
assert_not_contains "$out" "TODO-" "create does not print the old TODO- prefix"

# Ask the CLI where the file is rather than composing the path, so these
# assertions survive the next change to the filename scheme.
FILE="$(pearls path "$ID")"
[[ -f "$FILE" ]] && pass "todo file written at $FILE" || fail "todo file exists"
assert_eq "$(basename "$FILE")" "T$ID-write-docs.md" "filename is T<hex>-<slug>.md"

section "on-disk file format"
first_char="$(head -c1 "$FILE")"
assert_eq "$first_char" "{" "file starts with JSON front matter"
# The JSON object ends at some '}', followed by blank line, then body.
# Just check that both halves are present.
assert_contains "$(cat "$FILE")" "\"id\": \"$ID\"" "front matter contains id"
assert_contains "$(cat "$FILE")" "\"title\": \"Write docs\"" "front matter contains title"
assert_contains "$(cat "$FILE")" "Initial body." "body section present"
assert_contains "$(cat "$FILE")" "# Write docs" "body starts with title heading"
assert_contains "$(cat "$FILE")" "## Description" "body has Description subheading"

section "create (--json shape)"
out="$(pearls create "Second task" --tag qa --json)"
# Agent JSON carries the same display form as human output.
assert_contains "$out" '"id": "T' "json get-shape uses the T prefix"
assert_contains "$out" '"title": "Second task"' "json contains title"
assert_contains "$out" '"tags": [' "json contains tags array"
assert_contains "$out" '"status": "open"' "json contains status"
ID2_PREFIX="$(printf '%s' "$out" | sed -n 's/.*"id": "[TM]\([a-f0-9]\{8\}\)".*/\1/p' | head -1)"
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

section "search (fuzzy)"
# Add an easily-matched third todo so search has something distinctive
# to filter on across id / title / tags.
pearls create "Wibble widget" --tag wibble >/dev/null

out="$(pearls search -f wibble)"
assert_contains "$out" "Wibble widget" "search -f finds by title"
assert_not_contains "$out" "Second task" "search excludes non-matches"

out="$(pearls search --fuzzy wibble)"
assert_contains "$out" "Wibble widget" "search --fuzzy long form works"

out="$(pearls search -f wibble --json)"
assert_contains "$out" '"title": "Wibble widget"' "search --json wraps matches in list shape"
assert_contains "$out" '"open": [' "search --json uses list shape"

# Close the wibble todo so we can test --closed behaviour.
WID="$(printf '%s' "$out" | sed -n 's/.*"id": "[TM]\([a-f0-9]\{8\}\)".*/\1/p' | head -1)"
pearls close "TODO-$WID" >/dev/null

out="$(pearls search -f wibble)"
assert_not_contains "$out" "Wibble widget" "search excludes closed by default"

out="$(pearls search -f wibble --closed)"
assert_contains "$out" "Wibble widget" "search --closed includes closed todos"

# At-least-one-filter requirement and no-match behaviours.
assert_status 2 "search with no filters errors" pearls search
assert_status 2 "search rejects positional terms" pearls search wibble
out="$(pearls search -f no-such-todo-anywhere-12345)"
assert_eq "$out" "" "search with no matches prints nothing"

# Reopen so later sections don't trip over an unexpected closed todo.
pearls reopen "TODO-$WID" >/dev/null
pearls delete "TODO-$WID" >/dev/null

section "search (priority + child-of)"
# Build a small fixture: parent with two children at different priorities,
# plus an unrelated priority-0 todo.
PARENT_OUT="$(pearls create "Parent task" --json)"
PARENT_ID="$(printf '%s' "$PARENT_OUT" | sed -n 's/.*"id": "[TM]\([a-f0-9]\{8\}\)".*/\1/p' | head -1)"

CHILD_A_OUT="$(pearls create "Child A" --priority 0 --parent "TODO-$PARENT_ID" --json)"
CHILD_A_ID="$(printf '%s' "$CHILD_A_OUT" | sed -n 's/.*"id": "[TM]\([a-f0-9]\{8\}\)".*/\1/p' | head -1)"

CHILD_B_OUT="$(pearls create "Child B" --priority 3 --parent "TODO-$PARENT_ID" --json)"
CHILD_B_ID="$(printf '%s' "$CHILD_B_OUT" | sed -n 's/.*"id": "[TM]\([a-f0-9]\{8\}\)".*/\1/p' | head -1)"

UNRELATED_OUT="$(pearls create "Unrelated p0" --priority 0 --json)"
UNRELATED_ID="$(printf '%s' "$UNRELATED_OUT" | sed -n 's/.*"id": "[TM]\([a-f0-9]\{8\}\)".*/\1/p' | head -1)"

# -p filters by priority exactly.
out="$(pearls search -p 0)"
assert_contains "$out" "Child A" "search -p 0 includes priority-0 child"
assert_contains "$out" "Unrelated p0" "search -p 0 includes priority-0 sibling"
assert_not_contains "$out" "Child B" "search -p 0 excludes priority-3 child"
assert_not_contains "$out" "Parent task" "search -p 0 excludes todos with no priority"

out="$(pearls search --priority 3)"
assert_contains "$out" "Child B" "search --priority 3 includes priority-3 child"
assert_not_contains "$out" "Child A" "search --priority 3 excludes priority-0 child"

# -c filters by parent field.
out="$(pearls search -c "TODO-$PARENT_ID")"
assert_contains "$out" "Child A" "search -c finds child A"
assert_contains "$out" "Child B" "search -c finds child B"
assert_not_contains "$out" "Unrelated p0" "search -c excludes non-children"
assert_not_contains "$out" "Parent task" "search -c excludes the parent itself"

# Bare hex form also accepted.
out="$(pearls search --child-of "$PARENT_ID")"
assert_contains "$out" "Child A" "search --child-of accepts raw hex id"

# Combining -p and -c narrows further.
out="$(pearls search -p 0 -c "TODO-$PARENT_ID")"
assert_contains "$out" "Child A" "search -p + -c keeps matching child"
assert_not_contains "$out" "Child B" "search -p + -c filters out wrong priority"
assert_not_contains "$out" "Unrelated p0" "search -p + -c filters out wrong parent"

# Combining -f with -p.
out="$(pearls search -f Child -p 3)"
assert_contains "$out" "Child B" "search -f + -p includes the matching child"
assert_not_contains "$out" "Child A" "search -f + -p excludes wrong-priority match"

# Bad inputs.
assert_status 2 "search rejects bad priority" pearls search -p 5
assert_status 2 "search rejects malformed parent id" pearls search -c NOT-AN-ID

# Tidy up so later sections see the original todo set.
pearls delete "TODO-$CHILD_A_ID" >/dev/null
pearls delete "TODO-$CHILD_B_ID" >/dev/null
pearls delete "TODO-$UNRELATED_ID" >/dev/null
pearls delete "TODO-$PARENT_ID" >/dev/null

section "list ordering by priority"
# Build three todos at priorities 4, 0, and 2 in creation order; the list
# should re-order them ascending (0, 2, 4).
P4_OUT="$(pearls create "Prio four" --priority 4 --json)"
P4_ID="$(printf '%s' "$P4_OUT" | sed -n 's/.*"id": "[TM]\([a-f0-9]\{8\}\)".*/\1/p' | head -1)"
P0_OUT="$(pearls create "Prio zero" --priority 0 --json)"
P0_ID="$(printf '%s' "$P0_OUT" | sed -n 's/.*"id": "[TM]\([a-f0-9]\{8\}\)".*/\1/p' | head -1)"
P2_OUT="$(pearls create "Prio two" --priority 2 --json)"
P2_ID="$(printf '%s' "$P2_OUT" | sed -n 's/.*"id": "[TM]\([a-f0-9]\{8\}\)".*/\1/p' | head -1)"

out="$(pearls list)"
# Within the open section, expect 0 < 2 < 4.
order="$(printf '%s\n' "$out" | awk '/^  T[0-9a-f]{8}/ { print }' | grep -oE 'Prio (zero|two|four)' | tr '\n' '|')"
assert_eq "$order" "Prio zero|Prio two|Prio four|" "list orders open todos by priority asc"

# Priority marker appears between the id and the title.
assert_contains "$out" "[P0] Prio zero" "list shows [P0] before priority-0 title"
assert_contains "$out" "[P4] Prio four" "list shows [P4] before priority-4 title"
assert_not_contains "$out" "[P] Second task" "no priority marker for unprioritised todos"

# Todos without priority fall after prioritised ones.
out="$(pearls list)"
no_prio_line=$(printf '%s\n' "$out" | awk '/Second task/ { print NR }')
prio_four_line=$(printf '%s\n' "$out" | awk '/Prio four/ { print NR }')
[[ -n "$no_prio_line" && -n "$prio_four_line" && "$no_prio_line" -gt "$prio_four_line" ]] \
	&& pass "no-priority todos sort after prioritised todos" \
	|| fail "no-priority todos sort after prioritised todos" \
		"no_prio_line=$no_prio_line prio_four_line=$prio_four_line"

# Tidy up.
pearls delete "TODO-$P0_ID" >/dev/null
pearls delete "TODO-$P2_ID" >/dev/null
pearls delete "TODO-$P4_ID" >/dev/null

section "colorized human output"
# These tests run piped (no tty), so the default must be plain text —
# the bytes agents parse stay identical to the uncolorized formatter.
out="$(pearls list)"
assert_not_contains "$out" "$(printf '\033')" "piped list has no ANSI escapes"

# FORCE_COLOR paints: yellow ids, colored priorities, dim metadata.
# A fresh P0 fixture (the earlier priority todos were tidied away).
PID0="$(pearls create 'Colourful fixture' --priority 0 | extract_id)"
colored="$(FORCE_COLOR=1 pearls list-all)"
assert_contains "$colored" "$(printf '\033[90mT')" "forced color grays ids"
assert_contains "$colored" "$(printf '\033[1;31m [P0]')" "P0 is bold red"
assert_contains "$colored" "$(printf '\033[93m [P?]')" "unset priority is warning yellow"
assert_eq "$(printf '%s' "$colored" | sed 's/\x1b\[[0-9;]*m//g')" "$(pearls list-all)" \
	"stripped colored output equals plain output"

# Closed pearls are muted: dim id, dim priority color, dim title.
CID="$(pearls create 'Colour me closed' --priority 2 | extract_id)"
pearls close "$CID" >/dev/null
colored="$(FORCE_COLOR=1 pearls list-all)"
assert_contains "$colored" "$(printf '\033[2;90mT%s' "$CID")" "closed pearl's id is dim gray"
assert_contains "$colored" "$(printf '\033[2;35m [P2]')" "closed pearl's priority is dimmed"
assert_contains "$colored" "$(printf '\033[2mColour me closed')" "closed pearl's title is dimmed"

# search and get honor colors too.
colored="$(FORCE_COLOR=1 pearls search -f 'Colour me' --closed)"
assert_contains "$colored" "$(printf '\033[2;90mT%s' "$CID")" "search dims closed results"
colored="$(FORCE_COLOR=1 pearls get "$CID")"
assert_contains "$colored" "$(printf '\033[2;35m2')" "get paints the priority value"
assert_contains "$colored" "$(printf 'status: \033[2mclosed')" "get dims a closed status"
pearls delete "TODO-$CID" >/dev/null

# Flag precedence: --no-color beats FORCE_COLOR; --color beats NO_COLOR.
out="$(FORCE_COLOR=1 pearls list --no-color)"
assert_not_contains "$out" "$(printf '\033')" "--no-color beats FORCE_COLOR"
out="$(NO_COLOR=1 pearls list --color)"
assert_contains "$out" "$(printf '\033[90mT')" "--color beats NO_COLOR"
pearls delete "TODO-$PID0" >/dev/null

section "pager"
# A fake less records what it receives and the env it saw. Named 'less'
# so the FRX default kicks in.
mkdir -p "$WORK/bin"
cat > "$WORK/bin/less" <<EOF
#!/usr/bin/env bash
cat > "$WORK/paged.out"
printf '%s' "\${LESS:-unset}" > "$WORK/pager-less-env"
EOF
chmod +x "$WORK/bin/less"

# Piped output (as in this harness) never starts the pager, even with
# PEARLS_PAGER set — agents must always get the plain stream.
rm -f "$WORK/paged.out"
PEARLS_PAGER="$WORK/bin/less" pearls list >/dev/null
[[ ! -e "$WORK/paged.out" ]] \
	&& pass "pager not started when piped" || fail "pager not started when piped"

# With a pty (via script), the pager receives the full colored listing
# and the less-lookalike gets LESS=FRX (quit-if-one-screen etc.).
if command -v script >/dev/null 2>&1; then
	rm -f "$WORK/paged.out" "$WORK/pager-less-env"
	env -u LESS PEARLS_PAGER="$WORK/bin/less" \
		script -qec "$ROOT/pearls-dev list" /dev/null >/dev/null 2>&1 || true
	assert_contains "$(cat "$WORK/paged.out" 2>/dev/null)" "Open todos" \
		"pager receives list output on a TTY"
	assert_contains "$(cat "$WORK/paged.out" 2>/dev/null)" "$(printf '\033[')" \
		"pager receives colored output"
	assert_eq "$(cat "$WORK/pager-less-env" 2>/dev/null)" "FRX" \
		"less-lookalike pager gets LESS=FRX"

	# --json disables the pager even on a TTY.
	rm -f "$WORK/paged.out"
	env -u LESS PEARLS_PAGER="$WORK/bin/less" \
		script -qec "$ROOT/pearls-dev list --json" /dev/null >/dev/null 2>&1 || true
	[[ ! -e "$WORK/paged.out" ]] \
		&& pass "--json skips the pager on a TTY" || fail "--json skips the pager on a TTY"
else
	printf '  \033[2mskip\033[0m %s\n' "script(1) unavailable; pager-on-TTY tests skipped"
fi

section "get / show / path"
out="$(pearls get "TODO-$ID")"
assert_contains "$out" "T$ID" "get finds by TODO-<hex> (legacy input)"
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

section "priority + parent fields"
out="$(pearls create "Child task" --priority 2 --parent "TODO-$ID" --json)"
assert_contains "$out" '"priority": 2' "create stores priority in JSON output"
assert_contains "$out" "\"parent\": \"$ID\"" "create stores parent in JSON output"
CHILD_ID="$(printf '%s' "$out" | sed -n 's/.*"id": "[TM]\([a-f0-9]\{8\}\)".*/\1/p' | head -1)"
[[ ${#CHILD_ID} -eq 8 ]] && pass "child id parsed ($CHILD_ID)" || fail "child id parsed"

CHILD_FILE="$(pearls path "$CHILD_ID")"
assert_contains "$(cat "$CHILD_FILE")" '"priority": 2' "front matter contains priority"
assert_contains "$(cat "$CHILD_FILE")" "\"parent\": \"$ID\"" "front matter contains parent"

# Human output renders both new fields.
out="$(pearls get "TODO-$CHILD_ID")"
assert_contains "$out" "priority: 2" "get prints priority"
assert_contains "$out" "parent: T$ID" "get prints parent in T<hex> form"

# Update can change priority + parent.
out="$(pearls update "TODO-$CHILD_ID" --priority 0 --json)"
assert_contains "$out" '"priority": 0' "update changes priority"

# Bad priority is rejected.
assert_status 2 "priority out of range rejected" \
	pearls create "Bad" --priority 5
assert_status 2 "priority non-integer rejected" \
	pearls create "Bad" --priority abc

# Bad parent is rejected.
assert_status 2 "parent invalid id rejected" \
	pearls create "Bad" --parent NOT-AN-ID

# Clearing parent via empty string.
out="$(pearls update "TODO-$CHILD_ID" --parent "" --json)"
assert_not_contains "$out" '"parent"' "empty --parent clears the parent field"

# Tidy up so later sections see the same todo set as before.
pearls delete "TODO-$CHILD_ID" >/dev/null

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
assert_contains "$out" "Deleted T$ID" "delete prints confirmation"
[[ ! -f "$FILE" ]] && pass "file removed on delete" || fail "file removed on delete"
assert_status 1 "delete of missing errors" pearls delete "TODO-$ID"

section "CLI argument parsing"
# --version
out="$(pearls --version)"
[[ -n "$out" ]] && pass "--version prints something" || fail "--version prints something"

# -h is --help
out="$(pearls -h)"
assert_contains "$out" "pearls — agent-friendly todos" "-h prints help"

# -q suppresses output on delete
RT_ID="$(pearls create 'Quiet test' --json | sed -n 's/.*"id": "[TM]\([a-f0-9]\{8\}\)".*/\1/p' | head -1)"
out="$(pearls delete "TODO-$RT_ID" -q)"
assert_eq "$out" "" "-q suppresses delete output"

# Command aliases: new/add for create, edit for update, rm for delete, show for get
RT_ID="$(pearls new 'Alias new' --json | sed -n 's/.*"id": "[TM]\([a-f0-9]\{8\}\)".*/\1/p' | head -1)"
[[ ${#RT_ID} -eq 8 ]] && pass "'new' alias creates todo" || fail "'new' alias creates todo"

out="$(pearls add 'Alias add' --json)"
assert_contains "$out" '"title": "Alias add"' "'add' alias creates todo"
ADD_ID="$(printf '%s' "$out" | sed -n 's/.*"id": "[TM]\([a-f0-9]\{8\}\)".*/\1/p' | head -1)"

out="$(pearls edit "TODO-$RT_ID" --title 'Updated via edit' --json)"
assert_contains "$out" '"title": "Updated via edit"' "'edit' alias updates todo"

out="$(pearls show "TODO-$RT_ID")"
assert_contains "$out" "Updated via edit" "'show' alias gets todo"

pearls rm "TODO-$ADD_ID" >/dev/null
[[ ! -f "$WORK/todos/$ADD_ID.md" ]] && pass "'rm' alias deletes todo" || fail "'rm' alias deletes todo"

# --tag=key inline syntax
RT_ID="$(pearls create 'Tag eq test' --tag=eqtag --json | sed -n 's/.*"id": "[TM]\([a-f0-9]\{8\}\)".*/\1/p' | head -1)"
out="$(pearls get "TODO-$RT_ID" --json)"
assert_contains "$out" '"eqtag"' "--tag=value syntax accepted"
pearls delete "TODO-$RT_ID" >/dev/null

# --title flag (instead of positional)
RT_ID="$(pearls create --title 'Title from flag' --json | sed -n 's/.*"id": "[TM]\([a-f0-9]\{8\}\)".*/\1/p' | head -1)"
out="$(pearls get "TODO-$RT_ID" --json)"
assert_contains "$out" '"title": "Title from flag"' "--title flag works for create"
pearls delete "TODO-$RT_ID" >/dev/null

# --type memory
RT_ID="$(pearls create 'A memory' --type memory --json | sed -n 's/.*"id": "[TM]\([a-f0-9]\{8\}\)".*/\1/p' | head -1)"
out="$(pearls get "TODO-$RT_ID" --json)"
assert_contains "$out" '"type": "memory"' "--type memory sets type field"
assert_eq "$(basename "$(pearls path "$RT_ID")")" "M$RT_ID-a-memory.md" \
	"memory filename uses the M prefix"
assert_contains "$(pearls get "$RT_ID")" "M$RT_ID" "memory id displays with the M prefix"
assert_contains "$(pearls get "M$RT_ID")" "M$RT_ID" "M<hex> is accepted as input"
assert_contains "$(pearls get "T$RT_ID")" "M$RT_ID" "the wrong letter still resolves by hex"
assert_contains "$(pearls get "TODO-$RT_ID")" "M$RT_ID" "legacy TODO-<hex> input still resolves"
pearls delete "TODO-$RT_ID" >/dev/null

# Unknown short flag errors
assert_status 2 "unknown short flag errors" pearls -Z list

# Unknown command errors
assert_status 2 "unknown command errors" pearls nope

# -- separator stops flag parsing
RT_ID="$(pearls create --json -- --leading-dash-title | sed -n 's/.*"id": "[TM]\([a-f0-9]\{8\}\)".*/\1/p' | head -1)"
[[ -n "$RT_ID" ]] && pass "create accepts -- separator" || fail "create accepts -- separator"
pearls delete "TODO-$RT_ID" >/dev/null

section "create → list → get JSON round-trip"
# Create a fully-populated todo, then verify every field survives the
# round trip through list --json and get --json unchanged.
RT_ID="$(pearls create 'Round-trip task' --tag rt1 --tag rt2 --priority 1 --body 'RT body text' --json \
	| sed -n 's/.*"id": "[TM]\([a-f0-9]\{8\}\)".*/\1/p' | head -1)"

# Verify the create --json payload has all fields.
CREATE_JSON="$(pearls get "TODO-$RT_ID" --json)"
assert_contains "$CREATE_JSON" '"id": "T' "round-trip: id present"
assert_contains "$CREATE_JSON" '"title": "Round-trip task"' "round-trip: title matches"
assert_contains "$CREATE_JSON" '"rt1"' "round-trip: tag rt1 present"
assert_contains "$CREATE_JSON" '"rt2"' "round-trip: tag rt2 present"
assert_contains "$CREATE_JSON" '"priority": 1' "round-trip: priority matches"
assert_contains "$CREATE_JSON" '"status": "open"' "round-trip: status matches"
assert_contains "$CREATE_JSON" 'RT body text' "round-trip: body present"

# list --json should contain the same fields (minus body).
LIST_JSON="$(pearls list --json)"
assert_contains "$LIST_JSON" '"title": "Round-trip task"' "round-trip: list --json has title"
assert_contains "$LIST_JSON" '"priority": 1' "round-trip: list --json has priority"
assert_not_contains "$LIST_JSON" 'RT body text' "round-trip: list --json omits body"

# Update title + body, then get --json to verify persistence.
out="$(pearls update "TODO-$RT_ID" --title 'Updated RT' --body 'New body' --json)"
assert_contains "$out" '"title": "Updated RT"' "round-trip: update changes title in JSON"
GET_JSON="$(pearls get "TODO-$RT_ID" --json)"
assert_contains "$GET_JSON" '"title": "Updated RT"' "round-trip: updated title persists in get"
assert_contains "$GET_JSON" 'New body' "round-trip: updated body persists in get"

# Append adds to body without replacing.
out="$(pearls append "TODO-$RT_ID" --body 'Appended line')"
GET_JSON="$(pearls get "TODO-$RT_ID" --json)"
assert_contains "$GET_JSON" 'New body' "round-trip: original body preserved after append"
assert_contains "$GET_JSON" 'Appended line' "round-trip: appended content present"

# Close → reopen round-trip.
out="$(pearls close "TODO-$RT_ID" --json)"
assert_contains "$out" '"status": "closed"' "round-trip: close reflected in JSON"
GET_JSON="$(pearls get "TODO-$RT_ID" --json)"
assert_contains "$GET_JSON" '"status": "closed"' "round-trip: closed status persists in get"
assert_contains "$GET_JSON" '"closed_at"' "round-trip: closed_at set on close"

out="$(pearls reopen "TODO-$RT_ID" --json)"
assert_contains "$out" '"status": "open"' "round-trip: reopen reflected in JSON"

# Claim → release round-trip.
out="$(pearls claim "TODO-$RT_ID" --json)"
assert_contains "$out" '"assigned_to_session"' "round-trip: claim sets assigned_to_session"
GET_JSON="$(pearls get "TODO-$RT_ID" --json)"
assert_contains "$GET_JSON" '"assigned_to_session"' "round-trip: assignment persists in get"

out="$(pearls release "TODO-$RT_ID" --json)"
assert_not_contains "$out" '"assigned_to_session"' "round-trip: release clears assigned_to_session"

# Clean up.
pearls delete "TODO-$RT_ID" >/dev/null

section "closed children of an epic"
# A closed child must be hidden wherever a closed top-level pearl is
# hidden: `list` drops both, `list-all` shows both. Before this, the tree
# pulled closed children back in, so `list` printed "Closed todos (0)"
# directly above a closed child rendered under its epic.
EPIC_ID="$(pearls create 'Epic: ship the thing' | extract_id)"
KID_OPEN="$(pearls create 'Child stays open' --parent "$EPIC_ID" | extract_id)"
KID_SHUT="$(pearls create 'Child gets closed' --parent "$EPIC_ID" | extract_id)"
pearls close "$KID_SHUT" >/dev/null

out="$(pearls list)"
assert_contains "$out" "Epic: ship the thing" "list shows the epic"
assert_contains "$out" "Child stays open" "list shows the open child"
assert_not_contains "$out" "Child gets closed" "list hides the closed child"

out="$(pearls list-all)"
assert_contains "$out" "Child gets closed" "list-all shows the closed child"
# Nested under its epic, and only there — it used to appear a second time
# as a flat entry in the closed section.
kid_lines="$(printf '%s\n' "$out" | grep -c 'Child gets closed' || true)"
assert_eq "$kid_lines" "1" "list-all shows the closed child exactly once"
assert_contains "$out" "── T$KID_SHUT" "closed child is rendered nested"

# A closed child of a closed parent still nests, inside the closed section.
SHUT_EPIC="$(pearls create 'Epic that gets closed' | extract_id)"
SHUT_KID="$(pearls create 'Kid of closed epic' --parent "$SHUT_EPIC" | extract_id)"
pearls close "$SHUT_KID" >/dev/null
pearls close "$SHUT_EPIC" >/dev/null
out="$(pearls list-all)"
assert_contains "$out" "── T$SHUT_KID" "closed child nests under a closed parent"
kid_lines="$(printf '%s\n' "$out" | grep -c 'Kid of closed epic' || true)"
assert_eq "$kid_lines" "1" "closed child of a closed parent appears once"
pearls delete "$SHUT_KID" >/dev/null
pearls delete "$SHUT_EPIC" >/dev/null

# --json already excluded it; assert the two outputs agree.
out="$(pearls list --json)"
assert_not_contains "$out" "Child gets closed" "list --json hides the closed child"

pearls delete "$KID_SHUT" >/dev/null
pearls delete "$KID_OPEN" >/dev/null
pearls delete "$EPIC_ID" >/dev/null

section "filename slugs"
# Slug is derived from the title: lowercased, non-alphanumerics collapsed
# to '-', and only then truncated to 40 chars.
SLUG_ID="$(pearls create 'TUI: Ctrl+Shift+M toggle for memories in /pearls' | extract_id)"
assert_eq "$(basename "$(pearls path "$SLUG_ID")")" \
	"T$SLUG_ID-tui-ctrl-shift-m-toggle-for-memories-in.md" "long title is sanitised and cut to 40"

EMPTY_ID="$(pearls create '???' | extract_id)"
assert_eq "$(basename "$(pearls path "$EMPTY_ID")")" "T$EMPTY_ID-untitled.md" \
	"title with no usable characters falls back to 'untitled'"

# --slug overrides the title, and cannot escape the todos directory.
ESCAPE_ID="$(pearls create 'Some title' --slug '../../etc/passwd' | extract_id)"
assert_eq "$(basename "$(pearls path "$ESCAPE_ID")")" "T$ESCAPE_ID-etc-passwd.md" \
	"--slug is sanitised, no path traversal"
[[ -f "$WORK/todos/T$ESCAPE_ID-etc-passwd.md" ]] && pass "slugged file stays in the todos dir" \
	|| fail "slugged file stays in the todos dir"

section "rename policy"
RN_ID="$(pearls create 'Original title' | extract_id)"
pearls update "$RN_ID" --title 'Retitled entirely' --json >/dev/null
assert_eq "$(basename "$(pearls path "$RN_ID")")" "T$RN_ID-original-title.md" \
	"update --title does not rename the file"

pearls reslug "$RN_ID" >/dev/null
assert_eq "$(basename "$(pearls path "$RN_ID")")" "T$RN_ID-retitled-entirely.md" \
	"reslug re-derives the name from the title"

pearls update "$RN_ID" --slug 'hand picked' --json >/dev/null
assert_eq "$(basename "$(pearls path "$RN_ID")")" "T$RN_ID-hand-picked.md" \
	"update --slug renames the file"
assert_contains "$(pearls get "$RN_ID" --json)" '"slug": "hand-picked"' "slug persists in front matter"

section "legacy filenames and migration"
# A pearl written before the T<hex>-<slug> scheme must keep working.
cat > "$WORK/todos/deadbeef.md" <<'LEGACY'
{
  "id": "deadbeef",
  "title": "Legacy pearl",
  "tags": [],
  "status": "open",
  "created_at": "2026-01-01T00:00:00.000Z"
}

# Legacy pearl
LEGACY
assert_contains "$(pearls get TODO-deadbeef --json)" '"title": "Legacy pearl"' \
	"legacy <hex>.md is still readable"
assert_contains "$(pearls list)" "Legacy pearl" "legacy pearl appears in list"

out="$(pearls migrate-filenames --dry-run)"
assert_contains "$out" "deadbeef.md -> Tdeadbeef-legacy-pearl.md" "dry run reports the rename"
[[ -f "$WORK/todos/deadbeef.md" ]] && pass "dry run does not move anything" \
	|| fail "dry run does not move anything"

out="$(pearls migrate-filenames)"
assert_contains "$out" "deadbeef.md -> Tdeadbeef-legacy-pearl.md" "migration reports the rename"
[[ -f "$WORK/todos/Tdeadbeef-legacy-pearl.md" ]] && pass "legacy file renamed" || fail "legacy file renamed"
assert_contains "$(pearls get TODO-deadbeef --json)" '"title": "Legacy pearl"' \
	"id still resolves after migration"

out="$(pearls migrate-filenames)"
assert_contains "$out" "renamed 0 file(s)" "second migration run is a no-op"

section "memory filename prefix"
# Todos are T<hex>-<slug>.md, memories M<hex>-<slug>.md; the front matter
# type is what decides, the prefix letter follows it.
MEM_ID="$(pearls create 'Prefers tabs over spaces' --type memory | extract_id)"
TODO_ID="$(pearls create 'Ship the thing' | extract_id)"
assert_eq "$(basename "$(pearls path "$MEM_ID")")" "M$MEM_ID-prefers-tabs-over-spaces.md" \
	"new memory gets the M prefix"
assert_eq "$(basename "$(pearls path "$TODO_ID")")" "T$TODO_ID-ship-the-thing.md" \
	"new todo keeps the T prefix"

# A memory written before the M prefix existed is re-lettered by the
# migration, and stays resolvable throughout.
cat > "$WORK/todos/Tcafe1234-legacy-memory.md" <<'LEGACYMEM'
{
  "id": "cafe1234",
  "title": "Legacy memory",
  "tags": [],
  "status": "open",
  "created_at": "2026-01-01T00:00:00.000Z",
  "type": "memory",
  "slug": "legacy-memory"
}

# Legacy memory
LEGACYMEM
assert_contains "$(pearls get TODO-cafe1234 --json)" '"type": "memory"' \
	"T-prefixed memory is still readable"
out="$(pearls migrate-filenames --dry-run)"
assert_contains "$out" "Tcafe1234-legacy-memory.md -> Mcafe1234-legacy-memory.md" \
	"dry run reports the prefix change"
pearls migrate-filenames >/dev/null
assert_eq "$(basename "$(pearls path cafe1234)")" "Mcafe1234-legacy-memory.md" \
	"migration re-letters the memory"
assert_contains "$(pearls memories)" "Legacy memory" "re-lettered memory still lists as a memory"
assert_not_contains "$(pearls list)" "Legacy memory" "memories stay out of the todo list"
out="$(pearls migrate-filenames)"
assert_contains "$out" "renamed 0 file(s)" "prefix migration is idempotent"

section "archive on gc"
# Separate todos dir: these settings collect aggressively.
GCDIR="$WORK/gctodos"
mkdir -p "$GCDIR"
printf '{"gc": true, "gcDays": 30, "archive": true}\n' > "$GCDIR/settings.json"

# Closed long ago -> archived.
cat > "$GCDIR/Tcafe0001-retired.md" <<'OLD'
{
  "id": "cafe0001",
  "title": "Retired long ago",
  "tags": [],
  "status": "closed",
  "created_at": "2020-01-01T00:00:00.000Z",
  "closed_at": "2020-02-01T00:00:00.000Z"
}
OLD
# Created long ago but closed recently -> must survive (ages by closed_at).
cat > "$GCDIR/Tcafe0002-just-closed.md" <<OLD
{
  "id": "cafe0002",
  "title": "Closed just now",
  "tags": [],
  "status": "closed",
  "created_at": "2020-01-01T00:00:00.000Z",
  "closed_at": "$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"
}
OLD
# Closed before closed_at existed -> falls back to created_at, so archived.
cat > "$GCDIR/Tcafe0003-no-closed-at.md" <<'OLD'
{
  "id": "cafe0003",
  "title": "No closed_at",
  "tags": [],
  "status": "closed",
  "created_at": "2020-01-01T00:00:00.000Z"
}
OLD

pearls --todo-dir "$GCDIR" list-all >/dev/null   # triggers gc
[[ -f "$GCDIR/archive/Tcafe0001-retired.md" ]] && pass "old closed pearl moved to archive" \
	|| fail "old closed pearl moved to archive"
[[ -f "$GCDIR/Tcafe0002-just-closed.md" ]] && pass "recently closed pearl survives gc" \
	|| fail "recently closed pearl survives gc"
[[ -f "$GCDIR/archive/Tcafe0003-no-closed-at.md" ]] && pass "missing closed_at falls back to created_at" \
	|| fail "missing closed_at falls back to created_at"

cat > "$GCDIR/Mcafe0005-retired-memory.md" <<'OLDMEM'
{
  "id": "cafe0005",
  "title": "Retired memory",
  "tags": [],
  "status": "closed",
  "created_at": "2020-01-01T00:00:00.000Z",
  "closed_at": "2020-02-01T00:00:00.000Z",
  "type": "memory"
}
OLDMEM
pearls --todo-dir "$GCDIR" list-all >/dev/null
[[ -f "$GCDIR/archive/Mcafe0005-retired-memory.md" ]] \
	&& pass "archived memory keeps its M prefix" || fail "archived memory keeps its M prefix"

out="$(pearls --todo-dir "$GCDIR" list-all)"
assert_not_contains "$out" "Retired long ago" "archived pearl is out of list-all"
out="$(pearls --todo-dir "$GCDIR" list-all --archived)"
assert_contains "$out" "Retired long ago" "--archived brings it back"
assert_contains "$(pearls --todo-dir "$GCDIR" get TODO-cafe0001 --json)" '"title": "Retired long ago"' \
	"archived pearl is still readable by id"

# archive: false keeps the old delete-on-gc behaviour.
printf '{"gc": true, "gcDays": 30, "archive": false}\n' > "$GCDIR/settings.json"
cat > "$GCDIR/Tcafe0004-doomed.md" <<'OLD'
{
  "id": "cafe0004",
  "title": "Doomed",
  "tags": [],
  "status": "closed",
  "created_at": "2020-01-01T00:00:00.000Z",
  "closed_at": "2020-02-01T00:00:00.000Z"
}
OLD
pearls --todo-dir "$GCDIR" list-all >/dev/null
[[ ! -f "$GCDIR/Tcafe0004-doomed.md" && ! -f "$GCDIR/archive/Tcafe0004-doomed.md" ]] \
	&& pass "archive:false deletes as before" || fail "archive:false deletes as before"

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
