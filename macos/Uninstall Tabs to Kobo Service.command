#!/bin/zsh

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

SCRIPT_DIR="${0:A:h}"
REPO_DIR="${SCRIPT_DIR:h}"

clear
echo "Tabs to Kobo uninstaller"
echo ""

cd "$REPO_DIR" || exit 1

echo "Removing the background service..."
npm run service:uninstall

echo ""
echo "The Chrome extension and generated EPUB files were not removed."
echo ""
echo "Press Return to close this window."
read
