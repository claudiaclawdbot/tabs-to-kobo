#!/bin/zsh

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

SCRIPT_DIR="${0:A:h}"
REPO_DIR="${SCRIPT_DIR:h}"
LOG_DIR="$HOME/Library/Logs/tabs-to-kobo"
LOCAL_LIBRARY_URL="http://127.0.0.1:3217/library"

clear
echo "Tabs to Kobo"
echo ""

cd "$REPO_DIR" || exit 1

echo "Restarting the background service..."
npm run service:restart
restart_status=$?

if [ "$restart_status" -ne 0 ]; then
  echo ""
  echo "Service restart failed."
  echo "Run npm run service:status for details."
  echo ""
  echo "Press Return to close this window."
  read
  exit "$restart_status"
fi

sleep 2

if curl -fsS "http://127.0.0.1:3217/config" >/tmp/tabs-to-kobo-config.json; then
  echo "Companion is running."
else
  echo "Companion did not answer yet."
  echo "Check logs in: $LOG_DIR"
fi

kobo_url="$(grep 'Kobo library:' "$LOG_DIR/out.log" 2>/dev/null | tail -n 1 | sed 's/^.*Kobo library: //')"

echo ""
echo "Opening the local EPUB library on this computer..."
open "$LOCAL_LIBRARY_URL" >/dev/null 2>&1

if [ -n "$kobo_url" ]; then
  echo ""
  echo "Kobo URL:"
  echo "$kobo_url"
  echo ""
  echo "On the Kobo:"
  echo "More > Beta Features > Web Browser"
  echo ""
  echo "Then enter the Kobo URL above."
fi

echo ""
echo "Press Return to close this window."
read
