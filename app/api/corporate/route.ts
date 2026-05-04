import { NextRequest, NextResponse } from "next/server";
import { analyzeCorporateName, calculateMCAI } from "@/lib/engine";
import { prisma } from "@/lib/prisma";
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { brandName, founderBirthday, industryType, targetAudience, userId } = body;

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
        userId: userId || null,
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
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    const analyses = await prisma.corporateAnalysis.findMany({
      where: userId ? { userId } : {},
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
