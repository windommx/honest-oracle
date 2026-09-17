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
import { NextRequest, NextResponse } from "next/server";
import { analyzeCorporateName, calculateMCAI } from "@/lib/engine";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/server/session";
export async function POST(request: NextRequest) {
  try {
    const viewer = await requireUser();
    const body = await request.json();
    const { brandName, founderBirthday, industryType, targetAudience } = body;

    if (!brandName || !founderBirthday || !industryType) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const result = analyzeCorporateName(brandName, founderBirthday, industryType, targetAudience || "");

    const mcai = calculateMCAI({
      brandName,
      domain: "",
      legalClearance: true,
      phoneticScore: result.memorabilityScore,
      cai: result.cai,
      elementBalance: result.elementBalance,
    });

    const saved = await prisma.corporateAnalysis.create({
      data: {
        brandName,
        founderBirthday,
        industryType,
        targetAudience: targetAudience || "",
        cai: result.cai,
        s1: result.s1,
        s2: result.s2,
        s3: result.s3,
        elementBalance: result.elementBalance,
        phoneticPricing: result.phoneticPricing,
        memorabilityScore: result.memorabilityScore,
        resonanceTriangle: JSON.stringify(result.resonanceTriangle),
        warnings: JSON.stringify(result.warnings),
        recommendations: JSON.stringify(result.recommendations),
        userId: viewer ? viewer.id : null,
      },
    });

    return NextResponse.json({
      ...result,
      mcai,
      id: saved.id,
    });
  } catch (error) {
    console.error("Corporate analysis error:", error);
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

    const analyses = await prisma.corporateAnalysis.findMany({
      where: { userId: viewer.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return NextResponse.json(analyses);
  } catch (error) {
    console.error("Fetch corporate analyses error:", error);
    return NextResponse.json(
      { error: "Failed to fetch analyses" },
      { status: 500 }
    );
  }
}
