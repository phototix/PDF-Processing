#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FILE="$ROOT/index.html"

content="$(cat "$FILE")"
pattern='(styles\.css|app\.js)\?version=([0-9]+\.[0-9]+\.[0-9]+)'

if ! [[ "$content" =~ $pattern ]]; then
  echo "No version found in index.html" >&2
  exit 1
fi

ver="${BASH_REMATCH[2]}"
IFS='.' read -r major minor patch <<< "$ver"
patch=$((patch + 1))
newver="$major.$minor.$patch"

updated="$(printf "%s" "$content" | sed -E "s/(styles\.css|app\.js)\?version=[0-9]+\.[0-9]+\.[0-9]+/\1?version=$newver/g")"

printf "%s" "$updated" > "$FILE"

echo "Version bumped to $newver"
