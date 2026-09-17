// ╔══════════════════════════════════════════════════════════════════╗
// ║  AUDIT — the face, and what it is allowed to mean.                ║
// ║                                                                    ║
// ║  The reference this product is modelled on shows a smiley in the   ║
// ║  corner. A face is a score, and a score with nothing behind it is  ║
// ║  the exact thing CONTRIBUTING.md forbids: a number that looks like ║
// ║  a judgement and is a decoration.                                  ║
// ║                                                                    ║
// ║  So this one is not a rating of whether the master is GOOD. That   ║
// ║  is not measurable and pretending otherwise would be a lie in the  ║
// ║  most confident possible format. It is a list of specific,         ║
// ║  checkable FAULTS — each with the number that triggered it, the    ║
// ║  threshold it crossed, and which control fixes it — and the face   ║
// ║  reflects the worst one found. No findings means "nothing here     ║
// ║  tripped a check", which is what the tooltip says, rather than     ║
// ║  "this is a good master".                                          ║
// ╚══════════════════════════════════════════════════════════════════╝

import { correlation } from "./stereo";
import { integratedLufs } from "./loudness";
import { truePeak } from "./limiter";
import { dcOffset } from "@/lib/synth-engine/analysis";
import { gainToDb } from "./types";

export type AuditSeverity = "ok" | "caution" | "problem";

export interface AuditFinding {
  id: string;
  severity: Exclude<AuditSeverity, "ok">;
  /** What was found, in one line. */
  title: string;
  /** The measurement, formatted, so the claim can be checked. */
  measured: string;
  /** What to do about it, naming a real control on this page. */
  fix: string;
}

export interface AuditResult {
  severity: AuditSeverity;
  findings: AuditFinding[];
  /** Everything measured, whether or not it tripped a check. */
  measurements: {
    integratedLufs: number;
    truePeakDb: number;
    samplePeakDb: number;
    correlation: number;
    dcOffset: number;
  };
}

/** Above this a converter or a lossy encoder can clip on playback. */
export const TRUE_PEAK_LIMIT_DB = -0.1;
/** Below this the track will be turned UP by a platform, revealing noise. */
export const QUIET_MARGIN_LU = 4;
/** Above this a platform turns the track DOWN, so the extra limiting is
 *  heard without the loudness it was traded for. */
export const LOUD_MARGIN_LU = 1;
/** Below this the stereo image will partly disappear in mono. */
export const CORRELATION_FLOOR = 0;
export const DC_LIMIT = 0.002;

export interface AuditOptions {
  /** The delivery loudness to compare against, in LUFS. */
  targetLufs: number;
}

/**
 * Check a finished master. Runs on the exported buffer, not on the settings —
 * what matters is what came out.
 */
export function auditMaster(
  channels: Float32Array[],
  sampleRate: number,
  options: AuditOptions
): AuditResult {
  const left = channels[0] ?? new Float32Array(0);
  const right = channels[1] ?? left;

  const lufs = integratedLufs(channels, sampleRate);
  const tp = truePeak(channels);
  const truePeakDb = gainToDb(tp);
  let samplePeak = 0;
  for (const ch of channels) for (let i = 0; i < ch.length; i++) {
    const a = Math.abs(ch[i]);
    if (a > samplePeak) samplePeak = a;
  }
  const corr = correlation(left, right);
  const dc = Math.max(...channels.map((ch) => Math.abs(dcOffset(ch))));

  const findings: AuditFinding[] = [];

  if (truePeakDb > TRUE_PEAK_LIMIT_DB) {
    findings.push({
      id: "true-peak",
      severity: "problem",
      title: "ยอดคลื่นจริงเกินเพดาน",
      measured: `${truePeakDb.toFixed(2)} dBTP (เพดานปลอดภัย ${TRUE_PEAK_LIMIT_DB} dBTP)`,
      // Deliberately specific: the limiter here guarantees SAMPLE peak, and
      // says so. Inter-sample peaks need headroom, not a promise.
      fix: "ลด Ceiling ลงอีก — ลิมิเตอร์รับประกันยอดต่อแซมเปิล ไม่ใช่ยอดระหว่างแซมเปิล",
    });
  }

  if (Number.isFinite(lufs)) {
    const over = lufs - options.targetLufs;
    if (over > LOUD_MARGIN_LU) {
      findings.push({
        id: "too-loud",
        severity: "caution",
        title: "ดังเกินเป้าหมาย — แพลตฟอร์มจะหรี่ลงอยู่ดี",
        measured: `${lufs.toFixed(1)} LUFS (เป้า ${options.targetLufs} LUFS, เกิน ${over.toFixed(1)} LU)`,
        fix: "ลด Master Vol ลง — การบีบเพิ่มไม่ได้ทำให้ดังขึ้นหลังถูกปรับระดับ",
      });
    } else if (over < -QUIET_MARGIN_LU) {
      findings.push({
        id: "too-quiet",
        severity: "caution",
        title: "เบากว่าเป้าหมายมาก",
        measured: `${lufs.toFixed(1)} LUFS (เป้า ${options.targetLufs} LUFS)`,
        fix: "เพิ่ม Master Vol — ยังมีที่ว่างก่อนถึงเพดาน",
      });
    }
  } else {
    findings.push({
      id: "silent",
      severity: "problem",
      title: "วัดความดังไม่ได้ — ไฟล์เงียบหรือสั้นเกินไป",
      measured: "ไม่มีบล็อก 400 ms ที่ดังพอจะนับ",
      fix: "ตรวจว่าโหลดไฟล์ถูกตัวและมีเสียงจริง",
    });
  }

  if (corr < CORRELATION_FLOOR) {
    findings.push({
      id: "phase",
      severity: "problem",
      title: "สองแชนเนลหักล้างกัน — เปิดแบบโมโนแล้วเสียงจะหาย",
      measured: `correlation ${corr.toFixed(2)} (ต่ำกว่า ${CORRELATION_FLOOR} คือหักล้าง)`,
      fix: "ลด Width ลง หรือเพิ่ม Mono Low / Mono High",
    });
  }

  if (dc > DC_LIMIT) {
    findings.push({
      id: "dc",
      severity: "caution",
      title: "มีไฟตรงค้างอยู่ในสัญญาณ",
      measured: `DC ${dc.toFixed(4)} (เกิน ${DC_LIMIT})`,
      fix: "เปิด Low Cut — ไฟตรงกินเฮดรูมโดยไม่ได้ยินเป็นเสียง",
    });
  }

  const severity: AuditSeverity = findings.some((f) => f.severity === "problem")
    ? "problem"
    : findings.length > 0
      ? "caution"
      : "ok";

  return {
    severity,
    findings,
    measurements: {
      integratedLufs: lufs,
      truePeakDb,
      samplePeakDb: gainToDb(samplePeak),
      correlation: corr,
      dcOffset: dc,
    },
  };
}

/** What the face means, spelled out — used as its tooltip and its label, so
 *  the claim is never stronger in the picture than it is in words. */
export const AUDIT_MEANING: Record<AuditSeverity, string> = {
  ok: "ไม่มีข้อไหนที่ตรวจแล้วติด — ไม่ได้แปลว่ามาสเตอร์นี้ดี แปลว่าไม่เจอปัญหาที่วัดได้",
  caution: "เจอเรื่องที่ควรดู แต่ไฟล์ยังส่งได้",
  problem: "เจอปัญหาที่จะได้ยินจริงตอนเอาไปเปิดที่อื่น",
};
