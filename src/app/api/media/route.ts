import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const cursor = searchParams.get("cursor");
    const limit = 20;

    const media = await prisma.node.findMany({
      where: { 
        userId,
        type: "FILE",
        OR: [
          { mimeType: { startsWith: "image/" } },
          { mimeType: { startsWith: "video/" } },
        ],
      },
      take: limit + 1,
      cursor: cursor ? { id: cursor } : undefined,
      orderBy: { createdAt: "desc" },
    });

    let nextCursor: typeof cursor | undefined = undefined;
    if (media.length > limit) {
      const nextItem = media.pop();
      nextCursor = nextItem?.id;
    }

    const mediaWithUrls = media.map((m) => ({
      ...m,
      sizeBytes: m.sizeBytes ? m.sizeBytes.toString() : "0",
      url: m.r2Key ? `/api/media/download?key=${encodeURIComponent(m.r2Key)}` : "",
      encrypted: true,
      metadataEnc: m.nameEnc, // Map nameEnc to metadataEnc for compatibility
      metaIV: m.nameIV,       // Map nameIV to metaIV for compatibility
    }));

    return NextResponse.json({
      data: mediaWithUrls,
      nextCursor,
    });
  } catch (error) {
    console.error("Media API error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
