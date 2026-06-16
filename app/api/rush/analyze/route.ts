import { NextRequest, NextResponse } from "next/server";
import { BOOK_TYPES, generateAnalysisInstructions, type BookConfig } from "@/lib/rush-engine/engine";
import { authorizeRush } from "@/lib/server/rush";

export const maxDuration = 120;

interface AnalyzeBody {
  config: BookConfig;
  draft: string;
}

const ANALYSIS_SCHEMA = {
  type: "object" as const,
  properties: {
    overall_pass: { type: "boolean" },
    issues: { type: "array", items: { type: "string" } },
    revision_mode: {
      type: "string",
      enum: ["polish", "strengthen_evidence", "clarify", "restructure", "deepen", "rewrite"],
    },
    specific_fixes: { type: "array", items: { type: "string" } },
  },
  required: ["overall_pass", "issues", "revision_mode", "specific_fixes"],
  additionalProperties: false,
};

export interface AnalysisResult {
  overall_pass: boolean;
  issues: string[];
  revision_mode: string;
  specific_fixes: string[];
}

export async function POST(request: NextRequest) {
  const auth = await authorizeRush();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: AnalyzeBody;
  try {
    body = (await request.json()) as AnalyzeBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { config, draft } = body;
  if (!config || !(config.type in BOOK_TYPES) || typeof draft !== "string" || !draft.trim()) {
    return NextResponse.json({ error: "config and draft are required" }, { status: 400 });
  }

  try {
    const response = await auth.client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 2000,
      system: generateAnalysisInstructions(config),
      output_config: { format: { type: "json_schema", schema: ANALYSIS_SCHEMA } },
      messages: [{ role: "user", content: `═══ DRAFT TO ANALYZE ═══\n${draft}` }],
    });

    const text = response.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") {
      return NextResponse.json({ error: "No analysis returned" }, { status: 502 });
    }
    const result = JSON.parse(text.text) as AnalysisResult;
    return NextResponse.json({ result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Analysis failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
