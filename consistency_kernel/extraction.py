"""Prose -> events extraction: the make-or-break (and unproven) layer.

The deterministic kernel can only enforce consistency over events it was *given*.
Turning natural-language prose into those events is the hard, probabilistic part
— it needs a real LLM, and its accuracy is exactly what decides whether the whole
product works. This module makes that layer:

  * **pluggable** — inject any ``llm_call(prompt) -> str`` (so you bring your own
    model / API key); nothing here takes a network dependency.
  * **fail-closed** — a malformed or off-grammar event is *dropped and counted*,
    never guessed. The extractor cannot invent an event the LLM didn't emit.
  * **measurable** — ``score`` / ``evaluate`` compute precision / recall / F1
    against a hand-labelled gold set, so "how good is extraction" is a number you
    run, not a claim. A deterministic regex baseline gives an offline floor.

IMPORTANT (honesty): no real-LLM accuracy number is asserted in this repo, because
this environment has no model access. Run ``evaluate`` with your own ``llm_call``
to get the real figure — that number, not the kernel's, gates the product.
"""
from __future__ import annotations

import json
import re
from collections import Counter
from dataclasses import dataclass, field
from typing import Callable, Optional

from .transaction import Event

__all__ = [
    "ExtractionResult", "ProseExtractor", "RegexBaselineExtractor",
    "GoldExample", "score", "evaluate", "GOLD", "EXTRACTION_SYSTEM_PROMPT",
]

# Verbs and their arity (including the verb slot itself).
_ARITY = {"die": 2, "act": 2, "place": 3, "learn": 3, "reference": 3}

EXTRACTION_SYSTEM_PROMPT = """\
You convert a passage of narrative prose into a list of state-changing events.
Use ONLY these event shapes (lowercase, snake_case ids):
  ["die", character]                 — a character dies
  ["act", character]                 — a character takes an action / speaks
  ["place", object, location]        — an object is put/moved to a location
  ["learn", character, fact]         — a character gains knowledge of a fact
  ["reference", character, fact]     — a character refers to a known fact
Respond with ONLY JSON: {"events": [ ... ]}. Emit no event you are unsure of;
omission is safer than invention. Do not include narration, only events."""


@dataclass
class ExtractionResult:
    events: list[Event]
    n_dropped: int = 0                       # off-grammar items the LLM emitted
    dropped_reasons: list[str] = field(default_factory=list)
    raw: str = ""


def _normalize(ev) -> Optional[Event]:
    """Coerce one raw item into a valid, lowercased event tuple, or None."""
    if not isinstance(ev, (list, tuple)) or not ev:
        return None
    parts = [str(x).strip().lower() for x in ev]
    verb = parts[0]
    if verb not in _ARITY or len(parts) != _ARITY[verb]:
        return None
    if any(not p for p in parts[1:]):        # empty argument
        return None
    return tuple(parts)


class ProseExtractor:
    """LLM-backed extractor. ``llm_call`` takes the full prompt and returns the
    model's raw string response (expected to be JSON)."""

    def __init__(self, llm_call: Optional[Callable[[str], str]] = None) -> None:
        self._llm = llm_call

    def build_prompt(self, prose: str) -> str:
        return f"{EXTRACTION_SYSTEM_PROMPT}\n\nPASSAGE:\n{prose}\n\nJSON:"

    def parse(self, raw: str) -> ExtractionResult:
        """Parse a raw LLM response into validated events. FAIL-CLOSED: anything
        unparseable or off-grammar is dropped and counted, not guessed."""
        try:
            data = json.loads(raw)
        except (json.JSONDecodeError, TypeError):
            return ExtractionResult([], 0, ["response was not valid JSON"], raw)
        items = data.get("events") if isinstance(data, dict) else data
        if not isinstance(items, list):
            return ExtractionResult([], 0, ["no 'events' list in response"], raw)
        events: list[Event] = []
        dropped: list[str] = []
        for item in items:
            ev = _normalize(item)
            if ev is None:
                dropped.append(f"off-grammar item dropped: {item!r}")
            else:
                events.append(ev)
        return ExtractionResult(events, len(dropped), dropped, raw)

    def extract(self, prose: str) -> ExtractionResult:
        if self._llm is None:
            raise RuntimeError(
                "ProseExtractor needs an llm_call; none was injected. "
                "Pass llm_call=... or use RegexBaselineExtractor for an "
                "offline floor.")
        return self.parse(self._llm(self.build_prompt(prose)))


class RegexBaselineExtractor:
    """A transparent, deterministic baseline — NOT the product. It exists to (a)
    let the eval harness run offline and (b) establish the floor the LLM must
    beat. It is deliberately simple; expect modest recall on natural prose, which
    is precisely the point: extraction is hard and needs the model."""

    _NAME = re.compile(r"\b([A-Z][a-z]+)\b")
    _DIE = re.compile(r"\b(died|dies|was killed|is dead|perished|was slain)\b")
    _ACT = re.compile(r"\b(acted|acts|spoke|speaks|stepped|fought)\b")
    _LEARN = re.compile(r"\b(learned|learnt|discovered|found out|realized)\b")
    _REF = re.compile(r"\b(referenced|mentioned|cited|recalled|spoke of)\b")
    _PLACE = re.compile(r"\b(placed|put|moved|set|hid)\b")
    _STOP = {"the", "a", "an", "of", "to", "in", "into", "on", "at", "about",
             "that", "her", "his", "their", "its", "from"}

    def _token(self, words: list[str]) -> Optional[str]:
        toks = [w for w in words if w not in self._STOP]
        return "_".join(toks[:3]) if toks else None

    def _after(self, low: str, verb_re: re.Pattern) -> Optional[str]:
        m = verb_re.search(low)
        if not m:
            return None
        tail = re.findall(r"[a-z_]+", low[m.end():])
        # skip leading stopwords, then take the noun phrase up to the next stopword
        i = 0
        while i < len(tail) and tail[i] in self._STOP:
            i += 1
        phrase = []
        while i < len(tail) and tail[i] not in self._STOP:
            phrase.append(tail[i]); i += 1
        return self._token(phrase)

    def extract(self, prose: str) -> ExtractionResult:
        events: list[Event] = []
        for sentence in re.split(r"[.!?]", prose):
            s = sentence.strip()
            if not s:
                continue
            low = s.lower()
            names = self._NAME.findall(s)
            name = names[0].lower() if names else None
            if name and self._DIE.search(low):
                events.append(("die", name))
            elif name and self._LEARN.search(low):
                fact = self._after(low, self._LEARN)
                if fact:
                    events.append(("learn", name, fact))
            elif name and self._REF.search(low):
                fact = self._after(low, self._REF)
                if fact:
                    events.append(("reference", name, fact))
            elif self._PLACE.search(low):
                obj = self._after(low, self._PLACE)
                loc_m = re.search(r"\b(?:in|to|into|on|at)\s+the\s+([a-z_ ]+)", low)
                loc = self._token(loc_m.group(1).split()) if loc_m else None
                if obj and loc:
                    events.append(("place", obj, loc))
            elif name and self._ACT.search(low):
                events.append(("act", name))
        return ExtractionResult(events, 0, [], prose)


# ── evaluation ───────────────────────────────────────────────────────────
@dataclass(frozen=True)
class GoldExample:
    prose: str
    events: tuple[Event, ...]


def score(predicted: list[Event], gold: list[Event]) -> dict:
    """Multiset precision / recall / F1 over exact event tuples."""
    p, g = Counter(predicted), Counter(gold)
    tp = sum((p & g).values())
    fp = sum(p.values()) - tp
    fn = sum(g.values()) - tp
    precision = tp / (tp + fp) if (tp + fp) else 1.0
    recall = tp / (tp + fn) if (tp + fn) else 1.0
    f1 = (2 * precision * recall / (precision + recall)
          if (precision + recall) else 0.0)
    return {"tp": tp, "fp": fp, "fn": fn,
            "precision": precision, "recall": recall, "f1": f1}


def evaluate(extractor, gold: list[GoldExample]) -> dict:
    """Aggregate (micro-averaged) precision/recall/F1 of an extractor over a gold
    set. ``extractor`` is anything with ``.extract(prose) -> ExtractionResult``."""
    tp = fp = fn = 0
    for ex in gold:
        pred = extractor.extract(ex.prose).events
        s = score(pred, list(ex.events))
        tp += s["tp"]; fp += s["fp"]; fn += s["fn"]
    precision = tp / (tp + fp) if (tp + fp) else 1.0
    recall = tp / (tp + fn) if (tp + fn) else 1.0
    f1 = (2 * precision * recall / (precision + recall)
          if (precision + recall) else 0.0)
    return {"examples": len(gold), "tp": tp, "fp": fp, "fn": fn,
            "precision": precision, "recall": recall, "f1": f1}


# A small hand-labelled gold set (natural prose -> canonical events).
GOLD: list[GoldExample] = [
    GoldExample("Alice died in the battle for the keep.",
                (("die", "alice"),)),
    GoldExample("Bob was killed by the assassin at dawn.",
                (("die", "bob"),)),
    GoldExample("Carol discovered the betrayal among the council.",
                (("learn", "carol", "betrayal"),)),
    GoldExample("Dane learned the secret of the old well.",
                (("learn", "dane", "secret"),)),
    GoldExample("The steward placed the dagger in the great hall.",
                (("place", "dagger", "great_hall"),)),
    GoldExample("A servant moved the crown to the vault.",
                (("place", "crown", "vault"),)),
    GoldExample("Erin mentioned the prophecy to the visiting envoy.",
                (("reference", "erin", "prophecy"),)),
    GoldExample("Finn recalled the warning from his mother.",
                (("reference", "finn", "warning"),)),
    GoldExample("Greta spoke before the assembled lords.",
                (("act", "greta"),)),
    GoldExample("Rain fell softly over the quiet harbour.",
                ()),
    GoldExample("Hugo learned the password, then placed the key in the chest.",
                (("learn", "hugo", "password"), ("place", "key", "chest"))),
    GoldExample("After the duel, Iris perished and the sword was set on the altar.",
                (("die", "iris"), ("place", "sword", "altar"))),
]


def main() -> None:
    print("=" * 70)
    print("PROSE -> EVENT EXTRACTION  (offline regex BASELINE — not the product)")
    print("=" * 70)
    result = evaluate(RegexBaselineExtractor(), GOLD)
    print(f"  gold examples : {result['examples']}")
    print(f"  precision     : {result['precision']*100:5.1f}%")
    print(f"  recall        : {result['recall']*100:5.1f}%")
    print(f"  F1            : {result['f1']*100:5.1f}%   "
          f"(tp={result['tp']} fp={result['fp']} fn={result['fn']})")
    print("-" * 70)
    print("This is the DETERMINISTIC FLOOR on natural prose. The real product")
    print("needs an LLM extractor; plug llm_call into ProseExtractor and run the")
    print("same evaluate(...) to get its number. That number gates the product —")
    print("no LLM accuracy is claimed here (this environment has no model access).")
    print("=" * 70)


if __name__ == "__main__":
    main()
