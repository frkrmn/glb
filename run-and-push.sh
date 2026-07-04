#!/bin/bash

# Log starting time
echo "============================================="
echo "=== Scraper Run Started: $(date) ==="
echo "============================================="

# Set environment PATH to find node, npx, git, etc.
export PATH="/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin:$PATH"

# Navigate to the workspace
cd /Users/farukerman/Desktop/brfglb || exit 1

# Run the scrape script
npx tsx scrape-brfkglb.ts

# Check if scrape succeeded
if [ $? -eq 0 ]; then
  echo "Scrape succeeded. Committing and pushing changes..."
  git add public/api/brfkglb.json .scraper-state.json
  # Commit only if there are changes staged
  git diff --staged --quiet || git commit -m "Automated scraper run $(date +'%Y-%m-%d %H:%M:%S')"
  # Pull remote changes (rebase our commit on top) before pushing
  git pull --rebase origin main
  git push origin main
  echo "Push complete."
else
  echo "Scrape failed. Skipping git commit/push."
  exit 1
fi

echo "=== Scraper Run Finished: $(date) ==="
echo "============================================="
