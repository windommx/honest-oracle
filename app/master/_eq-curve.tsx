"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { eqSections, responseCurve, usesMidSide } from "@/lib/master-engine/eq";
import { MAX_Q, MIN_Q } from "@/lib/master-engine/biquad";
import type { EqBand, EqChannel, MasterSettings } from "@/lib/master-engine/types";
import { BG, GOLD, GOLD_BRIGHT, GROUP_COLOR, TEXT_FAINT } from "./_tokens";

// ╔══════════════════════════════════════════════════════════════════╗
// ║  EQ CURVE — the spectrum, the response, and five draggable nodes. ║
// ║                                                                    ║
// ║  The curve is not drawn from a bell-shape approximation. It comes  ║
// ║  from responseCurve() over the SAME coefficient list the audio is  ║
// ║  running through, so what is on screen is the filter. Tests in     ║
// ║  lib/master-engine sweep sine tones through the real chain and     ║
// ║  compare the measured dB against these numbers.                    ║
// ╚══════════════════════════════════════════════════════════════════╝

const MIN_HZ = 20;
const MAX_HZ = 20000;
const RANGE_DB = 15;
/** Named rather than written as -RANGE_DB at the call site: a unary negation
 *  inside a JSX aria attribute is not statically a number, and the a11y lint
 *  rule is right to say so. */
const MIN_GAIN_DB = -15;
const MIN_DB = -90;
const SPECTRUM_FLOOR_DB = -96;
const DPR_CAP = 2;

const GRID_HZ = [50, 100, 200, 500, 1000, 2000, 5000, 10000];

const CHANNEL_ORDER: EqChannel[] = ["both", "mid", "side"];
const CHANNEL_LABEL: Record<EqChannel, string> = { both: "ทั้งคู่", mid: "กลาง", side: "ข้าง" };
const CHANNEL_MARK: Record<EqChannel, string> = { both: "", mid: "M", side: "S" };

const cycleChannel = (c: EqChannel): EqChannel =>
  CHANNEL_ORDER[(CHANNEL_ORDER.indexOf(c) + 1) % CHANNEL_ORDER.length];
const GRID_DB = [-12, -6, 0, 6, 12];

const xOf = (hz: number, width: number) =>
  (Math.log(Math.min(MAX_HZ, Math.max(MIN_HZ, hz)) / MIN_HZ) / Math.log(MAX_HZ / MIN_HZ)) * width;
const hzOf = (x: number, width: number) => MIN_HZ * Math.pow(MAX_HZ / MIN_HZ, Math.min(1, Math.max(0, x / width)));
const yOf = (db: number, height: number) => height / 2 - (db / RANGE_DB) * (height / 2);
const dbOf = (y: number, height: number) => ((height / 2 - y) / (height / 2)) * RANGE_DB;

export interface EqCurveProps {
  settings: MasterSettings;
  sampleRate: number;
  onBandChange: (index: number, band: EqBand) => void;
  /** Live spectrum in dB per bin, or null when nothing is playing. */
  readSpectrum: () => Float32Array;
  active: boolean;
  height?: number;
}

export function EqCurve({
  settings,
  sampleRate,
  onBandChange,
  readSpectrum,
  active,
  height = 220,
}: EqCurveProps) {
  const wrapper = useRef<HTMLDivElement | null>(null);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const [width, setWidth] = useState(800);
  const [dragging, setDragging] = useState<number | null>(null);

  // Two curves when any band is mid- or side-only, because there is then no
  // single response — drawing one of them and calling it "the" curve would be
  // the same lie the whole page is built to avoid.
  const midSide = usesMidSide(settings);
  const curve = useMemo(
    () =>
      responseCurve(
        eqSections(settings, sampleRate, midSide ? "mid" : undefined),
        sampleRate,
        300,
        MIN_HZ,
        MAX_HZ
      ),
    [settings, sampleRate, midSide]
  );
  const sideCurve = useMemo(
    () =>
      midSide
        ? responseCurve(eqSections(settings, sampleRate, "side"), sampleRate, 300, MIN_HZ, MAX_HZ)
        : null,
    [settings, sampleRate, midSide]
  );

  useEffect(() => {
    const box = wrapper.current;
    if (!box) return;
    const measure = () => setWidth(box.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  // The spectrum is canvas because it repaints every frame; the curve and the
  // nodes are SVG because they need to be hit-tested and focusable.
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    let raf = 0;
    const dpr = Math.min(DPR_CAP, window.devicePixelRatio || 1);
    el.width = Math.max(1, Math.round(width * dpr));
    el.height = Math.round(height * dpr);
    el.style.width = `${width}px`;
    el.style.height = `${height}px`;
    const ctx = el.getContext("2d");
    if (!ctx) return;

    // Nothing playing means nothing to paint. The loop used to reschedule
    // itself unconditionally — clearing an empty canvas and asking for another
    // frame 60 times a second in the state the page spends most of its life
    // in, which keeps the tab from ever going idle.
    if (!active) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      return;
    }

    const paint = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      const bins = readSpectrum();
      if (bins.length > 0) {
        const nyquist = sampleRate / 2;
        ctx.beginPath();
        ctx.moveTo(0, height);
        for (let x = 0; x <= width; x++) {
          const hz = hzOf(x, width);
          const bin = Math.min(bins.length - 1, Math.round((hz / nyquist) * bins.length));
          const db = Math.max(SPECTRUM_FLOOR_DB, bins[bin]);
          const y = height - ((db - SPECTRUM_FLOOR_DB) / (0 - SPECTRUM_FLOOR_DB)) * height;
          ctx.lineTo(x, y);
        }
        ctx.lineTo(width, height);
        ctx.closePath();
        ctx.fillStyle = GOLD;
        ctx.globalAlpha = 0.14;
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      raf = requestAnimationFrame(paint);
    };
    paint();
    return () => cancelAnimationFrame(raf);
  }, [active, readSpectrum, sampleRate, width, height]);

  const drag = useCallback(
    (index: number, clientX: number, clientY: number) => {
      const box = wrapper.current;
      if (!box) return;
      const rect = box.getBoundingClientRect();
      const band = settings.eq[index];
      const next: EqBand = {
        ...band,
        freq: Math.round(hzOf(clientX - rect.left, rect.width)),
        gainDb: Number(Math.min(RANGE_DB, Math.max(-RANGE_DB, dbOf(clientY - rect.top, height))).toFixed(2)),
      };
      onBandChange(index, next);
    },
    [settings.eq, onBandChange, height]
  );

  useEffect(() => {
    if (dragging === null) return;
    const move = (e: PointerEvent) => drag(dragging, e.clientX, e.clientY);
    const up = () => setDragging(null);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [dragging, drag]);

  const pathOf = (points: { freq: number; db: number }[]) =>
    points
      .map(
        (p, i) =>
          `${i === 0 ? "M" : "L"}${xOf(p.freq, width).toFixed(1)},${yOf(Math.max(MIN_DB, p.db), height).toFixed(1)}`
      )
      .join(" ");
  const path = pathOf(curve);
  const sidePath = sideCurve ? pathOf(sideCurve) : null;

  const nudge = (index: number, e: React.KeyboardEvent) => {
    const band = settings.eq[index];
    const fine = e.shiftKey ? 0.25 : 1;
    let next: EqBand | null = null;
    if (e.key === "ArrowUp") next = { ...band, gainDb: Math.min(RANGE_DB, band.gainDb + 0.5 * fine) };
    else if (e.key === "ArrowDown") next = { ...band, gainDb: Math.max(-RANGE_DB, band.gainDb - 0.5 * fine) };
    else if (e.key === "ArrowRight") next = { ...band, freq: Math.round(Math.min(MAX_HZ, band.freq * (1 + 0.05 * fine))) };
    else if (e.key === "ArrowLeft") next = { ...band, freq: Math.round(Math.max(MIN_HZ, band.freq / (1 + 0.05 * fine))) };
    else if (e.key === "PageUp") next = { ...band, q: Math.min(MAX_Q, band.q * 1.3) };
    else if (e.key === "PageDown") next = { ...band, q: Math.max(MIN_Q, band.q / 1.3) };
    else if (e.key === "Home") next = { ...band, gainDb: 0 };
    else if (e.key === " " || e.key === "Enter") next = { ...band, enabled: !band.enabled };
    else if (e.key === "m" || e.key === "M") next = { ...band, channel: cycleChannel(band.channel) };
    if (!next) return;
    e.preventDefault();
    onBandChange(index, next);
  };

  return (
    <div ref={wrapper} className="relative rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden">
      <canvas ref={canvas} className="block" />
      <svg
        className="absolute inset-0"
        width={width}
        height={height}
        role="group"
        aria-label="เส้นตอบสนอง EQ — ห้าจุดลากได้ กด M สลับ กลาง/ข้าง"
      >
        {GRID_HZ.map((hz) => (
          <g key={hz}>
            <line x1={xOf(hz, width)} y1={0} x2={xOf(hz, width)} y2={height} stroke="rgba(255,255,255,0.06)" />
            <text x={xOf(hz, width) + 3} y={height - 4} fontSize={9} fill={TEXT_FAINT}>
              {hz >= 1000 ? `${hz / 1000}k` : hz}
            </text>
          </g>
        ))}
        {GRID_DB.map((db) => (
          <g key={db}>
            <line
              x1={0}
              y1={yOf(db, height)}
              x2={width}
              y2={yOf(db, height)}
              stroke={db === 0 ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.05)"}
            />
            <text x={3} y={yOf(db, height) - 3} fontSize={9} fill={TEXT_FAINT}>
              {db > 0 ? `+${db}` : db}
            </text>
          </g>
        ))}

        <path d={path} fill="none" stroke={GOLD_BRIGHT} strokeWidth={2} />
        {sidePath && (
          <path d={sidePath} fill="none" stroke={GROUP_COLOR.stereo} strokeWidth={2} strokeDasharray="5 3" />
        )}
        {midSide && (
          <g>
            <text x={width - 6} y={14} fontSize={9} textAnchor="end" fill={GOLD_BRIGHT}>
              เส้นทึบ = กลาง (mid)
            </text>
            <text x={width - 6} y={26} fontSize={9} textAnchor="end" fill={GROUP_COLOR.stereo}>
              เส้นประ = ข้าง (side)
            </text>
          </g>
        )}

        {settings.eq.map((band, i) => {
          const cx = xOf(band.freq, width);
          const cy = yOf(band.gainDb, height);
          return (
            <g key={i}>
              <circle
                cx={cx}
                cy={cy}
                r={9}
                fill={band.enabled ? GROUP_COLOR.tone : "transparent"}
                stroke={GOLD_BRIGHT}
                strokeWidth={1.5}
                opacity={band.enabled ? 0.9 : 0.4}
                style={{ cursor: "grab" }}
                onPointerDown={(e) => {
                  e.preventDefault();
                  setDragging(i);
                  drag(i, e.clientX, e.clientY);
                }}
              />
              <text x={cx} y={cy + 3} fontSize={9} textAnchor="middle" fill={BG} pointerEvents="none">
                {i + 1}
              </text>
              {band.channel !== "both" && (
                <text
                  x={cx + 11}
                  y={cy - 8}
                  fontSize={9}
                  fontWeight="bold"
                  textAnchor="middle"
                  fill={GROUP_COLOR.stereo}
                  pointerEvents="none"
                >
                  {CHANNEL_MARK[band.channel]}
                </text>
              )}
              {/* A real focusable control per node: dragging is not available
                  from a keyboard, and five bands that only a mouse can reach
                  is five controls that do not exist for some users. */}
              <circle
                cx={cx}
                cy={cy}
                r={14}
                fill="transparent"
                tabIndex={0}
                role="slider"
                aria-label={`แบนด์ ${i + 1}`}
                aria-valuemin={MIN_GAIN_DB}
                aria-valuemax={RANGE_DB}
                aria-valuenow={band.gainDb}
                aria-valuetext={`${band.freq} เฮิรตซ์ ${band.gainDb > 0 ? "+" : ""}${band.gainDb} เดซิเบล Q ${band.q.toFixed(2)} ช่อง ${CHANNEL_LABEL[band.channel]}${band.enabled ? "" : " (ปิดอยู่)"}`}
                onKeyDown={(e) => nudge(i, e)}
                className="outline-none focus-visible:stroke-white"
                strokeWidth={1}
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
}
