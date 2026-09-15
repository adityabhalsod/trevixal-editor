#!/usr/bin/env bash
# Remove the 1.0.0 release from npm, leaving 1.0.1 as the only version.
#
# 1.0.0 shipped 2.7 MB of source maps that resolve to nothing, which 1.0.1
# fixed. Unpublishing is optional: `latest` already points at 1.0.1, so nobody
# installing normally receives 1.0.0.
#
# Order matters. npm refuses to unpublish a package another registry package
# depends on, and these depend on each other: `editor-kit@1.0.0` alone names 17
# siblings. The list below is a topological order taken from what 1.0.0
# actually declared on the registry, dependents first, `core` last.
#
# Safe because 1.0.1 exists. Unpublishing *every* version of a package locks
# that name for 24 hours; removing one of two versions does not.
#
# Each call is an account change, so expect two-factor prompts.
set -uo pipefail

VERSION="x.x.x"

# Dependents before their dependencies.
PACKAGES=(
  @trevixal/angular
  @trevixal/editor-kit
  @trevixal/react
  @trevixal/svelte
  @trevixal/vue
  @trevixal/web-component
  @trevixal/extension-blocks
  @trevixal/extension-code-highlight
  @trevixal/extension-diagram
  @trevixal/extension-embed
  @trevixal/extension-emoji
  @trevixal/extension-export
  @trevixal/extension-format-code
  @trevixal/extension-image
  @trevixal/extension-math
  @trevixal/extension-security
  @trevixal/extension-slash-command
  @trevixal/extension-table
  @trevixal/extension-track-changes
  @trevixal/extension-workspace
  @trevixal/extension-writing
  @trevixal/ui
  @trevixal/core
)

if ! npm whoami > /dev/null 2>&1; then
  echo "Not logged in. Run: npm login" >&2
  exit 1
fi

# Refuse to run unless the replacement is actually published: without it, each
# unpublish removes a package's only version and locks the name for a day.
echo "Checking 1.0.1 is published before removing anything..."
for name in "${PACKAGES[@]}"; do
  if [ "$(npm view "$name@1.0.1" version 2>/dev/null)" != "1.0.1" ]; then
    echo "  $name has no 1.0.1 on the registry. Stopping." >&2
    exit 1
  fi
done
echo "  all ${#PACKAGES[@]} have 1.0.1."
echo

removed=() failed=() absent=()
for name in "${PACKAGES[@]}"; do
  printf '%-36s ' "$name@$VERSION"

  if [ "$(npm view "$name@$VERSION" version 2>/dev/null)" != "$VERSION" ]; then
    echo "not on the registry, skipping"
    absent+=("$name")
    continue
  fi

  if npm unpublish "$name@$VERSION" 2>/tmp/unpub-$$.log; then
    echo "removed"
    removed+=("$name")
  else
    echo "FAILED"
    sed 's/^/    /' /tmp/unpub-$$.log | head -3
    failed+=("$name")
  fi
done
rm -f /tmp/unpub-$$.log

echo
echo "removed ${#removed[@]}, already absent ${#absent[@]}, failed ${#failed[@]}"
if [ "${#failed[@]}" -gt 0 ]; then
  printf 'failed: %s\n' "${failed[*]}"
  echo "A failure is usually the dependency rule: something still depends on it." >&2
  exit 1
fi
