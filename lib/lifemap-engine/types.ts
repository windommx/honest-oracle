export type LifemapElement = "fire" | "earth" | "air" | "water";

export type LifemapPlanet =
  | "Sun"
  | "Moon"
  | "Mercury"
  | "Venus"
  | "Mars"
  | "Jupiter"
  | "Saturn"
  | "Uranus"
  | "Neptune"
  | "Pluto";

export type LifemapTone = "good" | "warn" | "danger";

export type LifemapInput = {
  inputName: string;
  birthDate: Date;
  birthTime?: string | null;
  birthPlace?: string | null;
  profileKey?: string | null;
};

export type LifemapTimelineItem = {
  age: number;
  score: number;
  tone: LifemapTone;
  title: string;
  body: string;
};

export type LifemapResult = {
  version: string;
  seed: string;
  summary: {
    overallScore: number;
    tone: LifemapTone;
    headline: string;
    note: string;
  };
  elements: Record<LifemapElement, number>;
  planets: Array<{
    planet: LifemapPlanet;
    sign: string;
    degree: number;
    house: number;
  }>;
  houses: Array<{
    house: number;
    title: string;
    score: number;
    keywords: string[];
  }>;
  timeline: LifemapTimelineItem[];
  graph: {
    min: number;
    max: number;
    points: number[];
  };
  personalizedReport: {
    signature: string;
    topics: Array<{
      key: "identity" | "career" | "relationship" | "critical_events";
      title: string;
      lines: string[];
    }>;
    actionPlan: {
      title: string;
      lines: string[];
    };
  };
};
