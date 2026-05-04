import { NextRequest, NextResponse } from "next/server";
import { analyzeChildName } from "@/lib/engine";
import { Gender, DayOfWeek } from "@/lib/engine";
import prisma from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { gender, birthDay, parentGoals, userId } = body;

    if (!gender || !birthDay || !parentGoals) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const result = analyzeChildName(gender as Gender, birthDay as DayOfWeek, parentGoals);

    const saved = await prisma.childAnalysis.create({
      data: {
        gender,
        birthDay,
        parentGoals: parentGoals.join(","),
        recommendedLetters: result.recommendedLetters.join(","),
        avoidedLetters: result.avoidedLetters.join(","),
        targetNumber: result.targetNumber,
        ayatana: result.ayatana,
        warakkasaEmphasis: result.warakkasaEmphasis.join(","),
        suggestedNames: JSON.stringify(result.suggestedNames),
        userId: userId || null,
      },
    });

    return NextResponse.json({
      ...result,
      id: saved.id,
    });
  } catch (error) {
    console.error("Child naming analysis error:", error);
    return NextResponse.json(
      { error: "Analysis failed" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    const analyses = await prisma.childAnalysis.findMany({
      where: userId ? { userId } : {},
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return NextResponse.json(analyses);
  } catch (error) {
    console.error("Fetch child analyses error:", error);
    return NextResponse.json(
      { error: "Failed to fetch analyses" },
      { status: 500 }
    );
  }
}
