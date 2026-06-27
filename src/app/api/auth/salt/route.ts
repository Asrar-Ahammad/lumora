import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import crypto from "crypto";

export async function GET(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const pepper = process.env.ENCRYPTION_PEPPER;
    if (!pepper) {
      console.error("Missing ENCRYPTION_PEPPER");
      return NextResponse.json({ error: "Server Configuration Error" }, { status: 500 });
    }

    const { searchParams } = new URL(req.url);
    const targetId = searchParams.get("targetId") || userId;

    // The salt is a deterministic HMAC of the targetId and the server pepper.
    const salt = crypto.createHmac("sha256", pepper).update(targetId).digest("hex");
    
    return NextResponse.json({ salt });
  } catch (error) {
    console.error("Salt API error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
