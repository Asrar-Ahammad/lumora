import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import OpenAI from "openai";

const openai = new OpenAI();

function cleanAndLimitTags(aiOutput: string): string {
  // Remove common prefixes
  const cleaned = aiOutput.replace(/^(tags|keywords|labels|list):/i, "").trim();
  let tags: string[] = [];
  
  if (cleaned.includes("\n")) {
    tags = cleaned
      .split("\n")
      .map((line) => line.replace(/^[-*•\d\.\s]+/g, "").trim())
      .filter(Boolean);
  } else if (cleaned.includes(",")) {
    tags = cleaned.split(",").map((t) => t.trim()).filter(Boolean);
  } else {
    tags = cleaned.split(/\s+/).map((t) => t.trim()).filter(Boolean);
  }
  
  // Clean special characters (keep alphanumeric, space, hyphens)
  tags = tags.map(t => t.replace(/[^\w\s-]/g, "").trim()).filter(Boolean);
  
  // Return exactly at most 5 tags joined by commas
  return tags.slice(0, 5).join(", ");
}

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File;
    const filename = (formData.get("filename") as string) || file?.name || "file";

    if (!file) {
      return NextResponse.json({ error: "Missing file" }, { status: 400 });
    }

    let description = "";
    const mimeType = file.type;

    if (mimeType.startsWith("image/")) {
      // Image Vision tags generator
      const bytes = await file.arrayBuffer();
      const base64Image = Buffer.from(bytes).toString("base64");

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Generate exactly five descriptive single-word tags or short keywords for this image, separated by commas. Do not write full sentences, explanations, or descriptions. The filename is "${filename}".`,
              },
              { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64Image}` } },
            ],
          },
        ],
      });
      description = response.choices[0].message.content || "";
    } else if (
      mimeType.startsWith("text/") ||
      mimeType === "application/json" ||
      mimeType === "application/javascript" ||
      filename.endsWith(".md") ||
      filename.endsWith(".csv")
    ) {
      // Text content tags generator
      const text = await file.text();
      const snippet = text.slice(0, 4000); // limit to first 4000 chars

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "You are a helpful assistant that generates exactly five descriptive single-word tags or short keywords for search indexing.",
          },
          {
            role: "user",
            content: `Analyze this file snippet and generate exactly five descriptive single-word tags or short keywords summarizing its content, topic, and purpose, separated by commas. Do not write full sentences, explanations, or lists.
Filename: ${filename}
Mime Type: ${mimeType}

Content Snippet:
${snippet}`,
          },
        ],
      });
      description = response.choices[0].message.content || "";
    } else {
      // General document metadata tags generator
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "You are a helpful assistant that generates exactly five descriptive single-word tags or short keywords for search indexing.",
          },
          {
            role: "user",
            content: `Based on the following filename and file type, generate exactly five descriptive tags or short keywords that are relevant, separated by commas. Do not write full sentences, explanations, or lists.
Filename: ${filename}
Mime Type: ${mimeType}`,
          },
        ],
      });
      description = response.choices[0].message.content || "";
    }

    // Clean and enforce exactly 5 comma-separated tags
    const finalTags = cleanAndLimitTags(
      description || `file, ${filename.split(".").pop() || "unknown"}, document`
    );

    // Generate Text Embedding from filename and clean tags
    const embedInput = `${filename}, ${finalTags}`;
    const embedResp = await openai.embeddings.create({
      input: embedInput,
      model: "text-embedding-3-small",
    });
    const embedding = embedResp.data[0].embedding;

    return NextResponse.json({
      caption: finalTags,
      embedding,
    });
  } catch (error) {
    console.error("Transient processing error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
export const maxDuration = 60; // 60 seconds timeout for Vision API
