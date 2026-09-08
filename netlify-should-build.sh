#!/bin/bash
# Skip Netlify build if only Python scrapers / GitHub Actions / docs changed.
# Exit 0 = skip build. Exit 1 = build.

CHANGED=$(git diff --name-only $CACHED_COMMIT_REF $COMMIT_REF 2>/dev/null)

if [ -z "$CHANGED" ]; then
  echo "No diff found, building."
  exit 1
fi

# If ANY changed file is outside scrapers-only paths, we must build
while IFS= read -r file; do
  case "$file" in
    scrapers/*|.github/workflows/*|docs/*|*.md|*.py)
      # scraper/docs-only change, keep checking
      ;;
    *)
      echo "Non-scraper file changed: $file — building."
      exit 1
      ;;
  esac
done <<< "$CHANGED"

echo "Only scraper/docs files changed — skipping Netlify build."
exit 0
