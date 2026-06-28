import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { unstable_cache, revalidateTag } from "next/cache";

const r2 = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT!,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

const TRASH_TTL_DAYS = 30;

const getTrashNodes = async (userId: string, cursor: string | null, limit: number) => {
  const take = limit + 1;
  const skip = cursor ? 1 : 0;
  const cursorObj = cursor ? { id: cursor } : undefined;

  return await prisma.node.findMany({
    take, skip, cursor: cursorObj,
    where: {
      userId,
      trashedAt: { not: null },
    },
    orderBy: { trashedAt: "desc" },
  });
};

const getTrashFolders = async (userId: string) => {
  return await prisma.node.findMany({
    where: { userId, type: "FOLDER" },
  });
};

// GET /api/nodes/trash - list all trashed nodes
export async function GET(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const cursor = searchParams.get("cursor");
    const limit = parseInt(searchParams.get("limit") || "50", 10);

    // Auto-purge nodes that have been in trash > 30 days
    const cutoff = new Date(Date.now() - TRASH_TTL_DAYS * 24 * 60 * 60 * 1000);
    const expiredNodes = await prisma.node.findMany({
      where: {
        userId,
        trashedAt: { not: null, lte: cutoff },
      },
      select: { id: true, r2Key: true },
    });

    let purged = false;
    // Hard delete expired nodes (and delete R2 objects for files)
    for (const node of expiredNodes) {
      if (node.r2Key) {
        try {
          await r2.send(
            new DeleteObjectCommand({
              Bucket: process.env.R2_BUCKET_NAME!,
              Key: node.r2Key,
            })
          );
        } catch (err) {
          console.error("R2 delete failed for expired node", node.id, err);
        }
      }
      await prisma.node.delete({ where: { id: node.id } });
      purged = true;
    }

    if (purged) {
      revalidateTag(`user-nodes-${userId}`);
      revalidateTag(`user-trash-${userId}`);
    }

    // Fetch remaining trashed nodes
    const trashedNodes = await getTrashNodes(userId, cursor, limit);
    let nextCursor: string | null = null;
    
    if (trashedNodes.length > limit) {
      const nextItem = trashedNodes.pop();
      nextCursor = nextItem!.id;
    }

    // Fetch all folders (including trashed ones) for key cascade decryption
    const folders = await getTrashFolders(userId);

    const serialized = trashedNodes.map((n: any) => ({
      ...n,
      sizeBytes: n.sizeBytes ? n.sizeBytes.toString() : null,
      trashedAt: n.trashedAt ? n.trashedAt.toISOString() : null,
      deletesAt: n.trashedAt
        ? new Date(n.trashedAt.getTime() + TRASH_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString()
        : null,
      url: n.r2Key ? `/api/media/download?key=${encodeURIComponent(n.r2Key)}` : null,
    }));

    const serializedFolders = folders.map((f: any) => ({
      ...f,
      sizeBytes: f.sizeBytes ? f.sizeBytes.toString() : null,
    }));

    return NextResponse.json({ nodes: serialized, folders: serializedFolders, nextCursor });
  } catch (error) {
    console.error("Trash GET error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// PATCH /api/nodes/trash?id=…  - restore from trash
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

    const node = await prisma.node.findUnique({ where: { id } });
    if (!node || node.userId !== userId) {
      return NextResponse.json({ error: "Node not found or unauthorized" }, { status: 404 });
    }

    // Restore node (and its descendants)
    await prisma.node.update({ where: { id }, data: { trashedAt: null } });

    // Also restore all descendant nodes
    if (node.type === "FOLDER") {
      await restoreDescendants(id, userId);
    }

    revalidateTag(`user-nodes-${userId}`);
    revalidateTag(`user-trash-${userId}`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Trash PATCH (restore) error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// DELETE /api/nodes/trash?id=… - permanently delete a single node
// DELETE /api/nodes/trash?all=true - empty entire trash
export async function DELETE(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const all = searchParams.get("all");

    if (all === "true") {
      // Empty entire trash
      const trashedNodes = await prisma.node.findMany({
        where: { userId, trashedAt: { not: null } },
        select: { id: true, r2Key: true },
      });

      for (const node of trashedNodes) {
        if (node.r2Key) {
          try {
            await r2.send(
              new DeleteObjectCommand({
                Bucket: process.env.R2_BUCKET_NAME!,
                Key: node.r2Key,
              })
            );
          } catch (err) {
            console.error("R2 delete failed", node.id, err);
          }
        }
        await prisma.node.delete({ where: { id: node.id } });
      }

      revalidateTag(`user-nodes-${userId}`);
      revalidateTag(`user-trash-${userId}`);

      return NextResponse.json({ success: true, deleted: trashedNodes.length });
    }

    if (!id) {
      return NextResponse.json({ error: "Missing node ID or 'all' param" }, { status: 400 });
    }

    const node = await prisma.node.findUnique({ where: { id } });
    if (!node || node.userId !== userId) {
      return NextResponse.json({ error: "Node not found or unauthorized" }, { status: 404 });
    }

    // Delete R2 object if applicable
    if (node.r2Key) {
      try {
        await r2.send(
          new DeleteObjectCommand({
            Bucket: process.env.R2_BUCKET_NAME!,
            Key: node.r2Key,
          })
        );
      } catch (err) {
        console.error("R2 delete failed for node", id, err);
      }
    }

    // Hard delete (Prisma cascade handles children)
    await prisma.node.delete({ where: { id } });

    revalidateTag(`user-nodes-${userId}`);
    revalidateTag(`user-trash-${userId}`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Trash DELETE error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

async function restoreDescendants(folderId: string, userId: string) {
  const children = await prisma.node.findMany({
    where: { parentId: folderId, userId },
    select: { id: true, type: true },
  });
  for (const child of children) {
    await prisma.node.update({ where: { id: child.id }, data: { trashedAt: null } });
    if (child.type === "FOLDER") {
      await restoreDescendants(child.id, userId);
    }
  }
}
