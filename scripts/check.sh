#!/bin/sh
# npm run check — one local gate that mirrors CI.
#
# Quiet on success (a couple of tail lines); full output always lands in
# .check.log (gitignored) so a failure can be grepped without ever
# scrolling past a context window.
#
# Runs prek AND a standalone eslint/prettier check-mode pass on purpose:
# `prek run --all-files` resolves its file list from git (tracked files),
# so a newly written, still-untracked module is invisible to it -- the
# explicit `eslint .` (no --fix) and `prettier --check .` below scan the
# whole working tree in report-only mode and catch that gap; `gitleaks
# dir .` closes the same hole for the gitleaks hook (its `--staged`
# default sees zero files when nothing is staged).
#
# This is not a workaround for autofix hiding failures on tracked files:
# prek marks a hook "Failed" whenever it modifies a tracked file, so
# autofix triggered by already-tracked content still surfaces as a
# failure, never a silently laundered "Passed" (verified in
# blink-cmp-bibtex). The gap above is strictly about untracked files.
#
# prek resolution: prefer the persistent binary scripts/setup-dev.sh
# installs (see that script for why the version is pinned and the
# install is persistent, not an ephemeral `pipx run`/`uv tool run`
# cache entry) over a `prek` on PATH -- a contributor who ran
# `npm run setup` gets the exact pinned version without CI's per-run
# resolution cost. Falling back to `pipx run --spec`/`uv tool run
# --from` (same as CI) when the persistent binary is absent still
# removes the "wrong prek version" class of bug regardless of what else
# happens to be installed or where.
set -eu
cd "$(dirname "$0")/.."

prek_version=$(grep -o 'prek==[0-9][0-9.]*' .github/workflows/ci.yml | head -n1 | cut -d= -f3)
if [ -z "$prek_version" ]; then
	echo "could not read the pinned prek version from .github/workflows/ci.yml"
	exit 1
fi

persist_root="$HOME/.local/state/sauna-card-prek/$prek_version"
persist_bin="$persist_root/bin/prek"

if [ -x "$persist_bin" ]; then
	prek() { "$persist_bin" "$@"; }
elif command -v pipx >/dev/null 2>&1; then
	# --backend pip: pipx's own uv-detection can pick an incompatible
	# uv already on PATH (from an unrelated toolchain) and refuse to run.
	# Older pipx (reported: 1.4.3) predates the --backend flag entirely
	# and errors out on it ("unrecognized arguments"), so only pass it
	# when this pipx's own --help advertises it.
	if pipx run --help 2>&1 | grep -q -- '--backend'; then
		prek() { pipx run --backend pip --spec "prek==$prek_version" prek "$@"; }
	else
		prek() { pipx run --spec "prek==$prek_version" prek "$@"; }
	fi
elif command -v uv >/dev/null 2>&1; then
	prek() { uv tool run --from "prek==$prek_version" prek "$@"; }
else
	echo "missing: pipx or uv -- run npm run setup"
	exit 1
fi

if ! command -v gitleaks >/dev/null 2>&1; then
	echo "missing: gitleaks -- run npm run setup"
	exit 1
fi

log=.check.log
: >"$log"

fail() {
	echo "FAILED: $1 (see $log)"
	tail -n 40 "$log"
	exit 1
}

step() { printf '\n== %s ==\n' "$1" >>"$log"; }

step "prek --all-files"
prek run --all-files --show-diff-on-failure >>"$log" 2>&1 || fail "prek"

step "gitleaks dir . (full tree, not just staged)"
gitleaks dir . --no-banner >>"$log" 2>&1 || fail "gitleaks (full tree)"

step "eslint (no --fix, whole tree)"
npx eslint . >>"$log" 2>&1 || fail "eslint"

step "prettier --check (whole tree)"
npx prettier --check . >>"$log" 2>&1 || fail "prettier --check"

step "typecheck"
npm run typecheck >>"$log" 2>&1 || fail "typecheck"

step "test"
npx vitest run --reporter=dot >>"$log" 2>&1 || fail "test"

step "build"
npm run build >>"$log" 2>&1 || fail "build"

echo "OK: all quality gates passed"
tail -n 2 "$log"
