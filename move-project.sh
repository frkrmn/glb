#!/bin/bash

echo "=== Migrating glb scraper to /Users/farukerman/brfglb ==="

# 1. Unload old LaunchAgent
echo "Unloading old LaunchAgent..."
launchctl unload ~/Library/LaunchAgents/com.farukerman.glb-scraper.plist 2>/dev/null

# 2. Make sure target directory does not already exist
if [ -d "/Users/farukerman/brfglb" ]; then
  echo "Error: Target directory /Users/farukerman/brfglb already exists!"
  exit 1
fi

# 3. Create target directory and move files
echo "Moving project directory..."
cd /Users/farukerman || exit 1
mv /Users/farukerman/Desktop/brfglb /Users/farukerman/brfglb

# 4. Navigate into new directory
cd /Users/farukerman/brfglb || exit 1

# 5. Update run-and-push.sh paths
echo "Updating script paths..."
sed -i '' 's|/Users/farukerman/Desktop/brfglb|/Users/farukerman/brfglb|g' run-and-push.sh

# 6. Update LaunchAgent plist paths and copy it
echo "Updating and installing new LaunchAgent..."
sed -i '' 's|/Users/farukerman/Desktop/brfglb|/Users/farukerman/brfglb|g' com.farukerman.glb-scraper.plist
cp com.farukerman.glb-scraper.plist /Users/farukerman/Library/LaunchAgents/com.farukerman.glb-scraper.plist

# 7. Load the new LaunchAgent
echo "Loading new LaunchAgent..."
launchctl load /Users/farukerman/Library/LaunchAgents/com.farukerman.glb-scraper.plist

# 8. Recreate the Desktop Shortcut with the new path
echo "Recreating Desktop shortcut..."
cat << 'EOF' > /Users/farukerman/Desktop/Run-Scraper.command
#!/bin/bash
clear
echo "============================================="
echo "=== Starting Manual Scraper & Push Run ==="
echo "============================================="
echo ""

# Run the automated scraper script
/Users/farukerman/brfglb/run-and-push.sh

echo ""
echo "============================================="
echo "Process finished. Press any key to close..."
echo "============================================="
read -n 1 -s
EOF
chmod +x /Users/farukerman/Desktop/Run-Scraper.command

echo "=== Migration Complete! ==="
echo "Your repository is now at /Users/farukerman/brfglb"
echo "Please open /Users/farukerman/brfglb in your IDE."
