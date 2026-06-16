import { NextRequest, NextResponse } from "next/server";
import {
  BOOK_TYPES,
  buildArchitecture,
  generateChapterPrompt,
  generateMasterSystemPrompt,
  generateRevisionPrompt,
  type BookConfig,
} from "@/lib/rush-engine/engine";
import { authorizeRush } from "@/lib/server/rush";
import { incrementUsageDay } from "@/lib/server/usage";

// Streaming chapter generation can run long — give it room.
export const maxDuration = 300;

interface WriteBody {
  config: BookConfig;
  chapterIndex: number;
  previousSummary?: string;
  storyBible?: string;
  mode?: "draft" | "revise";
  draft?: string;
  feedback?: string;
  revisionMode?: string;
}

function validateConfig(config: unknown): config is BookConfig {
  if (!config || typeof config !== "object") return false;
  const c = config as Record<string, unknown>;
  if (typeof c.type !== "string" || !(c.type in BOOK_TYPES)) return false;
  if (typeof c.chapters !== "number" || c.chapters < 1 || c.chapters > 100) return false;
  if (typeof c.wordsPerChapter !== "number" || c.wordsPerChapter < 1) return false;
  return true;
}

export async function POST(request: NextRequest) {
  const auth = await authorizeRush({ checkChapterLimit: true });
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: WriteBody;
  try {
    body = (await request.json()) as WriteBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { config, chapterIndex, previousSummary, storyBible, mode, draft, feedback, revisionMode } = body;
  if (!validateConfig(config)) {
    return NextResponse.json({ error: "Invalid book config" }, { status: 400 });
  }

  const architecture = buildArchitecture(config);
  if (typeof chapterIndex !== "number" || chapterIndex < 0 || chapterIndex >= architecture.chapters.length) {
    return NextResponse.json({ error: "chapterIndex out of range" }, { status: 400 });
  }

  const systemPrompt = generateMasterSystemPrompt(config, architecture);

  const isRevise = mode === "revise";
  if (isRevise && (!draft || !feedback)) {
    return NextResponse.json({ error: "revise mode requires draft and feedback" }, { status: 400 });
  }

  const userMessage = isRevise
    ? generateRevisionPrompt(config, draft as string, feedback as string, revisionMode || "polish", storyBible)
    : generateChapterPrompt(config, architecture, chapterIndex, { previousSummary, storyBible });

  // Output token budget scaled to target length (~1.8 tokens/word), with headroom.
  const maxTokens = Math.min(
    32000,
    Math.max(2000, Math.round((config.wordsPerChapter * 1.8) / 100) * 100 + 2000)
  );

  const { client, user } = auth;
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const llmStream = client.messages.stream({
          model: "claude-opus-4-8",
          max_tokens: maxTokens,
          thinking: { type: "adaptive" },
          system: [
            {
              type: "text",
              text: systemPrompt,
              // Cache the (stable) master system prompt across all chapters of this book.
              cache_control: { type: "ephemeral" },
            },
          ],
          messages: [{ role: "user", content: userMessage }],
        });

        llmStream.on("text", (text) => {
          controller.enqueue(encoder.encode(text));
        });

        await llmStream.finalMessage();
        // Meter on successful completion (draft and revise both consume a chapter unit).
        await incrementUsageDay({ userId: user.id, day: new Date(), field: "bookChapters" }).catch(() => {});
        controller.close();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Generation failed";
        controller.enqueue(encoder.encode(`\n\n[[RUSH_ERROR]] ${message}`));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}
