import { NextRequest, NextResponse } from "next/server";
import { analyzeRename } from "@/lib/engine";
import { DayOfWeek } from "@/lib/engine";
import prisma from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { currentName, currentSurname, birthDay, goals, userId } = body;

    if (!currentName || !currentSurname || !birthDay || !goals) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const result = analyzeRename(currentName, currentSurname, birthDay as DayOfWeek, goals);

    const saved = await prisma.renameAnalysis.create({
      data: {
        currentName,
        currentSurname,
        birthDay,
        goals: goals.join(","),
        problemAreas: result.problemAreas.join(","),
        targetNumber: result.targetNumber,
        targetAyatana: result.targetAyatana,
        recommendedWarakkasa: result.recommendedWarakkasa.join(","),
        suggestedNewNames: JSON.stringify(result.suggestedNewNames),
        softTransitionTips: result.softTransitionTips.join("|"),
        userId: userId || null,
      },
    });

    return NextResponse.json({
      ...result,
      id: saved.id,
    });
  } catch (error) {
    console.error("Rename analysis error:", error);
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

    const analyses = await prisma.renameAnalysis.findMany({
      where: userId ? { userId } : {},
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return NextResponse.json(analyses);
  } catch (error) {
    console.error("Fetch rename analyses error:", error);
    return NextResponse.json(
      { error: "Failed to fetch analyses" },
      { status: 500 }
    );
  }
}
