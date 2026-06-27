import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import OpenAI from "openai";

const openai = new OpenAI();

export async function GET(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const query = searchParams.get("q");
    if (!query) return NextResponse.json({ error: "Query required" }, { status: 400 });

    const embedResp = await openai.embeddings.create({
      input: query,
      model: "text-embedding-3-small",
    });
    const embedding = embedResp.data[0].embedding;
    const embeddingStr = `[${embedding.join(",")}]`;

    // Query nodes using pgvector similarity search
    const results = await prisma.$queryRaw`
      SELECT id, type, "mimeType", "r2Key", "nameEnc", "nameIV", "nodeKeyEnc", "nodeKeyIV", "parentId", "captionEnc", "captionIV", "sizeBytes", "createdAt"
      FROM "Node"
      WHERE "userId" = ${userId} AND "embedding" IS NOT NULL
      ORDER BY "embedding" <=> ${embeddingStr}::vector
      LIMIT 20;
    `;

    // Fetch all folders for cascade decryption
    const folders = await prisma.node.findMany({
      where: {
        userId,
        type: "FOLDER",
      },
    });

    const serializedResults = (results as any[]).map((r: any) => ({
      ...r,
      sizeBytes: r.sizeBytes ? r.sizeBytes.toString() : null,
      url: r.r2Key ? `/api/media/download?key=${encodeURIComponent(r.r2Key)}` : null,
    }));

    const serializedFolders = folders.map((f: any) => ({
      ...f,
      sizeBytes: f.sizeBytes ? f.sizeBytes.toString() : null,
    }));

    return NextResponse.json({
      nodes: serializedResults,
      folders: serializedFolders,
    });
  } catch (error) {
    console.error("Search API error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
