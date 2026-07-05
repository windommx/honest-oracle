import { describe, it, expect } from "vitest";
import { sensoryDensity } from "./sensory";

describe("sensoryDensity (English)", () => {
  it("counts sensory words per sense with real densities", () => {
    const text = "The bright light gleamed. A loud crash echoed. The sweet, bitter taste lingered as the cold, rough stone stung her hand.";
    const led = sensoryDensity(text, "en");
    const sight = led.senses.find((s) => s.sense === "sight")!;
    const sound = led.senses.find((s) => s.sense === "sound")!;
    const taste = led.senses.find((s) => s.sense === "taste")!;
    const touch = led.senses.find((s) => s.sense === "touch")!;
    expect(sight.count).toBeGreaterThanOrEqual(2); // light, bright, gleam
    expect(sound.count).toBeGreaterThanOrEqual(2); // loud, crash, echo
    expect(taste.count).toBeGreaterThanOrEqual(2); // sweet, bitter, taste
    expect(touch.count).toBeGreaterThanOrEqual(2); // cold, rough, sting
    expect(led.total).toBe(led.senses.reduce((s, x) => s + x.count, 0));
    expect(led.per1k).toBeGreaterThan(0);
  });

  it("reports a sense the writer never used as unused (a fact, not a verdict)", () => {
    const led = sensoryDensity("The bright light gleamed and a loud crash echoed.", "en");
    expect(led.unused).toContain("smell");
    expect(led.unused).toContain("taste");
    expect(led.senses.find((s) => s.sense === "smell")!.count).toBe(0);
  });

  it("does not match sensory words inside unrelated words (token-exact)", () => {
    // "lighthouse" / "warmth" should NOT count as light / warm (exact token match)
    const led = sensoryDensity("A lighthouse stood there. Warmth is a noun.", "en");
    const sight = led.senses.find((s) => s.sense === "sight")!;
    expect(sight.samples.some((w) => w.word === "light")).toBe(false);
  });

  it("keeps senses in fixed order", () => {
    const led = sensoryDensity("nothing here", "en");
    expect(led.senses.map((s) => s.sense)).toEqual(["sight", "sound", "smell", "taste", "touch"]);
  });
});

describe("sensoryDensity (Thai)", () => {
  it("counts Thai sensory words (bounded by segmentation)", () => {
    const led = sensoryDensity("แสงสว่างจ้า เสียงดังก้อง กลิ่นหอมอบอวล รสหวาน สัมผัสเย็นนุ่ม", "th");
    expect(led.words).toBeGreaterThan(0);
    expect(led.total).toBeGreaterThan(0);
    expect(led.senses.map((s) => s.sense)).toEqual(["sight", "sound", "smell", "taste", "touch"]);
  });

  it("catches expanded Thai vocabulary in the right sense (recall regression)", () => {
    const led = sensoryDensity("ท้องฟ้า ทึบ มืด ฟ้าร้อง สนั่น ดัง รส เฝื่อน ขม หิน สาก เหนอะหนะ", "th");
    const by = (s: string) => led.senses.find((x) => x.sense === s)!;
    expect(by("sight").samples.some((w) => w.word === "ทึบ")).toBe(true);
    expect(by("sound").samples.some((w) => w.word === "สนั่น")).toBe(true);
    expect(by("taste").samples.some((w) => w.word === "เฝื่อน")).toBe(true);
    expect(by("touch").samples.some((w) => w.word === "สาก")).toBe(true);
  });
});
