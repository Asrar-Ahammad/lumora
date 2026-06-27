import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import OpenAI from "openai";

const openai = new OpenAI();

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File;
    const filename = formData.get("filename") as string || file?.name || "file";

    if (!file) {
      return NextResponse.json({ error: "Missing file" }, { status: 400 });
    }

    let description = `A file named "${filename}"`;
    const mimeType = file.type;

    if (mimeType.startsWith("image/")) {
      // Image Vision description
      const bytes = await file.arrayBuffer();
      const base64Image = Buffer.from(bytes).toString("base64");

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: `Describe this image in extreme detail for semantic search. The filename is "${filename}".` },
              { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64Image}` } },
            ],
          },
        ],
      });
      description = response.choices[0].message.content || description;
    } else if (
      mimeType.startsWith("text/") || 
      mimeType === "application/json" || 
      mimeType === "application/javascript" ||
      filename.endsWith(".md") ||
      filename.endsWith(".csv")
    ) {
      // Text content description
      const text = await file.text();
      const snippet = text.slice(0, 4000); // limit to first 4000 chars

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "You are a helpful assistant that generates a concise search description/summary for text-based files.",
          },
          {
            role: "user",
            content: `Analyze this file snippet and write a detailed description of its contents, topic, and purpose to enable semantic search. 
Filename: ${filename}
Mime Type: ${mimeType}

Content Snippet:
${snippet}`,
          },
        ],
      });
      description = response.choices[0].message.content || description;
    } else {
      // General document metadata description
      description = `A ${mimeType || "unknown type"} document named "${filename}" with size ${file.size} bytes.`;
    }

    // Generate Text Embedding
    const embedResp = await openai.embeddings.create({
      input: description,
      model: "text-embedding-3-small",
    });
    const embedding = embedResp.data[0].embedding;

    return NextResponse.json({
      caption: description,
      embedding,
    });
  } catch (error) {
    console.error("Transient processing error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
export const maxDuration = 60; // 60 seconds timeout for Vision API
