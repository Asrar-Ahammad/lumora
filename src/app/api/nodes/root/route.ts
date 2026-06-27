import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rootNode = await prisma.node.findFirst({
      where: {
        userId,
        parentId: null,
        type: "FOLDER",
      },
    });

    return NextResponse.json({ rootNode });
  } catch (error) {
    console.error("Root Node GET error:", error);
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
    const { nameEnc, nameIV, nodeKeyEnc, nodeKeyIV } = body;

    if (!nameEnc || !nameIV || !nodeKeyEnc || !nodeKeyIV) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Ensure User exists
    await prisma.user.upsert({
      where: { id: userId },
      update: {},
      create: { id: userId },
    });

    // Check if root already exists
    const existingRoot = await prisma.node.findFirst({
      where: {
        userId,
        parentId: null,
        type: "FOLDER",
      },
    });

    if (existingRoot) {
      return NextResponse.json({ rootNode: existingRoot });
    }

    const newRoot = await prisma.node.create({
      data: {
        userId,
        parentId: null,
        type: "FOLDER",
        nameEnc,
        nameIV,
        nodeKeyEnc,
        nodeKeyIV,
      },
    });

    return NextResponse.json({ rootNode: newRoot });
  } catch (error) {
    console.error("Root Node POST error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
