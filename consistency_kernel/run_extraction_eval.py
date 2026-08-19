"""Run the prose->event extraction benchmark against the real Claude API.

This is the piece that fills the one gap the kernel can't: it measures how
accurately an LLM turns prose into the structured events the kernel enforces.
It is meant to run in GitHub Actions (which has network access) using a repo
secret -- see .github/workflows/extraction-eval.yml -- because the dev sandbox
has no model access.

It reuses the offline harness verbatim (`evaluate(...)` over the hand-labelled
`GOLD` set), so the number it prints is directly comparable to the regex
baseline's F1. No accuracy figure is hard-coded anywhere; this computes it.

Usage (locally or in CI, with ANTHROPIC_API_KEY set):
    python -m consistency_kernel.run_extraction_eval
Optional: ANTHROPIC_MODEL (default claude-opus-4-8).
"""
from __future__ import annotations

import os
from typing import Any

from .extraction import (
    ProseExtractor, ExtractionResult, RegexBaselineExtractor,
    evaluate, GOLD, EXTRACTION_SYSTEM_PROMPT,
)

# Structured-output schema: force the model to return {"events": [[...], ...]}
# so the response is always parseable. The kernel grammar is enforced afterwards
# by ProseExtractor.parse (fail-closed), not by this schema.
EVENTS_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "events": {
            "type": "array",
            "items": {"type": "array", "items": {"type": "string"}},
        }
    },
    "required": ["events"],
    "additionalProperties": False,
}

DEFAULT_MODEL = "claude-opus-4-8"


class ClaudeExtractor:
    """Adapts a Claude API client to the `.extract(prose) -> ExtractionResult`
    interface the eval harness expects."""

    def __init__(self, client: Any, model: str = DEFAULT_MODEL) -> None:
        self._client = client
        self._model = model
        self._parser = ProseExtractor()        # used only for fail-closed parsing

    def extract(self, prose: str) -> ExtractionResult:
        resp = self._client.messages.create(
            model=self._model,
            max_tokens=2048,
            # Stable instructions go in `system` with a cache breakpoint. (The
            # prompt is short, so it may sit below the model's cacheable minimum
            # and not actually cache -- the marker is correct regardless.)
            system=[{
                "type": "text",
                "text": EXTRACTION_SYSTEM_PROMPT,
                "cache_control": {"type": "ephemeral"},
            }],
            messages=[{"role": "user", "content": f"PASSAGE:\n{prose}\n\nJSON:"}],
            output_config={"format": {"type": "json_schema", "schema": EVENTS_SCHEMA}},
        )
        text = next((b.text for b in resp.content if b.type == "text"), "")
        return self._parser.parse(text)


def main() -> int:
    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("ERROR: ANTHROPIC_API_KEY is not set.\n"
              "Add it as a GitHub Actions secret (Settings -> Secrets and "
              "variables -> Actions -> New repository secret) named "
              "ANTHROPIC_API_KEY, then run the 'extraction-eval' workflow.")
        return 2

    try:
        import anthropic
    except ImportError:
        print("ERROR: the 'anthropic' package is not installed. "
              "Run: pip install anthropic")
        return 2

    model = os.environ.get("ANTHROPIC_MODEL", DEFAULT_MODEL)
    client = anthropic.Anthropic()           # reads ANTHROPIC_API_KEY from env

    print("=" * 70)
    print(f"PROSE -> EVENT EXTRACTION  (real LLM: {model})")
    print("=" * 70)

    baseline = evaluate(RegexBaselineExtractor(), GOLD)
    llm = evaluate(ClaudeExtractor(client, model), GOLD)

    print(f"  gold examples : {llm['examples']}")
    print(f"  regex baseline F1 : {baseline['f1']*100:5.1f}%  "
          f"(P {baseline['precision']*100:.0f} / R {baseline['recall']*100:.0f})")
    print(f"  Claude  ({model}) F1 : {llm['f1']*100:5.1f}%  "
          f"(P {llm['precision']*100:.0f} / R {llm['recall']*100:.0f})  "
          f"tp={llm['tp']} fp={llm['fp']} fn={llm['fn']}")
    print("-" * 70)
    delta = llm["f1"] - baseline["f1"]
    print(f"  LLM beats regex floor by {delta*100:+.1f} F1 points")
    if llm["f1"] >= 0.90:
        verdict = "STRONG: extraction is reliable enough to trust the kernel's guarantees."
    elif llm["f1"] >= 0.80:
        verdict = "OK-ish: usable, but extraction errors will leak into the graph."
    else:
        verdict = "WEAK: garbage-in risk is real; fix extraction before shipping."
    print(f"  Verdict: {verdict}")
    print("  NOTE: gold set is small (12). Treat this as a smoke signal, not a")
    print("        publishable number -- expand GOLD for a meaningful figure.")
    print("=" * 70)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
