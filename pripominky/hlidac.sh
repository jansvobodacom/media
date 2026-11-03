#!/bin/bash
# Hlídač připomínek – každou minutu ho spouští macOS (launchd).
# Připomínka = textový soubor v ~/Pripominky:
#   1. řádek: kdy, např. 2026-11-04 09:00
#   2. řádek: co
#   další řádky: poznámka
DIR="$HOME/Pripominky"
mkdir -p "$DIR/hotovo"
now=$(date +%s)
for f in "$DIR"/*.txt; do
  [ -e "$f" ] || continue
  lock="$f.bezi"
  if [ -e "$lock" ]; then
    age=$(( now - $(stat -f %m "$lock") ))
    [ "$age" -lt 900 ] && continue      # okno právě běží
  fi
  when=$(head -1 "$f" | tr -d '\r')
  t=$(date -j -f "%Y-%m-%d %H:%M" "$when" +%s 2>/dev/null) || continue
  [ "$now" -ge "$t" ] || continue
  touch "$lock"
  (
    title=$(sed -n 2p "$f" | tr -d '\r')
    note=$(tail -n +3 "$f")
    [ -z "$note" ] && note="$title"
    while true; do
      touch "$lock"
      afplay /System/Library/Sounds/Glass.aiff &
      B=$(osascript - "$title" "$note" <<'OSA' 2>/dev/null
on run argv
  set r to display dialog (item 2 of argv) with title ("⏰ " & (item 1 of argv)) buttons {"Za 10 min", "Hotovo"} default button "Hotovo" with icon caution giving up after 600
  return button returned of r
end run
OSA
)
      if [ "$B" = "Hotovo" ]; then
        mv "$f" "$DIR/hotovo/$(date +%Y%m%d-%H%M)_$(basename "$f")"
        rm -f "$lock"
        exit 0
      fi
      if [ "$B" = "Za 10 min" ]; then touch "$lock"; sleep 600; fi
    done
  ) >/dev/null 2>&1 &
done
