import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { r2Client, bucketName } from "@/lib/r2";
import { GetObjectCommand } from "@aws-sdk/client-s3";

export async function GET(req: Request) {
  try {
    const { userId } = await auth();
    console.log("Download Proxy Request:", { userId });
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const key = searchParams.get("key");
    console.log("Requested Key:", key);

    if (!key) {
      return NextResponse.json({ error: "Missing key" }, { status: 400 });
    }

    // Ensure the key belongs to the current user (starts with userId/)
    if (!key.startsWith(`${userId}/`)) {
      console.warn("Unauthorized path attempt:", { key, userId });
      return NextResponse.json({ error: "Unauthorized path" }, { status: 403 });
    }

    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: key,
    });

    const response = await r2Client.send(command);

    if (!response.Body) {
      return NextResponse.json({ error: "Object not found" }, { status: 404 });
    }

    // transformToWebStream is standard on Smithy/AWS SDK v3 streams
    const stream = response.Body.transformToWebStream();

    return new Response(stream, {
      headers: {
        "Content-Type": response.ContentType || "application/octet-stream",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    console.error("Download proxy error details:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
