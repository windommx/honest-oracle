"""DPO pair builder: stratified, direction-explicit preference pairs."""
from __future__ import annotations
import json
import random
from collections import defaultdict
from typing import Optional


class DPOPairBuilder:
    """
    Collects simulation runs per scenario and constructs
    DPO training pairs: (prompt, chosen, rejected).

    Direction is explicit, not assumed. In DPO `chosen` is the PREFERRED
    response, so the prompt and the chosen/rejected roles must agree on what
    "preferred" means. The objective is `prefer`:

      prefer="stable"  (default) -> chosen = a run that did NOT tip (the group
                                     stayed regulated), rejected = a run that
                                     tipped into a runaway crisis.
      prefer="tipping"           -> the reverse (e.g. for red-teaming / studying
                                     escalation dynamics).

    The earlier draft hard-coded chosen=tipping while the prompt asked to
    "predict" tipping — an incoherent pairing that taught the model to prefer
    runaway crises. The prompt now states the de-escalation objective so the
    response roles actually match the task.

    Stratification ensures balanced representation:
    - Same scenario, both outcomes present (tipping vs non-tipping)
    - Capped per scenario to prevent dominance
    - Shuffled globally to prevent ordering bias
    """

    def __init__(self):
        self._runs: dict[str, list[dict]] = defaultdict(list)

    def add_run(self, scenario: str, trajectory: list[dict],
                tipping: bool, metadata: Optional[dict] = None):
        self._runs[scenario].append({
            "trajectory": trajectory,
            "tipping": tipping,
            "metadata": metadata or {},
        })

    def build_pairs(self, max_per_scenario: int = 10,
                    prefer: str = "stable") -> list[dict]:
        if prefer not in ("stable", "tipping"):
            raise ValueError("prefer must be 'stable' or 'tipping'")
        rng = random.Random(0)
        pairs: list[dict] = []

        for scenario, runs in self._runs.items():
            tipping = [r for r in runs if r["tipping"]]
            not_tipping = [r for r in runs if not r["tipping"]]

            n = min(len(tipping), len(not_tipping), max_per_scenario)
            if n == 0:
                continue

            t_sample = rng.sample(tipping, n)
            nt_sample = rng.sample(not_tipping, n)

            prompt = self._describe_scenario(scenario, prefer)

            for t_run, nt_run in zip(t_sample, nt_sample):
                # chosen = the run matching the stated objective
                chosen_run = nt_run if prefer == "stable" else t_run
                rejected_run = t_run if prefer == "stable" else nt_run
                pairs.append({
                    "prompt": prompt,
                    "chosen": self._serialize(chosen_run["trajectory"]),
                    "rejected": self._serialize(rejected_run["trajectory"]),
                    "scenario": scenario,
                })

        rng.shuffle(pairs)
        return pairs

    def export_jsonl(self, path: str, prefer: str = "stable") -> int:
        pairs = self.build_pairs(prefer=prefer)
        with open(path, "w") as f:
            for p in pairs:
                f.write(json.dumps(p) + "\n")
        return len(pairs)

    def _describe_scenario(self, scenario: str, prefer: str = "stable") -> str:
        goal = ("keeps the group regulated and avoids a runaway crisis "
                "(no tipping point)" if prefer == "stable"
                else "escalates the group into a runaway crisis (reaches a "
                     "tipping point)")
        return (f"Social scenario: {scenario}. Produce the emotional-dynamics "
                f"trajectory that {goal}.")

    def _serialize(self, traj: list[dict]) -> str:
        parts = []
        for snap in traj[:20]:
            emos = " ".join(
                f"{aid}(P={e['p']:.1f} A={e['a']:.1f})"
                for aid, e in snap.get("emotions", {}).items()
            )
            parts.append(f"t={snap.get('time',0):.1f} {emos}")
        return " | ".join(parts)

    def stats(self) -> dict:
        total = sum(len(v) for v in self._runs.values())
        tipping = sum(1 for v in self._runs.values() for r in v if r["tipping"])
        return {"scenarios": len(self._runs), "total_runs": total,
                "tipping": tipping, "pairs_available": len(self.build_pairs())}
