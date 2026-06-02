"""Bifocal memory: objective facts vs per-agent distorted perceptions."""
from __future__ import annotations
import time
from dataclasses import dataclass
from typing import Optional


@dataclass
class MemoryEntry:
    fact_id: str
    objective: str
    perceived: Optional[str]
    bias: Optional[str]
    confidence: float
    source: str
    timestamp: float


class BifocalMemory:
    def __init__(self):
        self._facts: dict[str, dict] = {}
        self._perc: dict[tuple[str, str], dict] = {}
        self._agents: dict[str, dict] = {}

    def register_agent(self, aid: str, name: str, role: str = ""):
        self._agents[aid] = {"name": name, "role": role}

    def add_fact(self, fid: str, content: str, source: str = "system",
                 visibility: Optional[list[str]] = None):
        self._facts[fid] = {
            "content": content, "source": source,
            "visibility": visibility or ["public"],
            "ts": time.time(),
        }

    def distort(self, aid: str, fid: str, perceived: str,
                bias: str, confidence: float = 0.8):
        self._perc[(aid, fid)] = {
            "perceived": perceived, "bias": bias,
            "confidence": max(0.0, min(1.0, confidence)),
        }

    def recall(self, aid: str, limit: int = 20) -> list[MemoryEntry]:
        entries = []
        for fid, f in self._facts.items():
            vis = f["visibility"]
            if "public" not in vis and aid not in vis:
                continue
            p = self._perc.get((aid, fid))
            entries.append(MemoryEntry(
                fid, f["content"],
                p["perceived"] if p else None,
                p["bias"] if p else None,
                p["confidence"] if p else 1.0,
                f["source"], f["ts"],
            ))
        entries.sort(key=lambda e: e.timestamp, reverse=True)
        return entries[:limit]

    def epistemic_gap(self, aid: str, fid: str) -> Optional[dict]:
        f = self._facts.get(fid)
        if not f:
            return None
        p = self._perc.get((aid, fid))
        perc = p["perceived"] if p else f["content"]
        return {
            "objective": f["content"], "perceived": perc,
            "gap": f["content"] != perc,
            "bias": p["bias"] if p else None,
            "confidence": p["confidence"] if p else 1.0,
        }
