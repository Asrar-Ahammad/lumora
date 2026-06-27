import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { generatePresignedPutUrl } from "@/lib/r2";
import crypto from "crypto";

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { mimeType, sizeBytes } = body;

    if (!mimeType || !sizeBytes) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Generate unique ID for the R2 key
    const mediaId = crypto.randomUUID();
    const ext = mimeType.split("/")[1] || "bin";
    const r2Key = `${userId}/${mediaId}.${ext}`;

    const presignedUrl = await generatePresignedPutUrl(r2Key, mimeType, sizeBytes);

    return NextResponse.json({
      presignedUrl,
      mediaId,
      r2Key,
    });
  } catch (error: any) {
    console.error("Upload init error:", error);
    return NextResponse.json({ error: error.message || String(error) }, { status: 500 });
  }
}
