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
npx tsx scrape-amsflow.ts

# Check if scrape succeeded
if [ $? -eq 0 ]; then
  echo "Scrape succeeded. Committing and pushing changes..."
  # Pull remote changes first to avoid push rejection
  git pull --rebase origin main
  git add public/api/amsflow.json .scraper-state.json
  # Commit only if there are changes staged
  git diff --staged --quiet || git commit -m "Automated scraper run $(date +'%Y-%m-%d %H:%M:%S')"
  git push origin main
  echo "Push complete."
else
  echo "Scrape failed. Skipping git commit/push."
  exit 1
fi

echo "=== Scraper Run Finished: $(date) ==="
echo "============================================="
