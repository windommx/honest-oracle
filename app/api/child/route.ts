/**
 * The GET here reads a customer's own saved analyses. It previously took the
 * tenant id from `?userId=` and fell back to `where: {}` when the parameter
 * was absent — so an unauthenticated request returned 50 rows drawn from
 * every tenant in the database, and the history page (which sends no
 * parameter at all) was showing each signed-in customer everybody else's
 * records. The tenant now comes from the session and nothing else.
 *
 * The POST stays open to signed-out visitors, because this is a public tool.
 * What it no longer does is read `userId` from the request body: that let
 * anyone write a row into another customer's account. Ownership is taken
 * from the session, or left null for an anonymous run.
 */
import { analyzeChildName } from "@/lib/engine";
import { Gender, DayOfWeek } from "@/lib/engine";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/server/session";

export async function POST(request: NextRequest) {
  try {
    const viewer = await requireUser();
    const body = await request.json();
    const { gender, birthDay, parentGoals } = body;

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
        userId: viewer ? viewer.id : null,
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
    const viewer = await requireUser();
    if (!viewer) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const analyses = await prisma.childAnalysis.findMany({
      where: { userId: viewer.id },
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
