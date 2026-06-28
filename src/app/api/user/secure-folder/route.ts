import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";
import { revalidateTag } from "next/cache";

const hashString = (str: string) => {
  return crypto.createHash("sha256").update(str).digest("hex");
};

// GET: Check if secure folder is setup
export async function GET(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { securePin: true, securityQuestion: true },
    });

    if (!user) {
      return NextResponse.json({ setup: false });
    }

    return NextResponse.json({
      setup: !!user.securePin,
      question: user.securityQuestion || null,
    });
  } catch (error) {
    console.error("Secure folder GET error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// POST: Setup Secure Folder or Verify Password
export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { action, pin, securityQuestion, securityAnswer } = body;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (action === "setup") {
      if (user.securePin) {
        return NextResponse.json({ error: "Secure folder already setup" }, { status: 400 });
      }
      if (!pin || !securityQuestion || !securityAnswer) {
        return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
      }

      await prisma.user.update({
        where: { id: userId },
        data: {
          securePin: hashString(pin),
          securityQuestion,
          securityAnswer: hashString(securityAnswer.toLowerCase().trim()),
        },
      });

      return NextResponse.json({ success: true });
    } else if (action === "verify") {
      if (!user.securePin) {
        return NextResponse.json({ error: "Secure folder not setup" }, { status: 400 });
      }
      if (!pin) {
        return NextResponse.json({ error: "Missing pin" }, { status: 400 });
      }

      const isValid = user.securePin === hashString(pin);
      return NextResponse.json({ success: isValid });
    } else if (action === "change_password") {
      const { oldPin, newPin } = body;
      if (!user.securePin) {
        return NextResponse.json({ error: "Secure folder not setup" }, { status: 400 });
      }
      if (user.securePin !== hashString(oldPin)) {
        return NextResponse.json({ error: "Incorrect old password" }, { status: 400 });
      }
      await prisma.user.update({
        where: { id: userId },
        data: { securePin: hashString(newPin) },
      });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("Secure folder POST error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// PUT: Reset Password via Security Question
export async function PUT(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { answer, newPin } = body;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.securityAnswer) {
      return NextResponse.json({ error: "Secure folder or security question not setup" }, { status: 400 });
    }

    if (user.securityAnswer !== hashString(answer.toLowerCase().trim())) {
      return NextResponse.json({ error: "Incorrect security answer" }, { status: 400 });
    }

    await prisma.user.update({
      where: { id: userId },
      data: { securePin: hashString(newPin) },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Secure folder PUT error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// DELETE: Hard Reset
export async function DELETE(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Delete all secure nodes
    await prisma.node.deleteMany({
      where: {
        userId,
        isSecure: true,
      },
    });

    // Clear user secure settings
    await prisma.user.update({
      where: { id: userId },
      data: {
        securePin: null,
        securityQuestion: null,
        securityAnswer: null,
      },
    });

    revalidateTag(`user-nodes-${userId}`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Secure folder DELETE error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
