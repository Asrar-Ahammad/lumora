import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { mediaId, encryptedMetadata, iv } = body;

    if (!mediaId) {
      return NextResponse.json({ error: "Missing mediaId" }, { status: 400 });
    }

    const node = await prisma.node.findUnique({
      where: { id: mediaId }
    });

    if (!node || node.userId !== userId) {
      return NextResponse.json({ error: "Not found or unauthorized" }, { status: 404 });
    }

    // Update Node with E2EE metadata
    await prisma.node.update({
      where: { id: mediaId },
      data: {
        nameEnc: encryptedMetadata,
        nameIV: iv,
      }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Upload confirm error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
