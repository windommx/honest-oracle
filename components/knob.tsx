"use client";

import { useCallback, useId, useRef, useState } from "react";
import { GOLD, TEXT_FAINT } from "@/lib/design/tokens";

// ╔══════════════════════════════════════════════════════════════════╗
// ║  KNOB — draggable, and reachable from the keyboard.               ║
// ║                                                                    ║
// ║  Lifted out of app/synth when /master needed the same control. It  ║
// ║  takes a colour rather than a synth panel group, so neither        ║
// ║  product's palette leaks into the other; app/synth/_knob.tsx is    ║
// ║  now a three-line wrapper that maps its group to a colour.         ║
// ║                                                                    ║
// ║  None of the three versions this came from could be operated       ║
// ║  without a mouse: the knobs were <div>s with mousedown handlers,   ║
// ║  no role, no tabindex, no value announced. On a synthesiser that   ║
// ║  means the instrument has ~40 controls a keyboard or screen-reader ║
// ║  user cannot reach at all.                                         ║
// ║                                                                    ║
// ║  This is a real slider: role="slider" with aria-valuenow/min/max   ║
// ║  and a text equivalent, arrow keys to nudge, Home/End for the      ║
// ║  extremes, and PageUp/PageDown for coarse jumps. Pointer drag,     ║
// ║  wheel and double-click-to-default still work as before.           ║
// ╚══════════════════════════════════════════════════════════════════╝

const START_ANGLE = -225;
const SWEEP = 270;

export interface KnobProps {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  /** Accent for the arc and the pointer. */
  color?: string;
  /** Value restored on double-click / Home-then-default. */
  defaultValue?: number;
  /** Log scale — for frequency, where the useful resolution is at the bottom. */
  logarithmic?: boolean;
  unit?: string;
  /** Decimal places; inferred from the range when omitted. */
  precision?: number;
  /** Snap to whole numbers — for parameters the engine rounds anyway. */
  integer?: boolean;
  size?: number;
}

function toNormal(v: number, min: number, max: number, log: boolean): number {
  if (log && min > 0) return Math.log(v / min) / Math.log(max / min);
  return (v - min) / (max - min);
}

function fromNormal(n: number, min: number, max: number, log: boolean): number {
  const c = Math.min(Math.max(n, 0), 1);
  if (log && min > 0) return min * Math.pow(max / min, c);
  return min + c * (max - min);
}

function format(v: number, unit: string, precision?: number): string {
  if (unit === "s" && Math.abs(v) < 1) return `${Math.round(v * 1000)}ms`;
  const dp = precision ?? (Math.abs(v) >= 100 ? 0 : Math.abs(v) >= 10 ? 1 : 2);
  return `${v.toFixed(dp)}${unit}`;
}

export function Knob({
  label,
  value,
  min,
  max,
  onChange,
  color = GOLD,
  defaultValue,
  logarithmic = false,
  unit = "",
  precision,
  integer = false,
  size = 54,
}: KnobProps) {
  const id = useId();
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ y: number; norm: number } | null>(null);

  const normal = Math.min(Math.max(toNormal(value, min, max, logarithmic), 0), 1);
  const angle = START_ANGLE + normal * SWEEP;

  const commit = useCallback(
    (n: number) => {
      const value = fromNormal(n, min, max, logarithmic);
      onChange(integer ? Math.round(value) : value);
    },
    [onChange, min, max, logarithmic, integer]
  );

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    drag.current = { y: e.clientY, norm: normal };
    setDragging(true);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    // Vertical drag, not rotational: a circular gesture is far harder to aim,
    // and every hardware-style knob in software works this way.
    const dy = drag.current.y - e.clientY;
    // Shift is the fine-adjust modifier, as everywhere else in the app.
    const scale = e.shiftKey ? 0.001 : 0.005;
    commit(drag.current.norm + dy * scale);
  };

  const endDrag = (e: React.PointerEvent) => {
    if ((e.target as Element).hasPointerCapture?.(e.pointerId)) {
      (e.target as Element).releasePointerCapture(e.pointerId);
    }
    drag.current = null;
    setDragging(false);
  };

  /** Move by `steps` notches. On an integer knob a notch is one whole unit —
   *  a fraction of the range would round straight back to where it started,
   *  which left keyboard users unable to change these knobs at all. */
  const nudge = useCallback(
    (steps: number, fine: boolean) => {
      if (integer) {
        onChange(Math.min(max, Math.max(min, Math.round(value) + steps)));
        return;
      }
      commit(normal + steps * (fine ? 0.002 : 0.02));
    },
    [integer, onChange, min, max, value, commit, normal]
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    const coarse = integer ? Math.max(1, Math.round((max - min) / 10)) : 5;
    switch (e.key) {
      case "ArrowUp":
      case "ArrowRight":
        nudge(1, e.shiftKey);
        break;
      case "ArrowDown":
      case "ArrowLeft":
        nudge(-1, e.shiftKey);
        break;
      case "PageUp":
        nudge(coarse, false);
        break;
      case "PageDown":
        nudge(-coarse, false);
        break;
      case "Home":
        onChange(min);
        break;
      case "End":
        onChange(max);
        break;
      default:
        return;
    }
    e.preventDefault();
  };

  const r = size / 2 - 7;
  const cx = size / 2;
  const cy = size / 2;
  const rad = (deg: number) => ((deg - 90) * Math.PI) / 180;
  // Rounded, and not only for tidiness. Full-precision trigonometry can differ
  // in the last couple of bits between the server render and the client one,
  // and React compares the `d` attribute as a STRING — so a difference at the
  // fifteenth decimal is a hydration mismatch warning on a path nobody can see
  // the difference in. Three decimals is far finer than a pixel at any size
  // this is drawn at.
  const round = (v: number) => Number(v.toFixed(3));
  const arc = (from: number, to: number, radius: number) => {
    const a = rad(from);
    const b = rad(to);
    const x1 = round(cx + radius * Math.cos(a));
    const y1 = round(cy + radius * Math.sin(a));
    const x2 = round(cx + radius * Math.cos(b));
    const y2 = round(cy + radius * Math.sin(b));
    return `M${x1} ${y1}A${radius} ${radius} 0 ${to - from > 180 ? 1 : 0} 1 ${x2} ${y2}`;
  };
  const pointer = rad(angle);

  return (
    <div className="flex flex-col items-center gap-1 select-none">
      <div
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={Number(value.toFixed(4))}
        aria-valuetext={format(value, unit, precision)}
        aria-describedby={`${id}-hint`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
        onDoubleClick={() => defaultValue !== undefined && onChange(defaultValue)}
        onWheel={(e) => nudge(e.deltaY > 0 ? -1 : 1, e.shiftKey)}
        className="cursor-ns-resize touch-none rounded-full"
        style={{ width: size, height: size }}
      >
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
          <path d={arc(START_ANGLE, START_ANGLE + SWEEP, r + 3)} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="text-white/10" />
          <path d={arc(START_ANGLE, angle, r + 3)} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" />
          <circle cx={cx} cy={cy} r={r} fill="currentColor" className="text-white/[0.04]" />
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="currentColor" strokeWidth={0.5} className="text-white/10" />
          <line
            x1={round(cx + r * 0.35 * Math.cos(pointer))}
            y1={round(cy + r * 0.35 * Math.sin(pointer))}
            x2={round(cx + (r - 3) * Math.cos(pointer))}
            y2={round(cy + (r - 3) * Math.sin(pointer))}
            stroke={color}
            strokeWidth={2}
            strokeLinecap="round"
          />
        </svg>
      </div>
      <span className="text-[0.62rem] tabular-nums leading-none" style={{ color: dragging ? color : TEXT_FAINT }}>
        {format(value, unit, precision)}
      </span>
      <span className="text-[0.6rem] leading-none text-center" style={{ color: TEXT_FAINT }}>
        {label}
      </span>
      <span id={`${id}-hint`} className="sr-only">
        ลากขึ้นลง หรือใช้ปุ่มลูกศร · กด Shift เพื่อปรับละเอียด · Home และ End สำหรับค่าต่ำสุด/สูงสุด
        {defaultValue !== undefined ? " · ดับเบิลคลิกเพื่อคืนค่าเริ่มต้น" : ""}
      </span>
    </div>
  );
}
