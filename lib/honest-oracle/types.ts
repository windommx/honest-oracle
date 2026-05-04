export type OracleElement = "fire" | "earth" | "air" | "water";

export type OraclePlanet =
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

export type OracleTone = "good" | "warn" | "danger";

export type OracleInput = {
  inputName: string;
  birthDate: Date;
  birthTime?: string | null;
  birthPlace?: string | null;
  profileKey?: string | null;
};

export type OracleTimelineItem = {
  age: number;
  score: number;
  tone: OracleTone;
  title: string;
  body: string;
};

export type OracleResult = {
  version: string;
  seed: string;
  summary: {
    overallScore: number;
    tone: OracleTone;
    headline: string;
    note: string;
  };
  elements: Record<OracleElement, number>;
  planets: Array<{
    planet: OraclePlanet;
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
  timeline: OracleTimelineItem[];
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
