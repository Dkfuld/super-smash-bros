# Commissioner's guide (host)

You need: a laptop/tablet (best) or phone, and 12 league members with phones on
the same internet. A TV/beamer showing the spectator view makes it an event.

## Before the match

1. Open the app → **Host a Draft Night**.
2. Enter your league name and the 12 participant names (one per line) →
   **Create the Dome**.
3. Share the room: read out the 6-letter code, copy the join link, or let
   people scan the QR code.
4. As people join and claim their identity you'll see slots flip to *joined* /
   *ready*. Rename anyone by clicking their name. Unclaim a device with ⏏.
5. Tap **🌈** next to whoever finished last in your league last season. This is
   mandatory league law: they wear the Rainbow Fan-Spin Hat and say Yippee.
6. Missing people? **🤖 Fill empty with AI** (or per-slot 🤖).
7. Optional: **⚙️ Match settings** — match length, weapon drop rate & rarity,
   hazard frequency, chaos level, zone speed, health, knockback, power-ups,
   AI difficulty, Yippee frequency, sudden-death timing, spectator delay, and
   **Make Last Place Suffer** (the hat gets louder, sparklier, and slightly
   increases knockback taken — mild; they can still win).
8. **🔒 Lock claims** once everyone's in, **✅ Ready check** to clear ready
   flags and make everyone confirm, **🔊 Test sound**, then **🚀 START**.

## During the match

Your main area becomes the live spectator view (Director / Follow / Overhead /
Arena cameras). Side panel:

- **🌈 YIPPEE!** — force the hat wearer to say it. Use responsibly. Or don't.
- **🎙 Hype / 🔥 Roast / 📊 Stats** — trigger announcer commentary.
- **⏸ Pause / ▶ Resume**, **⏭ Skip intro**, **🔄 Restart**, **🛑 Cancel**.
- Live connection status per player; a dropped player is AI-controlled after
  20 s and hands back control the moment they reconnect.

## After the match

The results screen shows the official draft order (winner = pick 1, first out
= pick 12), full stats and comedy awards. Export via: copy as text, CSV, JSON,
polished PNG results card, or a shareable results link (works after the party —
results are saved server-side; `GET /api/matches` lists history).

**The order is final.** Same-tick eliminations are resolved by documented,
deterministic rules (networking.md) and the full event log is stored — when
someone disputes pick 12, the receipts exist.
