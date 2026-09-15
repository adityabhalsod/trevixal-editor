#!/usr/bin/env bash
# Point every publishable package at this repository's release workflow, so it
# can be published from CI with no token.
#
# npm configures a trusted publisher per package, on that package's own
# settings page, which is why this cannot run before the packages exist.
#
# **This must be run interactively.** Establishing trust is an account change,
# so npm requires two-factor authentication, and `npm trust` has no `--otp`
# flag the way `npm publish` does: the only way through is the prompt it shows
# and the browser flow behind it. Passing `--yes` suppresses that prompt and
# the call then fails with "Two-factor authentication is required".
#
# Safe to re-run. A package that already trusts this workflow is reported and
# skipped rather than duplicated.
#
# Requires npm >= 12 (the `npm trust` command) and `npm login`.
set -uo pipefail

REPOSITORY="adityabhalsod/trevixal-editor"
WORKFLOW="release.yml"
NPM="${NPM:-npm}"

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

if [ ! -t 0 ]; then
  echo "This needs a terminal: each package asks for two-factor confirmation." >&2
  exit 1
fi

if ! "$NPM" whoami > /dev/null 2>&1; then
  echo "Not logged in. Run: npm login" >&2
  exit 1
fi

version="$("$NPM" --version)"
if [ "${version%%.*}" -lt 12 ]; then
  echo "npm $version has no \`trust\` command; needs 12 or newer." >&2
  echo "Either upgrade npm, or configure each package on npmjs.com by hand." >&2
  exit 1
fi

mapfile -t packages < <(
  node -e '
    const { readdirSync, readFileSync } = require("node:fs")
    for (const entry of readdirSync("packages", { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      try {
        const manifest = JSON.parse(readFileSync(`packages/${entry.name}/package.json`, "utf8"))
        if (!manifest.private) console.log(manifest.name)
      } catch {}
    }
  ' | sort
)

echo "${#packages[@]} packages -> $REPOSITORY / $WORKFLOW"
echo

configured=() failed=()
for name in "${packages[@]}"; do
  printf '%-36s ' "$name"

  # No --yes and no output capture: the confirmation prompt and the 2FA
  # browser flow both need the terminal.
  echo
  if "$NPM" trust github "$name" \
      --repository "$REPOSITORY" \
      --file "$WORKFLOW" \
      --allow-publish; then
    echo "  -> ok"
    configured+=("$name")
  else
    echo "  -> FAILED"
    failed+=("$name")
  fi
done

echo
echo "ok ${#configured[@]}, failed ${#failed[@]}"
if [ "${#failed[@]}" -gt 0 ]; then
  printf 'failed: %s\n' "${failed[*]}"
  exit 1
fi
echo
echo "Verify with:  npm trust list @trevixal/core"
