"""Long-run consistency stress test — turning the "no memory decay" claim into
a measured, reproducible number instead of an architectural assertion.

The thesis under test: a deterministic graph that holds full state should detect
a contradiction at chapter 300 exactly as reliably as at chapter 1, whereas a
context-window / RAG-style approach that only "remembers" the last W chapters
will (a) MISS old violations (a character who died long ago acts again) and
(b) INVENT false ones (flagging a valid reference whose establishing fact has
scrolled out of the window). This module measures both, with no LLM involved.

It also includes the honest counter-weight the marketing version omits: if the
establishing event is never extracted into the graph, the graph misses the
violation too — "never forgets" is conditional on correct extraction
(garbage-in, garbage-forever).
"""
from __future__ import annotations

import random
from dataclasses import dataclass

from .transaction import Event, WorldState

__all__ = ["Probe", "generate_story", "evaluate", "run_comparison"]


@dataclass(frozen=True)
class Probe:
    """A single thing we test the checker on, planted at a known distance from
    its establishing event."""
    establish_chapter: int
    probe_chapter: int
    distance: int
    kind: str            # "dead_acts" (truly invalid) | "old_reference" (truly valid)
    establish: Event     # the event that sets up the state
    probe: Event         # the event we ask the checker to judge
    is_violation: bool   # ground truth: should this be flagged?


def generate_story(n_chapters: int = 300, n_probes: int = 40,
                   seed: int = 0) -> list[Probe]:
    """Build a synthetic story: ``n_probes`` establish/probe pairs whose distances
    are spread evenly from short range up to nearly the full length. Each pair
    uses fresh character/fact names so the probes never interfere."""
    rng = random.Random(seed)
    probes: list[Probe] = []
    span = max(1, n_chapters - 6)
    for i in range(n_probes):
        # distances spread linearly across the story length
        distance = 3 + round(span * i / max(1, n_probes - 1))
        distance = min(distance, n_chapters - 2)
        establish_chapter = rng.randint(0, n_chapters - 1 - distance)
        probe_chapter = establish_chapter + distance
        if i % 2 == 0:
            # A character dies, then "acts" `distance` chapters later -> INVALID.
            char = f"char_d{i}"
            probes.append(Probe(
                establish_chapter, probe_chapter, distance, "dead_acts",
                ("die", char), ("act", char), is_violation=True))
        else:
            # A character learns a fact, then validly references it later -> VALID.
            # A forgetful window will wrongly flag this once the `learn` scrolls out.
            char, fact = f"char_k{i}", f"fact_k{i}"
            probes.append(Probe(
                establish_chapter, probe_chapter, distance, "old_reference",
                ("learn", char, fact), ("reference", char, fact),
                is_violation=False))
    return probes


def _state_within_window(probes: list[Probe], current_chapter: int,
                         window: int | None) -> WorldState:
    """Rebuild a world from only the establishing events that fall inside the
    memory window ``(current_chapter - window, current_chapter]``. ``window=None``
    means infinite memory (the full graph)."""
    state = WorldState()
    lo = -1 if window is None else current_chapter - window
    establishes: list[tuple[int, Event]] = sorted(
        ((p.establish_chapter, p.establish) for p in probes),
        key=lambda t: t[0])
    for chapter, event in establishes:
        if chapter > lo and chapter <= current_chapter:
            state.commit_scene([event])
    return state


def evaluate(probes: list[Probe], window: int | None) -> dict:
    """Run every probe through a checker with the given memory ``window`` and
    score it against ground truth. Returns detection / false-positive rates and
    per-distance detail."""
    results = []
    for p in probes:
        state = _state_within_window(probes, p.probe_chapter, window)
        committed, _ = state.commit_scene([p.probe])
        flagged = not committed
        results.append((p.distance, p.is_violation, flagged))

    viol = [(d, f) for d, gt, f in results if gt]
    valid = [(d, f) for d, gt, f in results if not gt]
    caught = sum(1 for _d, f in viol if f)
    false_pos = sum(1 for _d, f in valid if f)
    return {
        "window": window,
        "violations_total": len(viol),
        "violations_caught": caught,
        "detection_rate": caught / len(viol) if viol else 1.0,
        "valid_total": len(valid),
        "false_positives": false_pos,
        "false_positive_rate": false_pos / len(valid) if valid else 0.0,
        # missed violations and false positives, by distance (for the table)
        "missed_at": sorted(d for d, f in viol if not f),
        "false_pos_at": sorted(d for d, f in valid if f),
    }


def run_comparison(n_chapters: int = 300, n_probes: int = 40,
                   window: int = 20, seed: int = 0) -> dict:
    """Head-to-head: full graph (infinite memory) vs a context-window baseline."""
    probes = generate_story(n_chapters, n_probes, seed)
    return {
        "n_chapters": n_chapters,
        "graph": evaluate(probes, window=None),
        "window": evaluate(probes, window=window),
    }


def main() -> None:
    print("=" * 70)
    print("LONG-RUN CONSISTENCY STRESS TEST  (no LLM — deterministic state only)")
    print("=" * 70)
    for n in (50, 300, 1000):
        r = run_comparison(n_chapters=n, n_probes=40, window=20)
        g, w = r["graph"], r["window"]
        print(f"\nStory length: {n} chapters   (context window baseline = 20 chapters)")
        print(f"  Full graph   : detect {g['detection_rate']*100:5.1f}% | "
              f"false-positive {g['false_positive_rate']*100:5.1f}%")
        print(f"  Window(20)   : detect {w['detection_rate']*100:5.1f}% | "
              f"false-positive {w['false_positive_rate']*100:5.1f}%")
        if w["missed_at"]:
            print(f"     window MISSED violations at distances: {w['missed_at']}")
        if w["false_pos_at"]:
            print(f"     window FALSE-flagged valid refs at distances: "
                  f"{w['false_pos_at']}")
    print("\n" + "-" * 70)
    print("Honest bound: this proves consistency of STRUCTURED STATE that was")
    print("correctly recorded. It does NOT prove prose quality, nor that the")
    print("upstream prose->event extraction is correct (that needs a real LLM).")
    print("=" * 70)


if __name__ == "__main__":
    main()
