import type { Rng } from "@ddd/shared";

/**
 * Original comedic announcer. Lines are generated server-side so every client,
 * spectator, and the audit log see identical commentary.
 * [P] = player, [T] = target/other player, [W] = weapon name.
 */
const LINES: Record<string, string[]> = {
  matchStart: [
    "Welcome to the Disaster Dome, where friendships come to be waived!",
    "Twelve managers enter. One leaves with the first pick. The rest leave with excuses!",
    "Remember folks: this is legally binding. Probably!",
  ],
  firstPickup: [
    "[P] grabs the first weapon! Someone actually read the rules!",
    "First hardware of the night goes to [P]!",
  ],
  firstBlood: [
    "[T] is the FIRST ONE OUT! Enjoy pick twelve, champ!",
    "And [T] opens the exit door! That's a season-long 'told you so'!",
  ],
  elimination: [
    "[T] has been ELIMINATED by [P]!",
    "[P] just sent [T] to the waiver wire!",
    "[T] is out! [P] adds that to the highlight reel!",
    "Say goodnight, [T]! [P] says hello to a better pick!",
  ],
  environmentalElim: [
    "[T] was eliminated by the ARENA ITSELF! The Dome is undefeated!",
    "The building has claimed [T]! Facilities management sends its regards!",
  ],
  revenge: ["REVENGE! [P] pays [T] back with interest!"],
  legendary: [
    "[P] found a LEGENDARY [W]! Everyone panic accordingly!",
    "A LEGENDARY [W] is in play, and [P] has it. Update your group chat!",
  ],
  quiet: [
    "It's suspiciously quiet out there. Somebody's hiding behind the nacho station.",
    "Folks, we've gone a full minute without violence. This league has no heart.",
  ],
  hatPlayer: [
    "There goes [P], hat spinning, dignity pending!",
    "You can see [P] from SPACE with that hat!",
  ],
  finalFive: ["FIVE remain! The math is getting personal!"],
  finalThree: ["THREE left! Group chat is already fighting!"],
  finalTwo: ["IT'S DOWN TO [P] AND [T]! FIRST PICK ON THE LINE!"],
  suddenDeath: ["SUDDEN DEATH! The Dome is done waiting!"],
  victory: [
    "[P] WINS THE FIRST PICK! Autographs available never!",
    "[P] SURVIVES THE DISASTER DOME! Commissioner, notarize it!",
  ],
  zoneShrink: [
    "AUTO-DRAFT MODE is spreading! Get inside the safe zone or the algorithm picks for you!",
    "The Dome is shrinking! Personal space is officially cancelled!",
  ],
  hostHype: ["The commissioner demands ENTHUSIASM! Let's GO!"],
  hostRoast: ["A message from the commissioner: you are ALL underperforming!"],
  hostStats: ["Stat update: chaos levels remain statistically ridiculous!"],
  introLoser: [
    "Returning from the deepest basement of last season's standings, the reigning champion of losing: [P]!",
  ],
};

export function announcerLine(rng: Rng, key: string, p?: string, t?: string, w?: string): string {
  const options = LINES[key] ?? ["..."];
  let line = options[Math.floor(rng.next() * options.length)] ?? "...";
  if (p) line = line.replaceAll("[P]", p);
  if (t) line = line.replaceAll("[T]", t);
  if (w) line = line.replaceAll("[W]", w);
  return line;
}

export const YIPPEE_VARIANTS = [
  "excited",
  "nervous",
  "exhausted",
  "overconfident",
  "whispered",
  "dramatic",
  "robotic",
  "echoing",
] as const;
