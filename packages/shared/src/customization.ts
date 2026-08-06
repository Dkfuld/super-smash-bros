/** Character customization catalogs. Visual details are resolved client-side by id. */

export interface ColorDef {
  id: string;
  name: string;
  primary: string; // jersey
  secondary: string; // trim/shorts
  /** Colorblind-safe secondary identifier shape shown on the nameplate + jersey. */
  icon: "circle" | "square" | "triangle" | "diamond" | "star" | "hex" | "bolt" | "heart" | "moon" | "cross" | "wave" | "ring";
}

export const COLORS: ColorDef[] = [
  { id: "crimson", name: "Crimson Crunch", primary: "#e23d3d", secondary: "#8f1f1f", icon: "circle" },
  { id: "royal", name: "Royal Regret", primary: "#3d6de2", secondary: "#20408f", icon: "square" },
  { id: "slime", name: "Slime Time", primary: "#4ed24e", secondary: "#2a8f2a", icon: "triangle" },
  { id: "goldrush", name: "Gold Rush", primary: "#e8b23a", secondary: "#a37a1d", icon: "diamond" },
  { id: "grape", name: "Grape Expectations", primary: "#9b4fe0", secondary: "#5f2a94", icon: "star" },
  { id: "tang", name: "Tangerine Scream", primary: "#f07f2d", secondary: "#a85312", icon: "hex" },
  { id: "ice", name: "Ice Cold Takes", primary: "#54c8e8", secondary: "#2a86a3", icon: "bolt" },
  { id: "bubble", name: "Bubblegum Fury", primary: "#ef6fb2", secondary: "#b03a7c", icon: "heart" },
  { id: "midnight", name: "Midnight Waiver", primary: "#3b3f66", secondary: "#20223b", icon: "moon" },
  { id: "guac", name: "Extra Guac", primary: "#9aad3b", secondary: "#5f6e1f", icon: "cross" },
  { id: "teal", name: "Teal Deal", primary: "#31b39a", secondary: "#1c7263", icon: "wave" },
  { id: "smoke", name: "Smoke Screen", primary: "#8d939e", secondary: "#565b63", icon: "ring" },
];

export interface BodyDef {
  id: string;
  name: string;
  headScale: number;
  bellyScale: number;
  limbLength: number; // 1 = normal-ish, <1 comically short
  width: number;
}

export const BODIES: BodyDef[] = [
  { id: "classic", name: "The Commissioner Special", headScale: 1.35, bellyScale: 1.0, limbLength: 0.85, width: 1.0 },
  { id: "chonk", name: "Couch GM", headScale: 1.25, bellyScale: 1.35, limbLength: 0.75, width: 1.2 },
  { id: "beanpole", name: "Waiver Wire Wiry", headScale: 1.5, bellyScale: 0.8, limbLength: 1.05, width: 0.8 },
  { id: "brick", name: "The Brick House", headScale: 1.15, bellyScale: 1.1, limbLength: 0.7, width: 1.35 },
  { id: "smol", name: "Sleeper Pick", headScale: 1.7, bellyScale: 0.9, limbLength: 0.6, width: 0.9 },
];

export interface FaceDef {
  id: string;
  name: string;
}
/** Face art is drawn procedurally on a DynamicTexture by id. */
export const FACES: FaceDef[] = [
  { id: "gamer", name: "Locked In" },
  { id: "smug", name: "Already Won" },
  { id: "panic", name: "Draft Panic" },
  { id: "sleepy", name: "Auto-Drafted" },
  { id: "rage", name: "League Complaint" },
  { id: "grin", name: "Trade Shark" },
  { id: "shades", name: "Incognito" },
  { id: "mustache", name: "The Analyst" },
];

export interface HairDef {
  id: string;
  name: string;
}
export const HAIRS: HairDef[] = [
  { id: "cap", name: "Backwards Cap" },
  { id: "spikes", name: "Gel Overload" },
  { id: "fro", name: "The Cloud" },
  { id: "bald", name: "Aerodynamic" },
  { id: "visor", name: "Coach Mode" },
  { id: "bedhead", name: "Woke Up For The Draft" },
];

export interface AccessoryDef {
  id: string;
  name: string;
}
export const ACCESSORIES: AccessoryDef[] = [
  { id: "none", name: "Nothing (Bold)" },
  { id: "headband", name: "Tryhard Headband" },
  { id: "cape", name: "Towel Cape" },
  { id: "glasses", name: "Film-Room Glasses" },
  { id: "medal", name: "Participation Medal" },
  { id: "foamfinger", name: "Mini Foam Finger" },
];

export function defaultCharacter(slotIndex: number) {
  return {
    bodyId: BODIES[slotIndex % BODIES.length]!.id,
    colorId: COLORS[slotIndex % COLORS.length]!.id,
    faceId: FACES[slotIndex % FACES.length]!.id,
    hairId: HAIRS[slotIndex % HAIRS.length]!.id,
    accessoryId: ACCESSORIES[slotIndex % ACCESSORIES.length]!.id,
  };
}
