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
    const { nodeId, targetParentId, nodeKeyEnc, nodeKeyIV } = body;

    if (!nodeId || !nodeKeyEnc || !nodeKeyIV) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const node = await prisma.node.findUnique({
      where: { id: nodeId },
    });

    if (!node || node.userId !== userId) {
      return NextResponse.json({ error: "Node not found or unauthorized" }, { status: 404 });
    }

    // If target parent is provided, check if it exists and belongs to the user
    const resolvedParentId: string | null = targetParentId || null;
    if (resolvedParentId) {
      const parentNode = await prisma.node.findUnique({
        where: { id: resolvedParentId },
      });
      if (!parentNode || parentNode.userId !== userId || parentNode.type !== "FOLDER") {
        return NextResponse.json({ error: "Invalid target folder" }, { status: 400 });
      }

      // Prevent moving a folder into itself or its descendants
      if (node.type === "FOLDER") {
        let currentParentId: string | null = resolvedParentId;
        while (currentParentId) {
          if (currentParentId === nodeId) {
            return NextResponse.json(
              { error: "Cannot move a folder inside itself or its subfolders." },
              { status: 400 }
            );
          }
          const checkNode = (await prisma.node.findUnique({
            where: { id: currentParentId },
            select: { parentId: true },
          })) as { parentId: string | null } | null;
          currentParentId = checkNode?.parentId || null;
        }
      }
    }

    // Update the node's parent and its re-encrypted key details
    const updatedNode = await prisma.node.update({
      where: { id: nodeId },
      data: {
        parentId: resolvedParentId,
        nodeKeyEnc,
        nodeKeyIV,
      },
    });

    revalidateTag(`user-nodes-${userId}`);

    return NextResponse.json({
      success: true,
      node: {
        ...updatedNode,
        sizeBytes: updatedNode.sizeBytes ? updatedNode.sizeBytes.toString() : null,
      },
    });
  } catch (error) {
    console.error("Node Move error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
