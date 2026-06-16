import { NextRequest, NextResponse } from "next/server";
import { BOOK_TYPES, generateBibleUpdatePrompt, type BookConfig } from "@/lib/rush-engine/engine";
import { authorizeRush } from "@/lib/server/rush";

export const maxDuration = 120;

interface DigestBody {
  config: BookConfig;
  storyBible?: string;
  chapterNumber: number;
  chapterContent: string;
}

export async function POST(request: NextRequest) {
  const auth = await authorizeRush();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: DigestBody;
  try {
    body = (await request.json()) as DigestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { config, storyBible, chapterNumber, chapterContent } = body;
  if (!config || !(config.type in BOOK_TYPES) || typeof chapterContent !== "string" || !chapterContent.trim()) {
    return NextResponse.json({ error: "config and chapterContent are required" }, { status: 400 });
  }

  try {
    // Cheap continuity-tracking model — keeps cost low relative to the main writer.
    const response = await auth.client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 1200,
      messages: [
        {
          role: "user",
          content: generateBibleUpdatePrompt(config, storyBible ?? "", chapterNumber, chapterContent),
        },
      ],
    });

    const text = response.content.find((b) => b.type === "text");
    const bible = text && text.type === "text" ? text.text.trim() : storyBible ?? "";
    return NextResponse.json({ bible });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Digest failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
