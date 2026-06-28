import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const cursor = searchParams.get("cursor");
    const limit = parseInt(searchParams.get("limit") || "50", 10);

    const take = limit + 1;
    const skip = cursor ? 1 : 0;
    const cursorObj = cursor ? { id: cursor } : undefined;

    // Verify user has secure folder setup
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { securePin: true },
    });
    
    if (!user?.securePin) {
      return NextResponse.json({ error: "Secure folder not setup" }, { status: 400 });
    }

    const nodes = await prisma.node.findMany({
      take, skip, cursor: cursorObj,
      where: {
        userId,
        isSecure: true,
        trashedAt: null,
      },
      orderBy: { createdAt: "desc" },
    });

    let nextCursor: string | null = null;
    
    if (nodes.length > limit) {
      const nextItem = nodes.pop();
      nextCursor = nextItem!.id;
    }

    const folders = await prisma.node.findMany({
      where: {
        userId,
        type: "FOLDER",
        trashedAt: null,
      },
    });

    // We don't bother with recursive folder sizes for secure folder for simplicity,
    // or we can just fetch all stats for secure files.
    const fileStats = await prisma.node.groupBy({
      by: ['parentId'],
      where: {
        userId,
        type: "FILE",
        trashedAt: null,
        isSecure: true,
        parentId: { not: null }
      },
      _sum: {
        sizeBytes: true,
      },
    });

    const folderSizes = new Map<string, bigint>();
    const addSizeToFolder = (folderId: string, size: bigint) => {
      let currentId: string | null = folderId;
      while (currentId) {
        const currentSize = folderSizes.get(currentId) || BigInt(0);
        folderSizes.set(currentId, currentSize + size);
        const folder = folders.find((f: any) => f.id === currentId);
        currentId = folder ? folder.parentId : null;
      }
    };

    for (const stat of fileStats) {
      if (stat.parentId && stat._sum.sizeBytes) {
        addSizeToFolder(stat.parentId, BigInt(stat._sum.sizeBytes.toString()));
      }
    }

    const serializedNodes = nodes.map((n: any) => ({
      ...n,
      sizeBytes: n.type === "FOLDER"
        ? (folderSizes.get(n.id) || BigInt(0)).toString()
        : (n.sizeBytes ? n.sizeBytes.toString() : null),
      url: n.r2Key ? `/api/media/download?key=${encodeURIComponent(n.r2Key)}` : null,
    }));

    const serializedFolders = folders.map((f: any) => ({
      ...f,
      sizeBytes: (folderSizes.get(f.id) || BigInt(0)).toString(),
    }));

    return NextResponse.json({
      nodes: serializedNodes,
      folders: serializedFolders,
      nextCursor,
    });
  } catch (error) {
    console.error("Nodes Secure GET error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
