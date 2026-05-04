import { NextRequest, NextResponse } from "next/server";
import { calculateMCAScore, DayOfWeek, KALAIGANI } from "@/lib/engine";

export async function POST(request: NextRequest) {
  try {
    const { pool, lastName, birthday, targetNumber } = await request.json();

    if (!pool || !lastName || !birthday) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const words = pool.split(",").map((w: string) => w.trim()).filter(Boolean);
    
    if (words.length === 0) {
      return NextResponse.json(
        { error: "No valid words in pool" },
        { status: 400 }
      );
    }

    const dayMap: Record<string, DayOfWeek> = {
      อาทิตย์: "sunday",
      จันทร์: "monday",
      อังคาร: "tuesday",
      พุธกลางวัน: "wednesday_day",
      พุธกลางคืน: "wednesday_night",
      พฤหัสบดี: "thursday",
      ศุกร์: "friday",
      เสาร์: "saturday",
    };

    const day = dayMap[birthday] || "sunday";
    const results: Array<{
      name: string;
      score: number;
      passesKalaigani: boolean;
      numerology: number;
      isTargetNumber: boolean;
    }> = [];

    for (const word of words) {
      const fullName = word + lastName;
      const analysis = calculateMCAScore(fullName, day);
      
      const numerology = analysis.details.numerology.totalStrokes;
      const isTarget = targetNumber ? numerology === targetNumber : null;
      
      results.push({
        name: word + " " + lastName,
        score: analysis.totalScore,
        passesKalaigani: analysis.details.kalaigani.violations.length === 0,
        numerology,
        isTargetNumber: isTarget ?? false,
      });
    }

    results.sort((a, b) => b.score - a.score);

    return NextResponse.json({ results });
  } catch (error) {
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
