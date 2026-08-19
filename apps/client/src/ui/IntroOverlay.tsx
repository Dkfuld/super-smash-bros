import { useEffect, useRef, useState } from "react";
import { audio } from "../audio/audio";
import type { GameWorld } from "../game/world";

interface Card {
  at: number; // seconds from intro start
  h1: string;
  h2?: string;
  speak?: string;
  mood?: "roast";
  cue?: "walk" | "penance";
}

/** League-roast templates — crude, personal, and legally actionable in three states. */
const BANTER = [
  (n: string) => `${n} drafts with his heart. His heart is bad at football.`,
  (n: string) => `${n} has called it "a rebuilding year" five seasons straight.`,
  (n: string) => `${n} once benched his QB for "vibes." The vibes went 0 and 4.`,
  (n: string) => `${n}'s trade offers should legally require a warning label.`,
  (n: string) => `${n} does his draft research on the toilet. You can tell.`,
  (n: string) => `${n} autodrafted last year and STILL talked trash. Iconic behavior.`,
  (n: string) => `${n} treats the waiver wire like a dating app at 2am. Desperate.`,
  (n: string) => `${n} has a championship strategy. He keeps it hidden. Forever.`,
];

/**
 * Pre-kickoff hype show (~50s, skippable). Pure presentation: the sim does
 * not tick until onDone fires, so the intro never affects the match.
 */
export function IntroOverlay({
  league,
  names,
  loserName,
  loserId,
  getWorld,
  onDone,
}: {
  league: string;
  names: string[];
  loserName: string;
  loserId: string | null;
  /** Live getter — the GameWorld mounts after this overlay's first render. */
  getWorld: () => GameWorld | null;
  onDone: () => void;
}): JSX.Element {
  const [card, setCard] = useState<Card | null>(null);
  const done = useRef(false);

  useEffect(() => {
    // Two scouting-report victims per show, never the loser (they get theirs).
    const pool = names.filter((n) => n && n !== loserName);
    const victims: string[] = [];
    while (victims.length < 2 && pool.length > 0) {
      victims.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]!);
    }
    const roastOf = (n: string): string => BANTER[Math.floor(Math.random() * BANTER.length)]!(n);
    const banterCards: Card[] = victims.map((n, i) => {
      const line = roastOf(n);
      return { at: 13 + i * 5, h1: "🎤 SCOUTING REPORT", h2: line.toUpperCase(), speak: line, mood: "roast" };
    });

    const cards: Card[] = [
      {
        at: 0.8,
        h1: "🎆 WELCOME TO THE 2026 SMASH DOME SEASON",
        h2: `${league} · Draft Night · Live`,
        speak:
          "Goooood evening, and welcome to the 2026 Smash Dome season! Alright boys — best of luck on your season. You are absolutely going to need it.",
      },
      {
        at: 7.4,
        h1: "TONIGHT: THE DRAFT ORDER BATTLE",
        h2: "12 ENTER · 1 PICKS FIRST · 11 MAKE EXCUSES",
        speak: "Tonight, twelve so-called managers put their bodies and their dignity on the line for draft position. Most of you ran out of dignity in October.",
      },
      ...banterCards,
      {
        at: 23.5,
        h1: "MAY THE ODDS BE FOREVER IN YOUR FAVOR",
        h2: "(they will not be)",
        speak: "May the odds be forever in your favor. Statistically speaking... they will not be.",
      },
      ...(loserName
        ? [
            {
              at: 27.5,
              h1: "🧌 THE WALK OF SHAME",
              h2: `${loserName} — LAST PLACE — POINT AT YOUR PHONE AND LAUGH`,
              speak: `And now, trudging out of the tunnel in the dunce cap they earned... last season's biggest disappointment: ${loserName}! Look at them. LOOK AT THEM.`,
              mood: "roast" as const,
              cue: "walk" as const,
            },
            {
              at: 33,
              h1: "🐢 STILL WALKING…",
              h2: "SHAME HAS NO HURRY",
              speak: `Still walking. Take your time, ${loserName}. The shame walks with you.`,
              mood: "roast" as const,
            },
            {
              at: 37.5,
              h1: "💪 THE PENANCE",
              h2: "5 AIR SQUATS · 1 JUMP · 1 YIPPEE — LEAGUE LAW",
              speak: `League law demands penance: five air squats, one jump of delusional hope, and the word. Say the word, ${loserName}.`,
              mood: "roast" as const,
              cue: "penance" as const,
            },
          ]
        : []),
      {
        at: loserName ? 45 : 27.5,
        h1: "IT'S DRAFT NIGHT",
        h2: "KICKOFF!",
        speak: "Enough foreplay. It's draft night. KICKOFF!",
      },
    ];
    const timers: number[] = [];
    for (const c of cards) {
      timers.push(
        window.setTimeout(() => {
          setCard(c);
          if (c.speak) audio.speak(c.speak, "announcer", "excited");
          const w = getWorld();
          if (c.cue === "walk" && loserId) {
            w?.startLoserEntrance(loserId, 9.4);
            if (loserName) w?.startIntroFlyby(`${loserName} FINISHED DEAD LAST`, 8.6);
          }
          if (c.cue === "penance" && loserId) w?.startLoserPenance(loserId);
        }, c.at * 1000),
      );
    }
    const endAt = (cards[cards.length - 1]?.at ?? 8) + 1.6;
    timers.push(
      window.setTimeout(() => {
        if (!done.current) {
          done.current = true;
          onDone();
        }
      }, endAt * 1000),
    );
    return () => timers.forEach(clearTimeout);
    // Intro runs exactly once per match mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="intro-overlay">
      {card && (
        <div key={card.h1 + (card.h2 ?? "")} className={`intro-card ${card.mood === "roast" ? "roast" : ""}`}>
          <h1>{card.h1}</h1>
          {card.h2 && <h2>{card.h2}</h2>}
        </div>
      )}
      <button
        className="btn small secondary intro-skip"
        onClick={() => {
          if (!done.current) {
            done.current = true;
            audio.stopSpeech(); // cut queued roast lines mid-word
            onDone();
          }
        }}
      >
        Skip intro ⏭
      </button>
    </div>
  );
}
