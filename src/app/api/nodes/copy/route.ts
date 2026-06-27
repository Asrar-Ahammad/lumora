import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { revalidateTag } from "next/cache";

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const {
      nodeId,
      targetParentId,
      nodeKeyEnc,
      nodeKeyIV,
      nameEnc,
      nameIV,
      captionEnc,
      captionIV,
    } = body;

    if (!nodeId || !nodeKeyEnc || !nodeKeyIV || !nameEnc || !nameIV) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const node = await prisma.node.findUnique({
      where: { id: nodeId },
    });

    if (!node || node.userId !== userId) {
      return NextResponse.json({ error: "Node not found or unauthorized" }, { status: 404 });
    }

    // Check target parent is valid
    const resolvedParentId: string | null = targetParentId || null;
    if (resolvedParentId) {
      const parentNode = await prisma.node.findUnique({
        where: { id: resolvedParentId },
      });
      if (!parentNode || parentNode.userId !== userId || parentNode.type !== "FOLDER") {
        return NextResponse.json({ error: "Invalid target folder" }, { status: 400 });
      }
    }

    // Create duplicate node
    const copiedNode = await prisma.node.create({
      data: {
        userId,
        parentId: resolvedParentId,
        type: node.type,
        nameEnc,
        nameIV,
        nodeKeyEnc,
        nodeKeyIV,
        mimeType: node.mimeType,
        sizeBytes: node.sizeBytes,
        r2Key: node.r2Key, // Share the same R2 storage block for copy
        captionEnc: captionEnc || node.captionEnc,
        captionIV: captionIV || node.captionIV,
      },
    });

    revalidateTag(`user-nodes-${userId}`);

    return NextResponse.json({
      success: true,
      node: {
        ...copiedNode,
        sizeBytes: copiedNode.sizeBytes ? copiedNode.sizeBytes.toString() : null,
      },
    });
  } catch (error) {
    console.error("Node Copy error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
