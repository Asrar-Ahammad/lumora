import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { r2Client, bucketName } from "@/lib/r2";
import { PutObjectCommand } from "@aws-sdk/client-s3";

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const key = searchParams.get("key");
    const mimeType = searchParams.get("mimeType");

    if (!key || !mimeType) {
      return NextResponse.json({ error: "Missing key or mimeType" }, { status: 400 });
    }

    // Ensure the key belongs to the current user (starts with userId/)
    if (!key.startsWith(`${userId}/`)) {
      return NextResponse.json({ error: "Unauthorized path" }, { status: 403 });
    }

    const arrayBuffer = await req.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
    });

    await r2Client.send(command);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Proxy upload error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
