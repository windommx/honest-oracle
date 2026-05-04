import { NextRequest, NextResponse } from "next/server";
import { calculateMCAScore, DayOfWeek } from "@/lib/engine";

export async function POST(request: NextRequest) {
  try {
    const { firstName, lastName } = await request.json();

    if (!firstName || !lastName) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const days: { label: string; value: DayOfWeek }[] = [
      { label: "อาทิตย์", value: "sunday" },
      { label: "จันทร์", value: "monday" },
      { label: "อังคาร", value: "tuesday" },
      { label: "พุธกลางวัน", value: "wednesday_day" },
      { label: "พุธกลางคืน", value: "wednesday_night" },
      { label: "พฤหัสบดี", value: "thursday" },
      { label: "ศุกร์", value: "friday" },
      { label: "เสาร์", value: "saturday" },
    ];

    const fullName = firstName + lastName;
    const results = days.map(({ label, value }) => {
      const analysis = calculateMCAScore(fullName, value);
      return {
        birthday: label,
        score: analysis.totalScore,
        kalaiganiScore: analysis.kalaiganiScore,
        numerologyScore: analysis.numerologyScore,
        violations: analysis.details.kalaigani.violations,
      };
    });

    results.sort((a, b) => b.score - a.score);

    return NextResponse.json({ results });
  } catch (error) {
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
