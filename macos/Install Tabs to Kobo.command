#!/bin/zsh

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

SCRIPT_DIR="${0:A:h}"
REPO_DIR="${SCRIPT_DIR:h}"
LOCAL_LIBRARY_URL="http://127.0.0.1:3217/library"

clear
echo "Tabs to Kobo installer"
echo ""

cd "$REPO_DIR" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 20 or newer is required."
  echo "Install it from https://nodejs.org/ and run this again."
  echo ""
  echo "Press Return to close this window."
  read
  exit 1
fi

echo "Installing companion dependencies..."
npm run setup
setup_status=$?

if [ "$setup_status" -ne 0 ]; then
  echo ""
  echo "Setup failed."
  echo "Press Return to close this window."
  read
  exit "$setup_status"
fi

echo ""
echo "Installing the background service..."
npm run service:install
install_status=$?

if [ "$install_status" -ne 0 ]; then
  echo ""
  echo "Service install failed."
  echo "Press Return to close this window."
  read
  exit "$install_status"
fi

sleep 2
open "$LOCAL_LIBRARY_URL" >/dev/null 2>&1
open -a "Google Chrome" "chrome://extensions" >/dev/null 2>&1

echo ""
echo "Installed."
echo ""
echo "Next in Chrome:"
echo "1. Turn on Developer mode."
echo "2. Click Load unpacked."
echo "3. Choose this folder:"
echo "$REPO_DIR/extension"
echo ""
echo "Press Return to close this window."
read
