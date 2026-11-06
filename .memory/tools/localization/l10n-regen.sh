#!/bin/bash
# l10n-regen.sh <tree>: regenerate the converted tree: A -> B -> C -> step D patches (3-way, on a temp index) -> leftovers.
# Steps A-C are the scripts (README.md); step D is the work done by hand after them: on the fork's branch pr/l10n-3, the
# commits of `git log --no-merges --first-parent 1ad4f0b..pr/l10n-3` whose subject does not end in "(made by the script)".
# Prints each exit code (captured before anything else runs) and stops at the first that fails. The tree's src/ holds
# the result; the last line prints it as a git tree (write-tree) for git commit-tree. It rebuilt the conversion of
# PR #100 on each newer upstream main while that PR was open; kept as the record of how it was made.
# Tables: data/ beside this script (or $L10N_TABLES). Step D as patches: $L10N_STEPD/*.patch (git format-patch of those
# commits), optional, none are in this folder; without them the leftover check is skipped, as its allowlist
# (data/leftovers.json) is pr/l10n-3's tree, which has them. Git: `git` on PATH, or $L10N_GIT.
R=${1:?usage: [L10N_STEPD=<dir of *.patch>] l10n-regen.sh <tree: the unconverted source merged with main; its src/ is overwritten>}
T=$(dirname "$(readlink -f "$0")"); [ ! -f "$T/l10n-check.env" ] || . "$T/l10n-check.env"; L=${L10N_TABLES:-$T/data}; N=node
GIT=${L10N_GIT:-git}; command -v "$GIT" >/dev/null || { echo "l10n-regen: $GIT not found" >&2; exit 2; }
G="env -u GIT_INDEX_FILE -u GIT_DIR $GIT -C $R"
IDX=$(mktemp "${TMPDIR:-/tmp}/l10n-regen-idx.XXXX")
GI="env -u GIT_DIR GIT_INDEX_FILE=$IDX $GIT -C $R"
$G checkout -- src; $G clean -fdq src; n=$($G status --porcelain | wc -l); echo "[$(date +%T)] reset: $n changes left"
$N $T/l10n-convert.mjs $R --write --keys $L/keys.json 2>&1 | tail -n 1; rc=${PIPESTATUS[0]}; echo "A exit $rc"; [ "$rc" = 0 ] || exit 1
$N $T/l10n-convert-verify.mjs $R HEAD 2>&1 | tail -n 1; rc=${PIPESTATUS[0]}; echo "A-verify exit $rc"; [ "$rc" = 0 ] || exit 1
$N $T/l10n-move.mjs $R --moves $L/moves.json --write 2>&1 | tail -n 1; rc=${PIPESTATUS[0]}; echo "B exit $rc"; [ "$rc" = 0 ] || exit 1
$N $T/l10n-records.mjs $R --spec $L/records.json --write 2>&1 | tail -n 1; rc=${PIPESTATUS[0]}; echo "C exit $rc"; [ "$rc" = 0 ] || exit 1
$GI read-tree HEAD; $GI add -A src
if [ -n "${L10N_STEPD:-}" ]; then
  for p in "$L10N_STEPD"/*.patch; do $GI apply -3 --whitespace=nowarn "$p"; rc=$?; echo "D $(basename "$p") exit $rc"; [ "$rc" = 0 ] || exit 1; done
  $N $T/l10n-leftovers.mjs $R --allow $L/leftovers.json 2>&1 | grep -v '^\s' | tail -n 30; rc=${PIPESTATUS[0]}; echo "leftovers exit $rc"
else echo "[$(date +%T)] no L10N_STEPD: no patches replayed, leftover check skipped"; fi
$GI add -A src; echo "tree $($GI write-tree)"; rm -f "$IDX"
