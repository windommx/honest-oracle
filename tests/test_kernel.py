"""Verification suite for the Narrative Consistency Kernel.

The discipline here mirrors the rest of this repo: every guarantee is checked
against an *independent* reference or bounded-exhaustively, not just on a happy
path. Ported and cleaned from the NeoTIC Rule-1 / Rule-4 proofs.

  Reachability : differential vs a DFS oracle and a matrix-power oracle;
                 bounded-exhaustive over ALL graphs on a 4-node set;
                 monotonicity, cycle-termination, edge-growth monotonicity.
  Trie         : prefix-containment finding+fix; decode sound+complete over two
                 independent tokenizers; off-manifold rejection.
  Transaction  : the six canonical scenarios; atomicity fuzz (2000 streams);
                 fail-closed on a raising rule; lock-key canonical order.
  Deadlock     : sorted lock order is deadlock-free over 3000 trials, AND an
                 arbitrary order is shown to deadlock (differential).
  Kernel       : staged-gate integration (Rule-1 gate then Rule-4 commit).
"""
import itertools
import random
import unittest

from consistency_kernel import (
    ReachGraph, Trie, WorldState, Scene, RuleViolation, lock_keys,
    NarrativeKernel, grammar_violations,
)
from consistency_kernel.longrun import (
    generate_story, run_comparison, evaluate as window_evaluate,
)
from consistency_kernel.extraction import (
    ProseExtractor, RegexBaselineExtractor, GoldExample, score,
    evaluate as eval_extractor, GOLD,
)


# ── independent references (oracles) ────────────────────────────────────────
def dfs_reference(edges, entities, pov, max_hops):
    """A from-scratch DFS oracle for bounded reachability (different code path
    from the BFS in ReachGraph)."""
    adj: dict[str, list[str]] = {}
    for s, d in edges:
        adj.setdefault(s, []).append(d)
    found: set[str] = set()

    def dfs(node, depth):
        if depth > 0 and node in entities:
            found.add(node)
        if depth == max_hops:
            return
        for nbr in adj.get(node, ()):
            dfs(nbr, depth + 1)

    dfs(pov, 0)
    return found


def matrix_reference(edges, entities, nodes, pov, max_hops):
    """Boolean adjacency-matrix powers — a third, independent reachability path."""
    idx = {n: i for i, n in enumerate(sorted(nodes))}
    n = len(idx)
    M = [[False] * n for _ in range(n)]
    for s, d in edges:
        M[idx[s]][idx[d]] = True
    reach = [False] * n
    frontier = [False] * n
    frontier[idx[pov]] = True
    for _ in range(max_hops):
        nxt = [False] * n
        for i in range(n):
            if frontier[i]:
                for j in range(n):
                    if M[i][j] and not reach[j]:
                        nxt[j] = True
        for j in range(n):
            if nxt[j]:
                reach[j] = True
        frontier = nxt
    rev = {i: name for name, i in idx.items()}
    return {rev[j] for j in range(n)
            if reach[j] and rev[j] in entities and rev[j] != pov}


def random_graph(rng):
    chars = [f"C{i}" for i in range(rng.randint(2, 5))]
    ents = [f"E{i}" for i in range(rng.randint(1, 5))]
    nodes = chars + ents
    g = ReachGraph()
    for e in ents:
        g.register_entity(e)
    edges = []
    for _ in range(rng.randint(0, len(nodes) * 2)):
        s, d = rng.choice(nodes), rng.choice(nodes)
        if s != d:
            g.add_edge(s, d)
            edges.append((s, d))
    return g, chars, set(ents), nodes, edges


class TestReachabilityDifferential(unittest.TestCase):
    def test_matches_dfs_oracle(self):
        rng = random.Random(1)
        for _ in range(500):
            g, chars, ents, _nodes, edges = random_graph(rng)
            pov = rng.choice(chars)
            for h in (1, 2, 3):
                self.assertEqual(g.reachable(pov, h),
                                 dfs_reference(edges, ents, pov, h))

    def test_matches_matrix_oracle(self):
        rng = random.Random(2)
        for _ in range(500):
            g, chars, ents, nodes, edges = random_graph(rng)
            for pov in chars:
                for h in (1, 2, 3):
                    self.assertEqual(
                        g.reachable(pov, h),
                        matrix_reference(edges, ents, set(nodes), pov, h))

    def test_monotone_in_hops(self):
        rng = random.Random(3)
        for _ in range(300):
            g, chars, _e, _n, _edges = random_graph(rng)
            pov = rng.choice(chars)
            self.assertTrue(g.reachable(pov, 1) <= g.reachable(pov, 2)
                            <= g.reachable(pov, 3))


class TestReachabilityExhaustive(unittest.TestCase):
    def test_all_small_graphs(self):
        # Every directed graph on {p, x, E0, E1}: 12 possible edges -> 4096 graphs.
        nodes = ["p", "x", "E0", "E1"]
        ents = {"E0", "E1"}
        pairs = [(s, d) for s in nodes for d in nodes if s != d]
        povs = ["p", "x"]
        checked = 0
        for mask in range(1 << len(pairs)):
            edges = [pairs[i] for i in range(len(pairs)) if mask & (1 << i)]
            g = ReachGraph()
            for e in ents:
                g.register_entity(e)
            for s, d in edges:
                g.add_edge(s, d)
            for pov in povs:
                for h in (1, 2, 3):
                    checked += 1
                    self.assertEqual(g.reachable(pov, h),
                                     dfs_reference(edges, ents, pov, h))
        self.assertEqual(checked, 4096 * len(povs) * 3)


class TestReachabilityDynamics(unittest.TestCase):
    def test_edge_addition_only_grows_whitelist(self):
        rng = random.Random(3)
        for _ in range(2000):
            chars = [f"C{i}" for i in range(rng.randint(2, 4))]
            ents = [f"E{i}" for i in range(rng.randint(1, 4))]
            nodes = chars + ents
            g = ReachGraph()
            for e in ents:
                g.register_entity(e)
            pov = rng.choice(chars)
            prev = g.reachable(pov, 3)
            for _ in range(rng.randint(1, 8)):
                s, d = rng.choice(nodes), rng.choice(nodes)
                if s != d:
                    g.add_edge(s, d)
                cur = g.reachable(pov, 3)
                self.assertTrue(prev <= cur)   # learning never un-allows an entity
                prev = cur

    def test_terminates_and_correct_on_dense_cycles(self):
        rng = random.Random(4)
        for _ in range(300):
            nodes = [f"C{i}" for i in range(rng.randint(2, 4))] + \
                    [f"E{i}" for i in range(rng.randint(1, 3))]
            ents = {n for n in nodes if n.startswith("E")}
            g = ReachGraph()
            for e in ents:
                g.register_entity(e)
            edges = []
            for a in nodes:
                for b in nodes:
                    if a != b and rng.random() < 0.6:
                        g.add_edge(a, b)
                        edges.append((a, b))
            pov = rng.choice([n for n in nodes if n.startswith("C")])
            for h in (1, 2, 3):
                self.assertEqual(g.reachable(pov, h),
                                 dfs_reference(edges, ents, pov, h))

    def test_unknown_pov_empty(self):
        self.assertEqual(ReachGraph().reachable("ghost", 3), set())

    def test_negative_hops_rejected(self):
        with self.assertRaises(ValueError):
            ReachGraph().reachable("x", -1)


# ── Trie ─────────────────────────────────────────────────────────────────
def continuation_only_entities(trie: Trie):
    """A decoder that stops ONLY when no continuation token exists (ignores
    terminal markers). Incomplete under prefix-containment — the bug the
    terminal-aware primitive fixes."""
    out: set[str] = set()

    def walk(prefix):
        conts, may_stop = trie.valid_next_with_stop(list(prefix))
        if not conts:
            if may_stop:
                out.add("_".join(prefix))
            return
        for tok in conts:
            walk(prefix + [tok])

    walk([])
    return out


class TestTrie(unittest.TestCase):
    def test_prefix_containment_finding_and_fix(self):
        allowed = {"the_dagger", "the_dagger_of_doom", "the_red_letter"}
        trie = Trie(sorted(allowed))
        # FINDING: continuation-only decoding misses the contained prefix entity.
        naive = continuation_only_entities(trie)
        self.assertIn("the_dagger", allowed - naive)
        # FIX: terminal-aware decoding is complete.
        self.assertEqual(trie.entities(), allowed)
        # the production primitive reports may_stop at the contained terminal
        conts, may_stop = trie.valid_next_with_stop(["the", "dagger"])
        self.assertTrue(may_stop)
        self.assertEqual(conts, {"of"})
        # ...and not at an interior, non-terminal node
        conts2, may_stop2 = trie.valid_next_with_stop(["the"])
        self.assertFalse(may_stop2)
        self.assertEqual(conts2, {"dagger", "red"})

    def test_decode_sound_and_complete_two_tokenizers(self):
        rng = random.Random(1)
        for _ in range(400):
            g, chars, _e, _n, _edges = random_graph(rng)
            pov = rng.choice(chars)
            allowed = g.reachable(pov, 2)
            for tokenize in (lambda s: s.split("_"), list):
                trie = Trie(sorted(allowed), tokenize=tokenize)
                decoded = trie.entities()
                self.assertTrue(decoded <= allowed)   # sound
                self.assertEqual(decoded, allowed)     # complete

    def test_off_manifold_returns_empty_and_no_stop(self):
        trie = Trie(["the_ancient_dagger", "the_red_letter"])
        self.assertEqual(trie.valid_next([]), {"the"})
        self.assertEqual(trie.valid_next(["the"]), {"ancient", "red"})
        conts, may_stop = trie.valid_next_with_stop(["the", "hidden"])
        self.assertEqual(conts, set())
        self.assertFalse(may_stop)


# ── Transaction ───────────────────────────────────────────────────────────
class TestTransaction(unittest.TestCase):
    def test_canonical_scenarios(self):
        w = WorldState()
        ok, why = w.commit_scene([("learn", "Bob", "the_code"),
                                  ("place", "dagger", "hall")])
        self.assertTrue(ok, why)

        w.commit_scene([("die", "Bob")])
        before = w.public_state()
        ok, why = w.commit_scene([("act", "Bob")])
        self.assertFalse(ok)
        self.assertTrue(any("(a)" in r for r in why))
        self.assertEqual(w.public_state(), before)   # rejected scene changed nothing

        before = w.public_state()
        ok, why = w.commit_scene([("place", "ring", "tower"),
                                  ("place", "ring", "crypt")])
        self.assertFalse(ok)
        self.assertTrue(any("(b)" in r for r in why))
        self.assertEqual(w.public_state(), before)

        ok, why = w.commit_scene([("reference", "Alice", "the_code")])
        self.assertFalse(ok)
        self.assertTrue(any("(c)" in r for r in why))

        w.commit_scene([("learn", "Alice", "the_code")])
        ok, why = w.commit_scene([("reference", "Alice", "the_code"),
                                  ("place", "dagger", "crypt")])
        self.assertTrue(ok, why)

    def test_atomicity_fuzz(self):
        rng = random.Random(4)
        chars, objs, locs, facts = ["A", "B", "C"], ["dagger", "ring"], \
            ["hall", "tower"], ["code", "name"]
        for _ in range(2000):
            w = WorldState()
            dead_ref: set[str] = set()
            knows_ref: dict[str, set[str]] = {}
            for _step in range(rng.randint(1, 6)):
                events = []
                for _e in range(rng.randint(1, 4)):
                    v = rng.choice(["die", "act", "place", "learn", "reference"])
                    if v in ("die", "act"):
                        events.append((v, rng.choice(chars)))
                    elif v == "place":
                        events.append(("place", rng.choice(objs), rng.choice(locs)))
                    else:
                        events.append((v, rng.choice(chars), rng.choice(facts)))
                before = w.public_state()
                ok, _ = w.commit_scene(events)
                if ok:
                    # Independent SEQUENTIAL oracle: a scene is a series of moments,
                    # so each event is judged against the state as it stands at that
                    # point, then folded in. (The earlier oracle judged every event
                    # against the pre-scene state, which is what let a scene
                    # "Bob dies, Bob acts" pass unnoticed.)
                    shadow_dead = set(dead_ref)
                    shadow_knows = {k: set(v) for k, v in knows_ref.items()}
                    for e in events:
                        if e[0] == "act":
                            self.assertNotIn(e[1], shadow_dead)
                        elif e[0] == "reference":
                            self.assertIn(e[2], shadow_knows.get(e[1], set()))
                        if e[0] == "die":
                            shadow_dead.add(e[1])
                        elif e[0] == "learn":
                            shadow_knows.setdefault(e[1], set()).add(e[2])
                    dead_ref, knows_ref = shadow_dead, shadow_knows
                else:
                    self.assertEqual(w.public_state(), before)  # atomic rollback

    def test_fail_closed_on_raising_rule(self):
        w = WorldState()
        w.commit_scene([("learn", "A", "f")])
        before = w.public_state()

        def boom(state, events):
            raise RuntimeError("rule engine fault")

        w.add_rule(boom)
        with self.assertRaises(RuntimeError):
            w.commit_scene([("place", "ring", "hall")])
        self.assertEqual(w.public_state(), before)   # rolled back, not half-applied

    def test_custom_rule_rollback(self):
        w = WorldState()

        def one_death(state, events):
            deaths = [e for e in events if e[0] == "die"]
            return ["(custom) too many deaths"] if len(deaths) > 1 else []

        w.add_rule(one_death)
        before = w.public_state()
        ok, why = w.commit_scene([("die", "A"), ("die", "B")])
        self.assertFalse(ok)
        self.assertTrue(any("custom" in r for r in why))
        self.assertEqual(w.public_state(), before)

    def test_context_manager_commits_and_raises(self):
        w = WorldState()
        with w.transaction() as scene:
            scene.learn("A", "f").place("ring", "hall")
        self.assertTrue(w.knows("A", "f"))
        self.assertEqual(w.object_location("ring"), "hall")

        before = w.public_state()
        with self.assertRaises(RuleViolation):
            with w.transaction() as scene:
                scene.reference("A", "unknown_fact")
        self.assertEqual(w.public_state(), before)

    def test_lock_keys_canonical_and_complete(self):
        ev = [("learn", "Bob", "code"), ("place", "dagger", "hall"),
              ("die", "Alice"), ("reference", "Bob", "name")]
        keys = lock_keys(ev)
        self.assertEqual(keys, sorted(keys))
        self.assertEqual(set(keys), {"char:Bob", "char:Alice", "fact:code",
                                     "fact:name", "obj:dagger", "loc:hall"})

    def test_engine_acquires_locks_sorted(self):
        w = WorldState()
        acquired: list[list[str]] = []
        w.commit_scene([("place", "ring", "tower"), ("learn", "C", "secret"),
                        ("die", "C")],
                       lock_acquire=acquired.append)
        self.assertEqual(len(acquired), 1)
        self.assertEqual(acquired[0], sorted(acquired[0]))
        self.assertEqual(set(acquired[0]),
                         {"obj:ring", "loc:tower", "char:C", "fact:secret"})


# ── Deadlock-freedom of the canonical lock-ordering discipline ──────────────
def reaches_deadlock(seq1, seq2):
    """Explore ALL interleavings of two transactions acquiring their locks in the
    given orders (held until the end); return True iff some reachable state has
    both blocked on a lock the other holds."""
    seen = set()

    def dfs(i1, i2, held1, held2):
        key = (i1, i2, held1, held2)
        if key in seen:
            return False
        seen.add(key)
        done1, done2 = i1 == len(seq1), i2 == len(seq2)
        want1 = None if done1 else seq1[i1]
        want2 = None if done2 else seq2[i2]
        blocked1 = (want1 is not None) and (want1 in held2)
        blocked2 = (want2 is not None) and (want2 in held1)
        if (not done1 and blocked1) and (not done2 and blocked2):
            return True
        if not done1 and not blocked1:
            if dfs(i1 + 1, i2, held1 | {want1}, held2):
                return True
        if not done2 and not blocked2:
            if dfs(i1, i2 + 1, held1, held2 | {want2}):
                return True
        return False

    return dfs(0, 0, frozenset(), frozenset())


class TestDeadlockFreedom(unittest.TestCase):
    def test_sorted_order_never_deadlocks_arbitrary_can(self):
        rng = random.Random(51)
        entities = ["A", "B", "C", "o", "f"]
        ordered_deadlocks = 0
        unordered_deadlock_exists = 0
        for _ in range(3000):
            set1 = rng.sample(entities, rng.randint(1, 4))
            set2 = rng.sample(entities, rng.randint(1, 4))
            if reaches_deadlock(tuple(sorted(set1)), tuple(sorted(set2))):
                ordered_deadlocks += 1
            a, b = list(set1), list(set2)
            rng.shuffle(a)
            rng.shuffle(b)
            if reaches_deadlock(tuple(a), tuple(b)):
                unordered_deadlock_exists += 1
        self.assertEqual(ordered_deadlocks, 0)         # canonical order is safe
        self.assertGreater(unordered_deadlock_exists, 0)  # arbitrary order is not


# ── Kernel facade integration ──────────────────────────────────────────────
class TestNarrativeKernel(unittest.TestCase):
    def test_gate_blocks_unreachable_reference(self):
        k = NarrativeKernel()
        k.add_awareness("Alice", "the_code")
        # Alice knows the_code so Rule 4 would pass; but Rule 1 only allows
        # references to entities she is AWARE_OF — register an unreachable one.
        k.reach.register_entity("the_secret")
        k.world.commit_scene([("learn", "Alice", "the_code"),
                              ("learn", "Alice", "the_secret")])
        ok, why = k.author_scene([("reference", "Alice", "the_secret")])
        self.assertFalse(ok)
        self.assertTrue(any("gate" in r for r in why))

    def test_allowed_reference_commits(self):
        k = NarrativeKernel()
        k.add_awareness("Alice", "the_code")
        k.world.commit_scene([("learn", "Alice", "the_code")])
        ok, why = k.author_scene([("reference", "Alice", "the_code"),
                                  ("place", "dagger", "hall")])
        self.assertTrue(ok, why)
        self.assertEqual(k.world.object_location("dagger"), "hall")

    def test_trie_for_pov(self):
        k = NarrativeKernel()
        k.add_awareness("Alice", "the_ancient_dagger")
        k.add_awareness("Alice", "the_red_letter")
        trie = k.trie_for("Alice")
        self.assertEqual(trie.valid_next(["the"]), {"ancient", "red"})


class TestLongRunConsistency(unittest.TestCase):
    """The 'no memory decay' claim, measured rather than asserted."""

    def test_graph_perfect_at_every_length(self):
        # The full graph must catch 100% of violations and raise 0 false
        # positives — independent of how long ago the establishing event was.
        for n in (50, 300, 1000):
            r = run_comparison(n_chapters=n, n_probes=40, window=20)
            self.assertEqual(r["graph"]["detection_rate"], 1.0, n)
            self.assertEqual(r["graph"]["false_positive_rate"], 0.0, n)

    def test_window_baseline_degrades_with_length(self):
        # A context-window checker MISSES old violations and INVENTS false ones,
        # and it gets strictly worse as the story grows.
        short = run_comparison(n_chapters=50, n_probes=40, window=20)["window"]
        long = run_comparison(n_chapters=1000, n_probes=40, window=20)["window"]
        self.assertLess(long["detection_rate"], short["detection_rate"])
        self.assertGreater(long["false_positive_rate"],
                           short["false_positive_rate"])
        self.assertGreater(short["false_positive_rate"], 0.0)

    def test_violations_missed_by_window_are_the_distant_ones(self):
        # Specifically, every violation the window misses sits beyond its memory.
        r = window_evaluate(generate_story(300, 40, seed=0), window=20)
        self.assertTrue(r["missed_at"])              # it does miss some
        self.assertTrue(all(d > 20 for d in r["missed_at"]))

    def test_extraction_is_the_load_bearing_dependency(self):
        # HONEST COUNTER-WEIGHT: "never forgets" is conditional on the event
        # being recorded. If the establishing 'die' is never extracted, the
        # graph happily accepts the contradiction — garbage-in, garbage-forever.
        w = WorldState()
        # (the 'die' event was dropped by a hypothetical extraction error)
        ok, _ = w.commit_scene([("act", "ghost")])
        self.assertTrue(ok)   # not flagged, because the death was never recorded


class TestExtraction(unittest.TestCase):
    def test_parse_valid_json(self):
        ex = ProseExtractor()
        r = ex.parse('{"events": [["die","alice"], ["learn","bob","secret"]]}')
        self.assertEqual(r.events, [("die", "alice"), ("learn", "bob", "secret")])
        self.assertEqual(r.n_dropped, 0)

    def test_parse_fail_closed_on_garbage(self):
        ex = ProseExtractor()
        self.assertEqual(ex.parse("not json at all").events, [])
        self.assertEqual(ex.parse('{"nope": 1}').events, [])
        # off-grammar items are dropped and counted, never guessed
        r = ex.parse('{"events": [["fly","alice"], ["die"], ["die","bob"]]}')
        self.assertEqual(r.events, [("die", "bob")])
        self.assertEqual(r.n_dropped, 2)

    def test_extract_requires_llm(self):
        with self.assertRaises(RuntimeError):
            ProseExtractor().extract("Alice died.")

    def test_scorer_is_correct(self):
        gold = [("die", "alice"), ("place", "dagger", "hall")]
        self.assertEqual(score(gold, gold)["f1"], 1.0)            # perfect
        self.assertEqual(score([], gold)["recall"], 0.0)         # misses everything
        # a hallucinated extra event is penalised on precision
        s = score(gold + [("die", "bob")], gold)
        self.assertLess(s["precision"], 1.0)
        self.assertEqual(s["recall"], 1.0)

    def test_regex_baseline_floor_is_honest(self):
        # The deterministic floor: real, > random, but clearly imperfect (it is
        # NOT the product). We only assert it lands in a sane middling band.
        r = eval_extractor(RegexBaselineExtractor(), GOLD)
        self.assertGreater(r["f1"], 0.4)
        self.assertLess(r["f1"], 0.95)

    def test_mock_llm_extractor_end_to_end(self):
        # A scripted "LLM" returns correct JSON; extraction feeds the kernel, and
        # a planted contradiction (a dead character acts) is caught downstream.
        script = {
            "ch1: Bob spoke, then Bob died.":
                '{"events": [["act","bob"], ["die","bob"]]}',
            "ch2: Bob drew his sword.":
                '{"events": [["act","bob"]]}',
        }
        ex = ProseExtractor(llm_call=lambda prompt: next(
            v for k, v in script.items() if k in prompt))
        world = WorldState()
        # chapter 1 commits cleanly
        ok1, _ = world.commit_scene(ex.extract("ch1: Bob spoke, then Bob died.").events)
        self.assertTrue(ok1)
        # chapter 2: Bob is dead -> the kernel rejects the extracted 'act'
        ok2, why = world.commit_scene(ex.extract("ch2: Bob drew his sword.").events)
        self.assertFalse(ok2)
        self.assertTrue(any("(a)" in r for r in why))


# ── Regression suite for the second audit ──────────────────────────────────
# Every test below FAILS against the pre-audit kernel. They exist because the
# original suite passed with the rollback mechanism entirely deleted, which is
# how a broken atomicity guarantee survived a "verified" package.

class TestIntraSceneOrdering(unittest.TestCase):
    """The flagship rule must not depend on where a chapter break happens to fall."""

    def test_dead_character_acting_inside_one_scene_is_rejected(self):
        # Before: this committed cleanly, because every event was judged against
        # the frozen pre-scene state. The same two events SPLIT across two scenes
        # were correctly rejected — so "the dead cannot act" silently depended on
        # the extractor's chunking.
        w = WorldState()
        ok, why = w.commit_scene([("die", "Bob"), ("act", "Bob")])
        self.assertFalse(ok)
        self.assertTrue(any("(a)" in r for r in why), why)
        self.assertEqual(w.public_state(), WorldState().public_state())  # nothing written

    def test_acting_then_dying_in_one_scene_is_still_legal(self):
        # The order-aware check must not over-correct: speaking and then dying in
        # the same chapter is ordinary prose.
        w = WorldState()
        ok, why = w.commit_scene([("act", "Bob"), ("die", "Bob")])
        self.assertTrue(ok, why)
        self.assertTrue(w.is_dead("Bob"))

    def test_learning_then_referencing_in_one_scene_is_legal(self):
        # The mirror-image bug: order-blindness ALSO produced false rejections.
        # "Alice learned the code, then Alice mentioned the code" is valid.
        w = WorldState()
        ok, why = w.commit_scene([("learn", "A", "f"), ("reference", "A", "f")])
        self.assertTrue(ok, why)
        self.assertTrue(w.knows("A", "f"))

    def test_referencing_before_learning_in_one_scene_is_rejected(self):
        w = WorldState()
        ok, why = w.commit_scene([("reference", "A", "f"), ("learn", "A", "f")])
        self.assertFalse(ok)
        self.assertTrue(any("(c)" in r for r in why), why)

    def test_object_in_two_places_stays_a_joint_check(self):
        # Rule (b) is about simultaneity, not sequence — it must NOT be relaxed
        # into "the object simply moved twice" by the ordering change.
        w = WorldState()
        ok, why = w.commit_scene([("place", "ring", "tower"), ("place", "ring", "crypt")])
        self.assertFalse(ok)
        self.assertTrue(any("(b)" in r for r in why), why)


class TestRollbackIsReentrant(unittest.TestCase):
    """These are the tests that actually EXERCISE rollback.

    The original suite passed with `_rollback` replaced by a no-op, because a
    rejected scene never wrote anything in the first place. Re-entrancy is the
    case where state really is mutated before the rollback runs.
    """

    @staticmethod
    def _one_shot(fn):
        fired = {"yet": False}

        def rule(state, events):
            if fired["yet"]:
                return []
            fired["yet"] = True
            return fn(state, events)
        return rule

    def test_nested_commit_is_undone_when_the_outer_scene_is_rejected(self):
        w = WorldState()
        w.add_rule(self._one_shot(
            lambda state, events: (state.commit_scene([("learn", "X", "leak")]),
                                   ["(custom) reject outer"])[1]))
        before = w.public_state()
        ok, why = w.commit_scene([("place", "ring", "hall")])
        self.assertFalse(ok, why)
        self.assertFalse(w.knows("X", "leak"),
                         "a nested commit survived a REJECTED outer scene")
        self.assertEqual(w.public_state(), before)   # byte-identical, as documented

    def test_nested_commit_is_undone_when_a_rule_raises(self):
        w = WorldState()

        def boom(state, events):
            state.commit_scene([("learn", "Y", "leak")])
            raise RuntimeError("rule engine fault")
        w.add_rule(self._one_shot(boom))
        before = w.public_state()
        with self.assertRaises(RuntimeError):
            w.commit_scene([("place", "ring", "hall")])
        self.assertFalse(w.knows("Y", "leak"))
        self.assertEqual(w.public_state(), before)   # fail-closed AND atomic

    def test_transaction_depth_returns_to_zero(self):
        w = WorldState()
        self.assertFalse(w.in_transaction)
        w.commit_scene([("learn", "A", "f")])
        self.assertFalse(w.in_transaction)
        w.commit_scene([("reference", "A", "nope")])     # rejected
        self.assertFalse(w.in_transaction)               # no leaked snapshot


class TestEventGrammarIsEnforced(unittest.TestCase):
    def test_unknown_verb_is_rejected_not_silently_committed(self):
        # Before: ("teleport", ...) returned (True, []) — reported as a successful
        # commit while doing nothing at all.
        w = WorldState()
        ok, why = w.commit_scene([("teleport", "Bob", "moon")])
        self.assertFalse(ok)
        self.assertTrue(any("(g)" in r for r in why), why)

    def test_wrong_arity_is_rejected_not_an_IndexError(self):
        # Before: raised IndexError out of the rule engine.
        w = WorldState()
        for bad in [("die",), ("place", "ring"), ("learn", "A"), (), "die"]:
            ok, why = w.commit_scene([bad])
            self.assertFalse(ok, bad)
            self.assertTrue(any("(g)" in r for r in why), (bad, why))

    def test_a_malformed_event_cannot_partially_apply_its_scene(self):
        w = WorldState()
        ok, why = w.commit_scene([("place", "ring", "hall"), ("die",)])
        self.assertFalse(ok)
        self.assertIsNone(w.object_location("ring"))

    def test_grammar_violations_is_exported_and_precise(self):
        self.assertEqual(grammar_violations([("die", "a"), ("place", "o", "l")]), [])
        self.assertEqual(len(grammar_violations([("die", "a", "extra")])), 1)


class TestTrieSentinelCannotCollide(unittest.TestCase):
    def test_entity_named_like_the_old_sentinel_is_handled(self):
        # Before: the sentinel was the STRING "\x00$", so this crashed
        # entities() with "TypeError: unhashable type: 'dict'".
        trie = Trie(["\x00$", "the_dagger"])
        self.assertEqual(trie.entities(), {"\x00$", "the_dagger"})

    def test_sentinel_is_not_a_string_any_tokenizer_could_emit(self):
        self.assertNotIsInstance(Trie._TERMINAL, str)


class TestExtractionNeverInventsEntities(unittest.TestCase):
    def test_non_string_members_are_dropped_not_coerced(self):
        # Before: null -> a character named "none"; 123 -> "123";
        # {"n":"bob"} -> "{'n': 'bob'}". Each a well-formed event the model never
        # emitted, which then poisons the graph permanently.
        ex = ProseExtractor()
        r = ex.parse('{"events": [["die", null], ["die", 123], '
                     '["act", {"n":"bob"}], ["die", ["x","y"]], ["die","bob"]]}')
        self.assertEqual(r.events, [("die", "bob")])
        self.assertEqual(r.n_dropped, 4)
        self.assertNotIn("none", str(r.events))

    def test_a_wholly_discarded_response_is_counted_as_dropped(self):
        ex = ProseExtractor()
        for raw in ["not json at all", '{"nope": 1}']:
            r = ex.parse(raw)
            self.assertEqual(r.events, [])
            self.assertEqual(r.n_dropped, len(r.dropped_reasons))
            self.assertGreater(r.n_dropped, 0, raw)


class TestGateIsFailClosed(unittest.TestCase):
    def test_unregistered_entity_is_blocked_by_default(self):
        # Before: gate_violations only fired for entities it already knew, so a
        # reference to a never-registered noun — the hallucination the gate exists
        # to stop — passed straight through and committed.
        k = NarrativeKernel()
        k.add_awareness("Alice", "the_code")
        k.world.commit_scene([("learn", "Alice", "totally_made_up")])
        ok, why = k.author_scene([("reference", "Alice", "totally_made_up")])
        self.assertFalse(ok)
        self.assertTrue(any("gate" in r for r in why), why)

    def test_permissive_mode_is_available_but_must_be_asked_for(self):
        k = NarrativeKernel(strict_gate=False)
        k.add_awareness("Alice", "the_code")
        k.world.commit_scene([("learn", "Alice", "totally_made_up")])
        ok, _ = k.author_scene([("reference", "Alice", "totally_made_up")])
        self.assertTrue(ok)

    def test_registered_and_reachable_still_commits(self):
        k = NarrativeKernel()
        k.add_awareness("Alice", "the_code")
        k.world.commit_scene([("learn", "Alice", "the_code")])
        ok, why = k.author_scene([("reference", "Alice", "the_code"),
                                  ("place", "dagger", "hall")])
        self.assertTrue(ok, why)
