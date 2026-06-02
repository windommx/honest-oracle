"""Social contagion graph: Independent Cascade + KKT greedy influence."""
from __future__ import annotations
import random
from collections import defaultdict
from typing import Optional


class NetworkGraph:
    """
    Directed weighted graph for social contagion.
    Includes Independent Cascade simulation and
    KKT greedy influence maximization.
    """

    def __init__(self):
        self._nodes: set[str] = set()
        self._adj: dict[str, dict[str, float]] = defaultdict(dict)

    def add_node(self, node: str):
        self._nodes.add(node)

    def add_edge(self, src: str, dst: str, weight: float = 1.0):
        self._nodes.add(src)
        self._nodes.add(dst)
        self._adj[src][dst] = max(0.0, min(1.0, weight))

    def neighbors(self, node: str) -> dict[str, float]:
        return dict(self._adj.get(node, {}))

    def degree_centrality(self) -> dict[str, float]:
        n = max(1, len(self._nodes) - 1)
        return {nd: len(self._adj.get(nd, {})) / n for nd in self._nodes}

    def ic_simulate(self, seed: set[str], rng: random.Random) -> int:
        """
        Independent Cascade: each activated node gets ONE chance
        to activate each inactive neighbor with probability = edge weight.
        Returns total number of activated nodes.
        """
        activated = set(seed)
        frontier = list(seed)
        while frontier:
            next_frontier = []
            for node in frontier:
                for nbr, w in self._adj.get(node, {}).items():
                    if nbr not in activated and rng.random() < w:
                        activated.add(nbr)
                        next_frontier.append(nbr)
            frontier = next_frontier
        return len(activated)

    def kkt_greedy(self, k: int, mc_runs: int = 500,
                   seed: Optional[int] = None) -> list[str]:
        """
        Greedy influence maximization with (1-1/e) guarantee.

        At each step, select the node with highest marginal influence spread,
        estimated via Monte Carlo IC simulations. To keep the marginal-gain
        comparison low-variance, the spread of the already-selected set is
        estimated ONCE per round and reused across candidates.

        Complexity: O(k × n × mc_runs × (n + m))
        """
        rng = random.Random(seed)
        selected: list[str] = []
        remaining = set(self._nodes)

        for _ in range(k):
            base = self._estimate_spread(selected, mc_runs, rng)
            best_node = None
            best_gain = -1.0

            for candidate in remaining:
                test_set = selected + [candidate]
                gain = self._estimate_spread(test_set, mc_runs, rng) - base
                if gain > best_gain:
                    best_gain = gain
                    best_node = candidate

            if best_node is not None:
                selected.append(best_node)
                remaining.discard(best_node)

        return selected

    def _estimate_spread(self, seed_list: list[str], runs: int,
                         rng: random.Random) -> float:
        if not seed_list:
            return 0.0
        total = 0
        for _ in range(runs):
            total += self.ic_simulate(set(seed_list), random.Random(rng.randint(0, 2**32)))
        return total / runs

    @property
    def nodes(self) -> set[str]:
        return set(self._nodes)
