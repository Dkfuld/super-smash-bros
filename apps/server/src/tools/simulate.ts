/**
 * Full AI simulation mode: runs a complete 12-bot match headlessly (much
 * faster than realtime) and prints the event feed + final draft order.
 *
 *   npm run simulate --workspace apps/server           # random seed
 *   npm run simulate --workspace apps/server -- 1234   # fixed seed
 */
import { DEFAULT_SETTINGS, defaultCharacter, type ParticipantSlot } from "@ddd/shared";
import { Match } from "@ddd/shared";

const seed = Number(process.argv[2] ?? Math.floor(Math.random() * 1e9));
const FUNNY_NAMES = [
  "Captain Autodraft", "Waiver Wire Wanda", "Sleeper Pick Sam", "Mock Draft Mike",
  "Trade Machine Tina", "Bye Week Bob", "Handcuff Hank", "Vulture TD Vince",
  "Garbage Time Gary", "Injury Report Irene", "Boom Bust Barry", "Kicker First Kevin",
];

const participants: ParticipantSlot[] = FUNNY_NAMES.map((name, i) => ({
  slotIndex: i,
  id: `p${i}`,
  name,
  status: "ai",
  connStatus: "connected",
  ready: true,
  isPreviousLoser: i === 11,
  character: defaultCharacter(i),
}));

console.log(`\n🏟️  THE FANTASY DRAFT DISASTER DOME — full AI simulation (seed ${seed})\n`);

const match = new Match({
  matchId: `sim_${seed}`,
  roomCode: "SIMSIM",
  leagueName: "Simulation League",
  participants,
  settings: { ...DEFAULT_SETTINGS, matchDurationTargetSec: 240, suddenDeathAtSec: 300, chaosLevel: 2 },
  arenaId: "disaster_dome",
  seed,
  hatPlayerId: "p11",
  onEnd: () => {},
});

const t0 = performance.now();
let ticks = 0;
while (!match.results && ticks < 30 * 60 * 15) {
  match.tick();
  ticks++;
  for (const e of match.drainEvents()) {
    const time = `[${(ticks / 30).toFixed(1).padStart(6)}s]`;
    if (e.e === "announce") console.log(`${time} 🎙️  ${e.line}`);
    else if (e.e === "elimination")
      console.log(`${time} ❌ ${e.record.playerName} eliminated (${e.record.cause}${e.record.byPlayerId ? ` by ${participants.find((p) => p.id === e.record.byPlayerId)?.name}` : ""})`);
    else if (e.e === "yippee") console.log(`${time} 🌈 "${"Yippee!"}" (${e.variant} — ${e.reason})`);
    else if (e.e === "victory") console.log(`${time} 🏆 ${e.playerName} WINS FIRST PICK`);
    else if (e.e === "zoneStage") console.log(`${time} ⚠️  AUTO-DRAFT zone stage ${e.stage} → radius ${e.radius.toFixed(1)}`);
  }
}
const wall = ((performance.now() - t0) / 1000).toFixed(2);

if (!match.results) {
  console.error("\nMatch did not finish within the simulation cap.");
  process.exit(1);
}

console.log(`\n📋 OFFICIAL DRAFT ORDER (${ticks} ticks = ${(ticks / 30 / 60).toFixed(1)} sim-minutes, computed in ${wall}s):\n`);
for (const p of match.results.draftOrder) {
  console.log(`   Pick ${String(p.pick).padStart(2)}: ${p.playerName}${p.playerId === "p11" ? "  🌈" : ""}`);
}
console.log("\n🏅 AWARDS:");
for (const a of match.results.awards) console.log(`   ${a.title} — ${a.playerName} (${a.description})`);
console.log();
