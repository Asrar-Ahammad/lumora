import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { generatePresignedPutUrl } from "@/lib/r2";

// Use edge runtime for streaming large files without the 4.5MB serverless payload limit
export const runtime = "edge";

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

    // Generate a presigned URL internally
    const url = await generatePresignedPutUrl(key, mimeType, Number(req.headers.get("content-length")) || 0);

    // Stream the body directly to R2!
    // Using fetch with duplex: 'half' allows streaming a ReadableStream body directly
    const r2Response = await fetch(url, {
      method: "PUT",
      headers: {
        "Content-Type": mimeType,
      },
      body: req.body,
      // @ts-expect-error: Undocumented fetch duplex property for streaming
      duplex: "half", 
    });

    if (!r2Response.ok) {
      const errorText = await r2Response.text();
      console.error("R2 Proxy Upload Error:", errorText);
      return NextResponse.json({ error: `R2 upload failed: ${r2Response.status}` }, { status: r2Response.status });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Proxy upload error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
