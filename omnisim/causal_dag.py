"""Causal DAG: Kahn topological sort, cycle detection, BFS ancestry."""
from __future__ import annotations
from collections import defaultdict, deque


class CausalDAG:
    """
    Directed acyclic graph tracking cause-effect chains.
    Uses Kahn's algorithm for topological sort and cycle detection.
    BFS for ancestry/descendant queries.
    """

    def __init__(self):
        self._nodes: set[str] = set()
        self._adj: dict[str, set[str]] = defaultdict(set)
        self._radj: dict[str, set[str]] = defaultdict(set)

    def add_node(self, node: str):
        self._nodes.add(node)

    def add_edge(self, src: str, dst: str):
        self._nodes.add(src)
        self._nodes.add(dst)
        self._adj[src].add(dst)
        self._radj[dst].add(src)

    def topological_sort(self) -> list[str]:
        """Kahn's algorithm. Raises ValueError on cycle."""
        in_deg = {n: 0 for n in self._nodes}
        for src in self._adj:
            for dst in self._adj[src]:
                in_deg[dst] = in_deg.get(dst, 0) + 1

        queue = deque(n for n, d in in_deg.items() if d == 0)
        order: list[str] = []

        while queue:
            node = queue.popleft()
            order.append(node)
            for dst in self._adj.get(node, set()):
                in_deg[dst] -= 1
                if in_deg[dst] == 0:
                    queue.append(dst)

        if len(order) < len(self._nodes):
            raise ValueError(
                f"Cycle: sorted {len(order)}/{len(self._nodes)} nodes"
            )
        return order

    def has_cycle(self) -> bool:
        try:
            self.topological_sort()
            return False
        except ValueError:
            return True

    def ancestors(self, node: str) -> set[str]:
        """All nodes that causally precede node (BFS backward)."""
        visited: set[str] = set()
        queue = deque([node])
        while queue:
            n = queue.popleft()
            for parent in self._radj.get(n, set()):
                if parent not in visited:
                    visited.add(parent)
                    queue.append(parent)
        return visited

    def descendants(self, node: str) -> set[str]:
        """All nodes causally downstream of node (BFS forward)."""
        visited: set[str] = set()
        queue = deque([node])
        while queue:
            n = queue.popleft()
            for child in self._adj.get(n, set()):
                if child not in visited:
                    visited.add(child)
                    queue.append(child)
        return visited

    def causal_paths(self, src: str, dst: str) -> list[list[str]]:
        """All directed paths from src to dst (DFS)."""
        paths: list[list[str]] = []
        self._dfs(src, dst, [], paths, set())
        return paths

    def _dfs(self, cur, dst, path, paths, visited):
        path.append(cur)
        visited.add(cur)
        if cur == dst:
            paths.append(list(path))
        else:
            for nxt in self._adj.get(cur, set()):
                if nxt not in visited:
                    self._dfs(nxt, dst, path, paths, visited)
        path.pop()
        visited.discard(cur)

    @property
    def node_count(self) -> int:
        return len(self._nodes)

    @property
    def edge_count(self) -> int:
        return sum(len(v) for v in self._adj.values())
