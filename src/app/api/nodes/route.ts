import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { unstable_cache, revalidateTag } from "next/cache";

const getNodes = async (userId: string, category: string | null, parentId: string | null, cursor: string | null, limit: number) => {
  const take = limit + 1;
  const skip = cursor ? 1 : 0;
  const cursorObj = cursor ? { id: cursor } : undefined;

  if (category) {
    if (category === "documents") {
      return await prisma.node.findMany({
        take, skip, cursor: cursorObj,
        where: {
          userId,
          type: "FILE",
          trashedAt: null,
          NOT: [
            { mimeType: { startsWith: "image/" } },
            { mimeType: { startsWith: "video/" } },
            { mimeType: { startsWith: "audio/" } },
          ],
        },
        orderBy: { createdAt: "desc" },
      });
    } else if (category === "photos" || category === "media") {
      return await prisma.node.findMany({
        take, skip, cursor: cursorObj,
        where: {
          userId,
          type: "FILE",
          trashedAt: null,
          mimeType: { startsWith: "image/" },
        },
        orderBy: { createdAt: "desc" },
      });
    } else if (category === "videos") {
      return await prisma.node.findMany({
        take, skip, cursor: cursorObj,
        where: {
          userId,
          type: "FILE",
          trashedAt: null,
          mimeType: { startsWith: "video/" },
        },
        orderBy: { createdAt: "desc" },
      });
    } else if (category === "audio") {
      return await prisma.node.findMany({
        take, skip, cursor: cursorObj,
        where: {
          userId,
          type: "FILE",
          trashedAt: null,
          mimeType: { startsWith: "audio/" },
        },
        orderBy: { createdAt: "desc" },
      });
    } else if (category === "starred") {
      return await prisma.node.findMany({
        take, skip, cursor: cursorObj,
        where: {
          userId,
          starred: true,
          trashedAt: null,
        },
        orderBy: { createdAt: "desc" },
      });
    } else {
      // all files/folders (excluding trash)
      return await prisma.node.findMany({
        take, skip, cursor: cursorObj,
        where: { userId, trashedAt: null },
        orderBy: { createdAt: "desc" },
      });
    }
  } else if (parentId) {
    return await prisma.node.findMany({
      take, skip, cursor: cursorObj,
      where: {
        userId,
        parentId,
        trashedAt: null,
      },
      orderBy: { createdAt: "desc" },
    });
  }
  return [];
};

const getFolders = async (userId: string) => {
  return await prisma.node.findMany({
    where: {
      userId,
      type: "FOLDER",
      trashedAt: null,
    },
  });
};

const getFileStats = async (userId: string) => {
  return await prisma.node.groupBy({
    by: ['parentId'],
    where: {
      userId,
      type: "FILE",
      trashedAt: null,
      parentId: { not: null }
    },
    _sum: {
      sizeBytes: true,
    },
  });
};

export async function GET(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const parentId = searchParams.get("parentId");
    const category = searchParams.get("category");
    const cursor = searchParams.get("cursor");
    const limit = parseInt(searchParams.get("limit") || "50", 10);

    if (!category && !parentId) {
      return NextResponse.json({ error: "Missing parentId or category" }, { status: 400 });
    }

    const nodes = await getNodes(userId, category, parentId, cursor, limit);
    let nextCursor: string | null = null;
    
    if (nodes.length > limit) {
      const nextItem = nodes.pop();
      nextCursor = nextItem!.id;
    }

    const folders = await getFolders(userId);
    const fileStats = await getFileStats(userId);

    // Compute folder sizes recursively using aggregated stats
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
    console.error("Nodes GET error:", error);
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
    const {
      parentId,
      type,
      nameEnc,
      nameIV,
      nodeKeyEnc,
      nodeKeyIV,
      mimeType,
      sizeBytes,
      r2Key,
      captionEnc,
      captionIV,
      embedding,
    } = body;

    if (!type || !nameEnc || !nameIV || !nodeKeyEnc || !nodeKeyIV) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Ensure User exists
    await prisma.user.upsert({
      where: { id: userId },
      update: {},
      create: { id: userId },
    });

    const newNode = await prisma.node.create({
      data: {
        userId,
        parentId: parentId || null,
        type,
        nameEnc,
        nameIV,
        nodeKeyEnc,
        nodeKeyIV,
        mimeType,
        sizeBytes: sizeBytes ? BigInt(sizeBytes) : null,
        r2Key,
        captionEnc,
        captionIV,
        aiProcessed: !!embedding,
      },
    });

    if (embedding && Array.isArray(embedding)) {
      const embeddingStr = `[${embedding.join(",")}]`;
      await prisma.$executeRaw`
        UPDATE "Node"
        SET "embedding" = ${embeddingStr}::vector
        WHERE id = ${newNode.id}
      `;
    }

    revalidateTag(`user-nodes-${userId}`);

    return NextResponse.json({
      node: {
        ...newNode,
        sizeBytes: newNode.sizeBytes ? newNode.sizeBytes.toString() : null,
      },
    });
  } catch (error) {
    console.error("Node create POST error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// Soft delete: move to trash by setting trashedAt
export async function DELETE(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Missing node ID" }, { status: 400 });
    }

    const node = await prisma.node.findUnique({
      where: { id },
    });

    if (!node || node.userId !== userId) {
      return NextResponse.json({ error: "Node not found or unauthorized" }, { status: 404 });
    }

    if (node.parentId === null) {
      return NextResponse.json({ error: "Cannot delete the Root folder" }, { status: 400 });
    }

    // Soft delete: set trashedAt timestamp (also cascade-soft-delete children)
    const now = new Date();
    await prisma.node.updateMany({
      where: {
        userId,
        OR: [
          { id },
          // Also mark all descendant nodes as trashed
          { parentId: id },
        ],
      },
      data: { trashedAt: now },
    });

    // For folders, recursively soft-delete all descendants
    if (node.type === "FOLDER") {
      await softDeleteDescendants(id, userId, now);
    }

    revalidateTag(`user-nodes-${userId}`);
    revalidateTag(`user-trash-${userId}`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Node DELETE error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// Rename node: update encrypted name fields
export async function PATCH(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Missing node ID" }, { status: 400 });
    }

    const body = await req.json();
    const { nameEnc, nameIV, starred } = body;

    const updateData: any = {};
    if (nameEnc !== undefined && nameIV !== undefined) {
      updateData.nameEnc = nameEnc;
      updateData.nameIV = nameIV;
    }
    if (starred !== undefined) {
      updateData.starred = starred;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: "Missing required fields to update" }, { status: 400 });
    }

    const node = await prisma.node.findUnique({
      where: { id },
    });

    if (!node || node.userId !== userId) {
      return NextResponse.json({ error: "Node not found or unauthorized" }, { status: 404 });
    }

    const updatedNode = await prisma.node.update({
      where: { id },
      data: updateData,
    });

    revalidateTag(`user-nodes-${userId}`);

    return NextResponse.json({
      node: {
        ...updatedNode,
        sizeBytes: updatedNode.sizeBytes ? updatedNode.sizeBytes.toString() : null,
      },
    });
  } catch (error) {
    console.error("Node PATCH error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// Recursively soft-delete all descendants of a folder
async function softDeleteDescendants(folderId: string, userId: string, now: Date) {
  const children = await prisma.node.findMany({
    where: { parentId: folderId, userId },
    select: { id: true, type: true },
  });

  for (const child of children) {
    await prisma.node.update({
      where: { id: child.id },
      data: { trashedAt: now },
    });
    if (child.type === "FOLDER") {
      await softDeleteDescendants(child.id, userId, now);
    }
  }
}
