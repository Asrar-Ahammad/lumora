import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Aggregate total storage grouped by mimeType
    const storageData = await prisma.node.groupBy({
      by: ['mimeType'],
      where: {
        userId,
        type: "FILE",
        trashedAt: null,
      },
      _sum: {
        sizeBytes: true,
      },
    });

    let docs = 0;
    let media = 0;
    let audio = 0;
    let archive = 0;

    for (const group of storageData) {
      const size = group._sum.sizeBytes ? Number(group._sum.sizeBytes) : 0;
      const mime = group.mimeType ? group.mimeType.toLowerCase() : "";

      if (mime.startsWith("image/") || mime.startsWith("video/")) {
        media += size;
      } else if (mime.startsWith("audio/")) {
        audio += size;
      } else if (
        mime.startsWith("text/") ||
        mime === "application/pdf" ||
        mime.includes("document") ||
        mime.includes("sheet") ||
        mime.includes("presentation") ||
        mime.includes("msword") ||
        mime.includes("wordprocessingml") ||
        mime.includes("spreadsheetml") ||
        mime.includes("powerpoint")
      ) {
        docs += size;
      } else {
        archive += size;
      }
    }

    const total = docs + media + audio + archive;

    return NextResponse.json({
      total,
      stats: { documents: docs, media, audio, archive } // Named documents to match state
    });
  } catch (error) {
    console.error("Storage Stats GET error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
