"use client";

import { useEffect, useMemo, useRef } from "react";
import { waveformPeaks } from "@/lib/master-engine/offline";
import { GOLD, GOLD_DEEP, TEXT_FAINT } from "./_tokens";

// The overview. Drawn from MIN AND MAX per pixel column rather than from one
// sampled value: at any realistic width a column covers thousands of samples,
// and picking one of them makes a waveform whose shape changes when the window
// is resized and which hides every short peak in the track.

export interface WaveformProps {
  left: Float32Array | null;
  right: Float32Array | null;
  sampleRate: number;
  /** Playhead, in frames. */
  frame: number;
  onSeek: (frame: number) => void;
  height?: number;
}

const DPR_CAP = 2;

export function Waveform({ left, right, sampleRate, frame, onSeek, height = 120 }: WaveformProps) {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const wrapper = useRef<HTMLDivElement | null>(null);
  const frames = left?.length ?? 0;

  // Peaks are recomputed only when the FILE changes, never on a playhead move —
  // scanning a five-minute track on every animation frame would drop the audio
  // thread's messages behind a busy main thread.
  const buckets = 1200;
  const peaks = useMemo(() => {
    if (!left) return null;
    return waveformPeaks(right && right !== left ? [left, right] : [left], buckets);
  }, [left, right]);

  useEffect(() => {
    const el = canvas.current;
    const box = wrapper.current;
    if (!el || !box) return;

    const draw = () => {
      const width = box.clientWidth;
      const dpr = Math.min(DPR_CAP, window.devicePixelRatio || 1);
      el.width = Math.max(1, Math.round(width * dpr));
      el.height = Math.round(height * dpr);
      el.style.width = `${width}px`;
      el.style.height = `${height}px`;

      const ctx = el.getContext("2d");
      if (!ctx) return;
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, width, height);

      const middle = height / 2;
      if (!peaks) {
        ctx.strokeStyle = TEXT_FAINT;
        ctx.globalAlpha = 0.35;
        ctx.beginPath();
        ctx.moveTo(0, middle);
        ctx.lineTo(width, middle);
        ctx.stroke();
        ctx.globalAlpha = 1;
        return;
      }

      const columns = peaks.min.length;
      ctx.fillStyle = GOLD_DEEP;
      for (let x = 0; x < width; x++) {
        const b = Math.min(columns - 1, Math.floor((x / width) * columns));
        const top = middle - peaks.max[b] * middle;
        const bottom = middle - peaks.min[b] * middle;
        ctx.fillRect(x, top, 1, Math.max(1, bottom - top));
      }

      if (frames > 0) {
        const x = (frame / frames) * width;
        ctx.fillStyle = GOLD;
        ctx.fillRect(Math.min(width - 2, Math.max(0, x)), 0, 2, height);
      }
    };

    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(box);
    return () => observer.disconnect();
  }, [peaks, frame, frames, height]);

  const seekFromEvent = (clientX: number) => {
    const box = wrapper.current;
    if (!box || frames === 0) return;
    const rect = box.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    onSeek(Math.round(ratio * frames));
  };

  const seconds = frames / (sampleRate || 1);
  const at = frame / (sampleRate || 1);
  const clock = (s: number) =>
    `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, "0")}`;

  return (
    <div>
      <div
        ref={wrapper}
        className="relative rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden cursor-pointer"
        style={{ height }}
        onPointerDown={(e) => seekFromEvent(e.clientX)}
        role="slider"
        tabIndex={frames > 0 ? 0 : -1}
        aria-label="ตำแหน่งการเล่น"
        aria-valuemin={0}
        aria-valuemax={Math.round(seconds)}
        aria-valuenow={Math.round(at)}
        aria-valuetext={`${clock(at)} จาก ${clock(seconds)}`}
        onKeyDown={(e) => {
          if (frames === 0) return;
          const step = sampleRate * (e.shiftKey ? 10 : 1);
          if (e.key === "ArrowRight") onSeek(Math.min(frames, frame + step));
          else if (e.key === "ArrowLeft") onSeek(Math.max(0, frame - step));
          else if (e.key === "Home") onSeek(0);
          else if (e.key === "End") onSeek(frames);
          else return;
          e.preventDefault();
        }}
      >
        <canvas ref={canvas} className="block" />
      </div>
      <div className="flex justify-between mt-1 text-[0.65rem] tabular-nums" style={{ color: TEXT_FAINT }}>
        <span>{clock(at)}</span>
        <span>{frames > 0 ? clock(seconds) : "—"}</span>
      </div>
    </div>
  );
}
