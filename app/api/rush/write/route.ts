import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import {
  BOOK_TYPES,
  buildArchitecture,
  generateChapterPrompt,
  generateMasterSystemPrompt,
  type BookConfig,
  type BookTypeKey,
} from "@/lib/rush-engine/engine";

// Streaming chapter generation can run long — give it room.
export const maxDuration = 300;

interface WriteBody {
  config: BookConfig;
  chapterIndex: number;
  previousSummary?: string;
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
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not configured on the server." },
      { status: 503 }
    );
  }

  let body: WriteBody;
  try {
    body = (await request.json()) as WriteBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { config, chapterIndex, previousSummary } = body;
  if (!validateConfig(config)) {
    return NextResponse.json({ error: "Invalid book config" }, { status: 400 });
  }

  const architecture = buildArchitecture(config);
  if (
    typeof chapterIndex !== "number" ||
    chapterIndex < 0 ||
    chapterIndex >= architecture.chapters.length
  ) {
    return NextResponse.json({ error: "chapterIndex out of range" }, { status: 400 });
  }

  const systemPrompt = generateMasterSystemPrompt(config, architecture);
  const chapterPrompt = generateChapterPrompt(config, architecture, chapterIndex, previousSummary);

  // Output token budget scaled to target length (~1.4 tokens/word), with headroom.
  const maxTokens = Math.min(
    32000,
    Math.max(2000, Math.round((config.wordsPerChapter * 1.8) / 100) * 100 + 2000)
  );

  const client = new Anthropic({ apiKey });

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
          messages: [{ role: "user", content: chapterPrompt }],
        });

        llmStream.on("text", (text) => {
          controller.enqueue(encoder.encode(text));
        });

        await llmStream.finalMessage();
        controller.close();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Generation failed";
        // Surface the error inside the stream so the client can show it.
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

// Lightweight metadata endpoint: returns the architecture for a config so the
// client can render the pipeline plan without duplicating engine logic.
export async function GET() {
  const types = Object.entries(BOOK_TYPES).map(([key, t]) => ({
    key: key as BookTypeKey,
    label: t.label,
    icon: t.icon,
  }));
  return NextResponse.json({ types });
}
