"use client";

import { useRef } from "react";
import { FileMusic, Wand2, X } from "lucide-react";
import { THIRD_OCTAVE_HZ, type SpectralBalance, balanceDelta } from "@/lib/master-engine/spectrum";
import { GOLD, GROUP_COLOR, TEXT_FAINT } from "./_tokens";
import { ACCEPTED_FILES } from "./_loader";

// ╔══════════════════════════════════════════════════════════════════╗
// ║  REFERENCE — the comparison an engineer actually makes.           ║
// ║                                                                    ║
// ║  Nobody masters by listening to their own track in isolation.      ║
// ║  They put a record they trust next to it and ask whether their     ║
// ║  bottom end is heavier, their top duller. That question has a      ║
// ║  measurable answer, and this draws it: the third-octave difference ║
// ║  between the two, band by band, with the bands that are too quiet  ║
// ║  to compare left visibly blank rather than drawn as zero.          ║
// ║                                                                    ║
// ║  The button below it fits the EQ's OWN five bands to that          ║
// ║  difference, at half strength by default, and reports what it      ║
// ║  could not reach. It is a starting point the operator can see and  ║
// ║  edit, not a black box that "matches".                             ║
// ╚══════════════════════════════════════════════════════════════════╝

const BAR_RANGE_DB = 9;

export interface ReferencePanelProps {
  /** The current master's balance, or null before it has been measured. */
  subject: SpectralBalance | null;
  reference: { name: string; balance: SpectralBalance } | null;
  distanceDb: number;
  matchNote: string | null;
  /** True when the master has changed since the balance was measured. */
  stale: boolean;
  busy: boolean;
  onLoad: (file: File) => void;
  onClear: () => void;
  onApply: () => void;
  strength: number;
  onStrengthChange: (v: number) => void;
}

export function ReferencePanel({
  subject,
  reference,
  distanceDb,
  matchNote,
  stale,
  busy,
  onLoad,
  onClear,
  onApply,
  strength,
  onStrengthChange,
}: ReferencePanelProps) {
  const input = useRef<HTMLInputElement | null>(null);
  const delta = subject && reference ? balanceDelta(subject, reference.balance) : null;

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-white/5">
        <h2 className="text-[0.62rem] tracking-widest uppercase" style={{ color: GROUP_COLOR.tone }}>
          Reference · เทียบกับเพลงที่เชื่อถือได้
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={input}
            type="file"
            accept={ACCEPTED_FILES}
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onLoad(file);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => input.current?.click()}
            disabled={busy}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 text-xs text-gray-300 hover:border-gold/40 transition disabled:opacity-40"
          >
            <FileMusic className="w-3.5 h-3.5" aria-hidden />
            {busy ? "กำลังวิเคราะห์…" : reference ? "เปลี่ยนไฟล์อ้างอิง" : "โหลดไฟล์อ้างอิง"}
          </button>
          {reference && (
            <button
              type="button"
              onClick={onClear}
              aria-label="เอาไฟล์อ้างอิงออก"
              className="p-1.5 rounded-lg border border-white/10 text-gray-400 hover:border-gold/40 transition"
            >
              <X className="w-3.5 h-3.5" aria-hidden />
            </button>
          )}
        </div>
      </div>

      {!reference && (
        <p className="mt-3 text-[0.7rem] leading-relaxed" style={{ color: TEXT_FAINT }}>
          โหลดเพลงที่อยากให้มาสเตอร์นี้ฟังใกล้เคียง แล้วจะเห็นส่วนต่างของสมดุลเสียงเป็นย่าน ๆ
          — วัดจากพลังงานในแต่ละ third-octave เทียบกับระดับรวมของแต่ละเพลง ความดังจึงไม่มีผล
        </p>
      )}

      {reference && !subject && (
        <p className="mt-3 text-[0.7rem]" style={{ color: TEXT_FAINT }}>
          โหลด {reference.name} แล้ว — กด &ldquo;ตรวจ&rdquo; เพื่อวัดมาสเตอร์ปัจจุบันก่อนจึงจะเทียบได้
        </p>
      )}

      {delta && reference && (
        <>
          <div className="mt-3 flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-[0.7rem]" style={{ color: TEXT_FAINT }}>
              {reference.name} · {reference.balance.seconds.toFixed(0)} วินาที
            </span>
            <span className="text-[0.7rem] tabular-nums" style={{ color: stale ? TEXT_FAINT : GOLD }}>
              ต่างกัน {distanceDb.toFixed(1)} dB (RMS)
              {stale ? " — วัดก่อนแก้ค่าล่าสุด" : ""}
            </span>
          </div>

          {/* One bar per band. Above the line means the reference has MORE
              there than this master does. */}
          <div
            className="mt-2 flex items-stretch gap-px h-24 overflow-x-auto"
            role="img"
            aria-label={`ส่วนต่างสมดุลเสียงเทียบกับ ${reference.name}: ${delta
              .filter((d) => d.usable && Math.abs(d.db) > 1)
              .map((d) => `${d.hz} เฮิรตซ์ ${d.db > 0 ? "ขาด" : "เกิน"} ${Math.abs(d.db).toFixed(1)} เดซิเบล`)
              .join(", ") || "ไม่ต่างเกินหนึ่งเดซิเบลในย่านใดเลย"}`}
          >
            {delta.map((d) => {
              const clamped = Math.max(-BAR_RANGE_DB, Math.min(BAR_RANGE_DB, d.db));
              const half = 50;
              const size = (Math.abs(clamped) / BAR_RANGE_DB) * half;
              return (
                <div
                  key={d.hz}
                  className="flex-1 min-w-[7px] relative"
                  title={
                    d.usable
                      ? `${d.hz} Hz: ${d.db > 0 ? "+" : ""}${d.db.toFixed(1)} dB`
                      : `${d.hz} Hz: เงียบเกินกว่าจะเทียบได้`
                  }
                >
                  <div className="absolute left-0 right-0 top-1/2 h-px bg-white/15" />
                  {d.usable ? (
                    <div
                      className="absolute left-0 right-0 rounded-sm"
                      style={{
                        height: `${Math.max(1, size)}%`,
                        [d.db > 0 ? "bottom" : "top"]: "50%",
                        backgroundColor: d.db > 0 ? GROUP_COLOR.tone : GROUP_COLOR.stereo,
                      }}
                    />
                  ) : (
                    // Deliberately blank, not zero: "too quiet to compare" and
                    // "identical" are different answers.
                    <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-1 bg-white/5" />
                  )}
                </div>
              );
            })}
          </div>
          <div className="flex justify-between mt-1 text-[0.55rem] tabular-nums" style={{ color: TEXT_FAINT }}>
            {[20, 100, 500, 2000, 8000, 20000].map((hz) => (
              <span key={hz}>{hz >= 1000 ? `${hz / 1000}k` : hz}</span>
            ))}
          </div>
          <p className="mt-1 text-[0.6rem]" style={{ color: TEXT_FAINT }}>
            แท่งขึ้น = อ้างอิงมีมากกว่าตรงนั้น · แท่งลง = มาสเตอร์นี้มีมากกว่า · ช่องว่าง = เงียบเกินกว่าจะเทียบ
            ({THIRD_OCTAVE_HZ.length} ย่าน)
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-[0.7rem]" style={{ color: TEXT_FAINT }}>
              <span className="tabular-nums">ใส่ให้ {Math.round(strength * 100)}%</span>
              <input
                type="range"
                className="w-32"
                style={{ accentColor: GOLD }}
                min={0.1}
                max={1}
                step={0.05}
                value={strength}
                onChange={(e) => onStrengthChange(Number(e.target.value))}
                aria-label="สัดส่วนของส่วนต่างที่จะใส่ให้"
              />
            </label>
            <button
              type="button"
              onClick={onApply}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gold text-black text-xs font-semibold hover:bg-gold-light transition"
            >
              <Wand2 className="w-3.5 h-3.5" aria-hidden />
              ใส่ลง EQ ห้าแบนด์
            </button>
          </div>

          {stale && (
            <p className="mt-2 text-[0.68rem]" style={{ color: GROUP_COLOR.stereo }}>
              ค่าเปลี่ยนไปหลังการวัดครั้งล่าสุด — กด &ldquo;ตรวจ&rdquo; อีกครั้งเพื่อดูส่วนต่างที่เป็นจริงตอนนี้
            </p>
          )}

          {matchNote && (
            <p className="mt-2 text-[0.68rem] leading-relaxed" style={{ color: TEXT_FAINT }}>
              {matchNote}
            </p>
          )}

          <p className="mt-2 text-[0.65rem] leading-relaxed" style={{ color: TEXT_FAINT }}>
            ปุ่มนี้ปรับเฉพาะเกนของห้าแบนด์ที่เห็นอยู่ ไม่ได้สร้างเส้นโค้งลับที่แก้ไม่ได้ —
            ความถี่และ Q ที่ตั้งไว้ยังอยู่เหมือนเดิม และค่าที่ได้แก้ต่อด้วยมือได้ทุกตัว
          </p>
        </>
      )}
    </section>
  );
}
