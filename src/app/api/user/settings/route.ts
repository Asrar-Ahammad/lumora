import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    return NextResponse.json({ 
      aiSearch: user?.aiSearch ?? false 
    });
  } catch (error) {
    console.error("GET user settings error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { aiSearch } = body;

    const user = await prisma.user.upsert({
      where: { id: userId },
      update: { aiSearch },
      create: { id: userId, aiSearch },
    });

    return NextResponse.json({ aiSearch: user.aiSearch });
  } catch (error) {
    console.error("POST user settings error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
