"use client";

import { useEffect, useRef } from "react";
import { GOLD, GOLD_BRIGHT, TEXT_FAINT } from "./_tokens";

// A log-frequency spectrum analyser.
//
// Log rather than linear on the x-axis because pitch is logarithmic: on a
// linear axis the octave from 40Hz to 80Hz — where most of a bass patch lives —
// occupies about half a percent of the width, and everything interesting is
// crushed against the left edge.

export interface SpectrumProps {
  /** Called each frame; returns dB magnitudes per FFT bin. */
  read: () => Float32Array;
  sampleRate: number;
  active: boolean;
  height?: number;
}

const MIN_HZ = 30;
const MAX_HZ = 18000;
const MIN_DB = -100;
const MAX_DB = -10;
const LABELS = [50, 100, 500, 1000, 5000, 10000];

export function Spectrum({ read, sampleRate, active, height = 150 }: SpectrumProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frame = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const xFor = (hz: number, w: number) =>
      (Math.log(Math.max(MIN_HZ, hz) / MIN_HZ) / Math.log(MAX_HZ / MIN_HZ)) * w;

    const draw = () => {
      frame.current = requestAnimationFrame(draw);

      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      ctx.strokeStyle = "rgba(255,255,255,0.05)";
      ctx.lineWidth = 1;
      ctx.font = "9px ui-monospace, monospace";
      ctx.fillStyle = "rgba(255,255,255,0.22)";
      for (const hz of LABELS) {
        const x = xFor(hz, w);
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h - 12);
        ctx.stroke();
        ctx.fillText(hz >= 1000 ? `${hz / 1000}k` : `${hz}`, x + 2, h - 3);
      }

      if (!active) {
        ctx.fillStyle = "rgba(255,255,255,0.25)";
        ctx.font = "11px system-ui, sans-serif";
        ctx.fillText("หยุดอยู่", 8, 16);
        return;
      }

      const bins = read();
      if (bins.length === 0) return;

      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, GOLD_BRIGHT);
      grad.addColorStop(1, "rgba(201,168,76,0.05)");

      ctx.beginPath();
      ctx.moveTo(0, h);
      const binHz = sampleRate / 2 / bins.length;
      let started = false;
      for (let i = 1; i < bins.length; i++) {
        const hz = i * binHz;
        if (hz < MIN_HZ || hz > MAX_HZ) continue;
        const x = xFor(hz, w);
        const norm = (bins[i] - MIN_DB) / (MAX_DB - MIN_DB);
        const y = h - 12 - Math.min(Math.max(norm, 0), 1) * (h - 16);
        if (!started) {
          ctx.lineTo(x, y);
          started = true;
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();

      ctx.strokeStyle = GOLD;
      ctx.lineWidth = 1.2;
      ctx.stroke();
    };

    frame.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame.current);
  }, [read, sampleRate, active]);

  return (
    <div className="rounded-lg border border-white/10 overflow-hidden" style={{ height }}>
      <canvas ref={canvasRef} className="w-full h-full block" aria-hidden />
      <span className="sr-only">
        กราฟสเปกตรัมความถี่ของเสียงที่กำลังเล่น (เป็นภาพประกอบ ไม่จำเป็นต่อการใช้งาน)
      </span>
      <span className="sr-only" style={{ color: TEXT_FAINT }} />
    </div>
  );
}
