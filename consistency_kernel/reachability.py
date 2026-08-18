"""Entity-reachability gate (the deterministic core of NeoTIC Rule 1).

Given an ``AWARE_OF`` graph and a point of view (POV), this computes *exactly*
which entities that POV may reference — every entity within ``max_hops``, and no
others. A KG-Trie primitive then turns that whitelist into a constrained-decoding
gate that is both **sound** (never proposes a disallowed entity) and **complete**
(can propose every allowed one), even when one entity's token sequence is a prefix
of another's (handled via explicit terminal markers — the prefix-containment fix).

Everything here is pure, deterministic graph/trie logic: no LLM, no database. Its
correctness is verified in ``tests/test_kernel.py`` against independent references
(a DFS oracle and a matrix-power oracle) and bounded-exhaustively over *all* small
graphs — so the claim "the code is correct" is checkable, not asserted.
"""
from __future__ import annotations

from collections import deque
from typing import Callable, Iterable, Optional

__all__ = ["ReachGraph", "Trie", "DEFAULT_EDGE"]

DEFAULT_EDGE = "AWARE_OF"


class ReachGraph:
    """A typed, directed graph with bounded breadth-first reachability.

    Nodes are arbitrary string ids. Some nodes are tagged as *entities* (the
    referenceable nouns); ``reachable`` returns only entity endpoints. The
    traversal is breadth-first, deduplicates visited nodes (so it terminates on
    cycles), and is bounded by ``max_hops``.
    """

    def __init__(self) -> None:
        # node -> set of (neighbour, edge_type)
        self._adj: dict[str, set[tuple[str, str]]] = {}
        self._entities: set[str] = set()

    # ── construction ────────────────────────────────────────────────────
    def add_node(self, name: str) -> None:
        self._adj.setdefault(name, set())

    def add_edge(self, src: str, dst: str, etype: str = DEFAULT_EDGE) -> None:
        self._adj.setdefault(src, set()).add((dst, etype))
        self._adj.setdefault(dst, set())

    def register_entity(self, name: str) -> None:
        self._entities.add(name)
        self._adj.setdefault(name, set())

    # ── queries ─────────────────────────────────────────────────────────
    @property
    def entities(self) -> set[str]:
        return set(self._entities)

    @property
    def nodes(self) -> set[str]:
        return set(self._adj)

    def reachable(self, pov: str, max_hops: int = 1,
                  along: str = DEFAULT_EDGE) -> set[str]:
        """Entities reachable from ``pov`` over 1..``max_hops`` ``along``-edges.

        The POV itself is never returned. Raises ``ValueError`` on a negative
        horizon (an undefined query is rejected, not silently treated as 0).
        """
        if max_hops < 0:
            raise ValueError("max_hops must be >= 0")
        if pov not in self._adj:
            return set()
        out: set[str] = set()
        seen = {pov}
        queue: deque[tuple[str, int]] = deque([(pov, 0)])
        while queue:
            node, hops = queue.popleft()
            if node != pov and node in self._entities:
                out.add(node)
            if hops >= max_hops:
                continue
            for neighbour, etype in self._adj.get(node, ()):
                if etype == along and neighbour not in seen:
                    seen.add(neighbour)
                    queue.append((neighbour, hops + 1))
        return out

    # an alias that reads better at the call site (the "gate")
    def allowed_references(self, pov: str, max_hops: int = 1) -> set[str]:
        return self.reachable(pov, max_hops)


class Trie:
    """A KG-Trie over multi-token entity names, for constrained decoding.

    Entities are split into tokens (default: on ``_``); a decoder walks the trie
    and, at each step, may only emit a token returned by ``valid_next``. The key
    correctness subtlety is *prefix containment*: when ``the_dagger`` and
    ``the_dagger_of_doom`` are both allowed, a decoder that stops only when there
    are no continuations would never emit the shorter one. ``valid_next_with_stop``
    fixes this by also reporting whether the current node is a valid stopping point.
    """

    _TERMINAL = "\x00$"   # sentinel key; chosen so it can't collide with a token

    def __init__(self, entities: Iterable[str] = (), *,
                 tokenize: Optional[Callable[[str], list[str]]] = None) -> None:
        self._tokenize = tokenize or (lambda s: s.split("_"))
        self._root: dict = {}
        for entity in entities:
            self.add(entity)

    def add(self, entity: str) -> None:
        node = self._root
        for token in self._tokenize(entity):
            node = node.setdefault(token, {})
        node[self._TERMINAL] = entity

    def valid_next_with_stop(self,
                             prefix_tokens: list[str]) -> tuple[set[str], bool]:
        """Return ``(continuation_tokens, may_stop_here)`` for a token prefix.

        If the prefix runs off the trie, returns ``(set(), False)`` — the
        production "off-manifold" signal that decoding must reject this path.
        """
        node = self._root
        for token in prefix_tokens:
            if token not in node:
                return set(), False
            node = node[token]
        return {k for k in node if k != self._TERMINAL}, (self._TERMINAL in node)

    def valid_next(self, prefix_tokens: list[str]) -> set[str]:
        return self.valid_next_with_stop(prefix_tokens)[0]

    def entities(self) -> set[str]:
        """Every entity a terminal-aware decoder can emit (sound+complete set)."""
        out: set[str] = set()

        def walk(node: dict) -> None:
            for key, child in node.items():
                if key == self._TERMINAL:
                    out.add(child)
                else:
                    walk(child)

        walk(self._root)
        return out
