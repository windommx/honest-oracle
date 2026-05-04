import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calculateMCAScore, DayOfWeek } from "@/lib/engine";

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user ? (session.user as { id: string }).id : null;

    const { firstName, lastName, birthday } = await request.json();

    if (!firstName || !lastName || !birthday) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    if (userId) {
      const today = new Date().toISOString().split("T")[0];
      const startOfDay = new Date(today + "T00:00:00");
      const endOfDay = new Date(today + "T23:59:59");

      const todayCount = await prisma.analysis.count({
        where: {
          userId,
          createdAt: {
            gte: startOfDay,
            lte: endOfDay,
          },
        },
      });

      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (user?.plan === "free" && todayCount >= 5) {
        return NextResponse.json(
          { error: "Daily limit reached. Upgrade to Pro for unlimited analyses." },
          { status: 403 }
        );
      }
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
    const fullName = firstName + lastName;
    const result = calculateMCAScore(fullName, day);

    const analysis = await prisma.analysis.create({
      data: {
        userId,
        firstName,
        lastName,
        birthday,
        totalScore: result.totalScore,
        kalaiganiScore: result.kalaiganiScore,
        numerologyScore: result.numerologyScore,
        taksaScore: result.taksaScore,
        phoneticScore: result.phoneticScore,
        elementScore: result.elementScore,
        details: JSON.stringify(result.details),
      },
    });

    return NextResponse.json({
      id: analysis.id,
      ...result,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
