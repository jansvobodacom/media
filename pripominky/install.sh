#!/bin/bash
# Instalace hlídače připomínek (Jan Svoboda). Stačí spustit jednou.
set -e
APP="$HOME/Library/Application Support/Pripominky"
PL="$HOME/Library/LaunchAgents/com.jansvoboda.pripominky.plist"
mkdir -p "$APP" "$HOME/Pripominky/hotovo" "$HOME/Library/LaunchAgents"
curl -fsSL https://jansvobodacom.github.io/media/pripominky/hlidac.sh -o "$APP/hlidac.sh"
chmod +x "$APP/hlidac.sh"
cat > "$PL" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.jansvoboda.pripominky</string>
  <key>ProgramArguments</key><array><string>/bin/bash</string><string>$APP/hlidac.sh</string></array>
  <key>StartInterval</key><integer>60</integer>
  <key>RunAtLoad</key><true/>
  <key>AbandonProcessGroup</key><true/>
</dict></plist>
PLIST
launchctl bootout gui/$(id -u) "$PL" 2>/dev/null || true
launchctl bootstrap gui/$(id -u) "$PL"
# zkušební připomínka za 1 minutu
T=$(date -v+1M "+%Y-%m-%d %H:%M")
printf "%s\nTest – hlídač připomínek funguje\nKlikni na Hotovo. Od teď ti budu připomínky ukazovat tady na Macu.\n" "$T" > "$HOME/Pripominky/test.txt"
echo ""
echo "✅ Hotovo. Do minuty by mělo vyskočit zkušební okno."
