'use client';

/**
 * FactorTrajectoryChart — 4 factor time series (F1..F4) via recharts.
 * Pure presentational; parent supplies the dark zinc-950 surface.
 */

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

export interface TrajPoint {
  date: string;
  F1: number;
  F2: number;
  F3: number;
  F4: number;
  se1: number;
  se2: number;
  se3: number;
  se4: number;
}

const SERIES = [
  { key: 'F1', color: '#fbbf24' },
  { key: 'F2', color: '#fb7185' },
  { key: 'F3', color: '#34d399' },
  { key: 'F4', color: '#2dd4bf' },
] as const;

export default function FactorTrajectoryChart({
  points,
  height = 300,
}: {
  points: TrajPoint[];
  height?: number;
}) {
  return (
    <div className="w-full font-mono" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="#27272a" strokeDasharray="3 3" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 9, fill: '#71717a' }}
            stroke="#71717a"
            interval={8}
            tickFormatter={(v: string) => (typeof v === 'string' && v.length >= 10 ? v.slice(5, 10) : String(v))}
          />
          <YAxis tick={{ fontSize: 9, fill: '#71717a' }} stroke="#71717a" width={36} />
          <Tooltip
            contentStyle={{
              background: '#18181b',
              border: '1px solid #3f3f46',
              fontSize: 11,
              borderRadius: 8,
            }}
            labelStyle={{ color: '#a1a1aa' }}
          />
          <ReferenceLine y={0} stroke="#52525b" strokeDasharray="4 4" />
          {SERIES.map((s) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              stroke={s.color}
              strokeWidth={1.6}
              dot={false}
              isAnimationActive={false}
            />
          ))}
          <Legend wrapperStyle={{ fontSize: 10, color: '#a1a1aa' }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
