import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { generatePresignedGetUrl } from "@/lib/r2";

// Use edge runtime for streaming large files without serverless limits
export const runtime = "edge";

export async function GET(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const key = searchParams.get("key");

    if (!key) {
      return NextResponse.json({ error: "Missing key" }, { status: 400 });
    }

    // Ensure the key belongs to the current user (starts with userId/)
    if (!key.startsWith(`${userId}/`)) {
      return NextResponse.json({ error: "Unauthorized path" }, { status: 403 });
    }

    const presignedUrl = await generatePresignedGetUrl(key);

    // Fetch from R2 and stream it back to the client directly
    // This bypasses CORS because the server is doing the fetching
    const r2Response = await fetch(presignedUrl);

    if (!r2Response.ok) {
      return NextResponse.json({ error: `Failed to fetch from storage: ${r2Response.status}` }, { status: r2Response.status });
    }

    // Forward the response body and relevant headers (like Content-Type)
    return new NextResponse(r2Response.body, {
      status: r2Response.status,
      headers: {
        "Content-Type": r2Response.headers.get("content-type") || "application/octet-stream",
        "Content-Length": r2Response.headers.get("content-length") || "",
        "Cache-Control": "public, max-age=3600, immutable",
      },
    });
  } catch (error) {
    console.error("Download proxy error details:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

