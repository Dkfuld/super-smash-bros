import { useEffect, useRef, useState } from "react";
import { audio } from "../audio/audio";
import type { GameWorld } from "../game/world";

interface Card {
  at: number; // seconds from intro start
  h1: string;
  h2?: string;
  speak?: string;
  mood?: "roast";
}

/**
 * Pre-kickoff hype show. Pure presentation: the sim does not tick until
 * onDone fires, so the intro never affects the (deterministic) match.
 */
export function IntroOverlay({
  league,
  loserName,
  loserId,
  getWorld,
  onDone,
}: {
  league: string;
  loserName: string;
  loserId: string | null;
  /** Live getter — the GameWorld mounts after this overlay's first render. */
  getWorld: () => GameWorld | null;
  onDone: () => void;
}): JSX.Element {
  const [card, setCard] = useState<Card | null>(null);
  const done = useRef(false);

  useEffect(() => {
    const cards: Card[] = [
      {
        at: 0.4,
        h1: "🏟 WELCOME TO THE SMASH DOME",
        h2: `${league} · The Annual Draft Order Battle`,
        speak: "Ladies and gentlemen... welcome to the Smash Dome! Twelve managers enter. Only one picks first.",
      },
      {
        at: 4.0,
        h1: "MAY THE ODDS BE FOREVER IN YOUR FAVOR",
        h2: "(they will not be)",
        speak: "May the odds be forever in your favor. Statistically speaking... they will not be.",
      },
      ...(loserName
        ? [
            {
              at: 7.6,
              h1: "🧌 THE WALK OF SHAME",
              h2: `${loserName} — LAST PLACE — POINT AT YOUR PHONE AND LAUGH`,
              speak: `And now, trudging out of the tunnel in the dunce cap they earned... last season's biggest disappointment: ${loserName}! Look at them. LOOK AT THEM.`,
              mood: "roast" as const,
            },
            {
              at: 12.8,
              h1: "🐢 STILL WALKING…",
              h2: "SHAME HAS NO HURRY",
              speak: `Still walking. Take your time, ${loserName}. The shame walks with you.`,
              mood: "roast" as const,
            },
          ]
        : []),
      {
        at: loserName ? 17.4 : 7.6,
        h1: "IT'S DRAFT NIGHT",
        h2: "KICKOFF!",
        speak: "Enough talk. It's draft night. KICKOFF!",
      },
    ];
    const timers: number[] = [];
    for (const c of cards) {
      timers.push(
        window.setTimeout(() => {
          setCard(c);
          if (c.speak) audio.speak(c.speak, "announcer", "excited");
          if (c.h1.includes("WALK OF SHAME") && loserName) {
            const w = getWorld();
            if (loserId) w?.startLoserEntrance(loserId, 9.2);
            w?.startIntroFlyby(`${loserName} FINISHED DEAD LAST`, 8.4);
          }
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
        <div key={card.h1} className={`intro-card ${card.mood === "roast" ? "roast" : ""}`}>
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
