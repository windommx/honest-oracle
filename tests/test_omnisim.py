"""Full test suite for the omnisim package (run: python -m pytest tests/
or python deep_core.py --test)."""
import json
import random
import unittest

from omnisim import (
    Vector3, SentimentAnalyzer, IncrementalZ3, Validation, CausalDAG,
    GillespieSSA, NetworkGraph, BiasResolver, SymbolicPerception,
    BifocalMemory, DPOPairBuilder, SimulationEngine, SimulationConfig,
    SimulationResult, AgentAction, ActionType, AgentPerception,
    EventBus, AgentEvent, NeuralSymbolicBridge, LLMActionOutput,
    And, Or, Not, Implies, _Z3,
)

TEST_CLASSES = [
    "TestVector3", "TestSentiment", "TestIncrementalZ3", "TestCausalDAG",
    "TestGillespieSSA", "TestNetworkGraph", "TestBiasResolver",
    "TestBifocalMemory", "TestDPOPairBuilder", "TestSimulationEngine",
    "TestIntegration", "TestSymbolicPerception", "TestEventBus",
    "TestNeuralSymbolicBridge",
]


class TestVector3(unittest.TestCase):
    def test_clamp(self):
        v = Vector3(5, -1, 99)
        self.assertEqual(v, Vector3(1.0, 0.0, 1.0))

    def test_immutability(self):
        with self.assertRaises(AttributeError):
            Vector3().pleasure = 1.0

    def test_decay_rate_scaling(self):
        v = Vector3(1, 1, 1)
        small = v.decay_toward(Vector3(), 0.01)
        large = v.decay_toward(Vector3(), 0.5)
        self.assertGreater(small.arousal, large.arousal)

    def test_blend(self):
        a = Vector3(1, 0, 0).blend(Vector3(-1, 1, 0), 0.5)
        self.assertAlmostEqual(a.pleasure, 0.0, 2)

    def test_delta(self):
        self.assertAlmostEqual(Vector3(1, 0, 0).delta(Vector3(-1, 0, 0)), 2.0, 4)

    def test_to_dict(self):
        d = Vector3(0.5, 0.7, -0.3).to_dict()
        self.assertEqual(set(d.keys()), {"p", "a", "d"})


class TestSentiment(unittest.TestCase):
    def test_neg(self):
        self.assertLess(SentimentAnalyzer().analyze("danger crisis threat"), 0)

    def test_pos(self):
        self.assertGreater(SentimentAnalyzer().analyze("victory hope success"), 0)

    def test_neutral(self):
        self.assertEqual(SentimentAnalyzer().analyze("hello world"), 0.0)


@unittest.skipUnless(_Z3, "z3-solver not installed")
class TestIncrementalZ3(unittest.TestCase):
    def _eng(self):
        e = IncrementalZ3(timeout_ms=500)
        # Alice is dead. Leave can_speak/can_act FREE so the mortality rule
        # derives them — asserting them True here would be self-contradictory
        # and poison the shared solver for every other query.
        e.set_fact("alice__dead", True)
        e.set_fact("bob__dead", False)
        e.set_fact("bob__can_speak", True)
        e.set_fact("bob__can_act", True)
        e.add_rule("mortal_alice",
                    And(Implies(e._b("alice__dead"), Not(e._b("alice__can_speak"))),
                        Implies(e._b("alice__dead"), Not(e._b("alice__can_act")))))
        e.add_rule("mortal_bob",
                    And(Implies(e._b("bob__dead"), Not(e._b("bob__can_speak"))),
                        Implies(e._b("bob__dead"), Not(e._b("bob__can_act")))))
        return e

    def test_dead_cannot_speak(self):
        v = self._eng().validate({"alice__can_speak": True})
        self.assertFalse(v.valid)
        self.assertTrue(len(v.violated_rules) > 0)

    def test_alive_can_speak(self):
        self.assertTrue(self._eng().validate({"bob__can_speak": True}).valid)

    def test_push_pop_isolation(self):
        e = self._eng()
        e.validate({"alice__can_speak": True})  # UNSAT, popped
        v2 = e.validate({"bob__can_speak": True})
        self.assertTrue(v2.valid)

    def test_commit_persists(self):
        e = self._eng()
        e.commit("bob__dead", True)
        v = e.validate({"bob__can_speak": True})
        self.assertFalse(v.valid)

    def test_location_exclusive(self):
        e = IncrementalZ3(timeout_ms=500)
        e.set_fact("x__at__a", True)
        e.add_rule("loc_excl", Not(And(e._b("x__at__a"), e._b("x__at__b"))))
        self.assertFalse(e.validate({"x__at__b": True}).valid)

    def test_causal_chain(self):
        e = IncrementalZ3(timeout_ms=500)
        e.set_fact("bomb", True)
        e.add_rule("cause", Implies(e._b("bomb"), e._b("destroyed")))
        self.assertFalse(e.validate({"destroyed": False}).valid)

    def test_validate_action(self):
        e = self._eng()
        dead = AgentAction("alice", ActionType.SPEAK, content="hi")
        alive = AgentAction("bob", ActionType.SPEAK, content="hi")
        self.assertFalse(e.validate_action(dead).valid)
        self.assertTrue(e.validate_action(alive).valid)

    def test_commit_action_move(self):
        e = IncrementalZ3(timeout_ms=500)
        e.set_fact("r__at__a", True)
        e.add_rule("loc", Not(And(e._b("r__at__a"), e._b("r__at__b"))))
        self.assertFalse(e.validate({"r__at__b": True}).valid)
        e.commit_action(AgentAction("r", ActionType.MOVE, new_location="b"))
        self.assertTrue(e.validate({"r__at__b": True}).valid)

    def test_unsat_core_names_rule(self):
        e = IncrementalZ3(timeout_ms=500)
        e.set_fact("x", True)
        e.add_rule("not_x_rule", Not(e._b("x")))
        v = e.validate({})
        self.assertFalse(v.valid)
        self.assertIn("not_x_rule", v.violated_rules)

    def test_timeout_fails_closed(self):
        # A solver forced to give up (1ms) on a hard parity problem returns
        # `unknown`; fail-closed must report INVALID, not valid.
        e = IncrementalZ3(timeout_ms=1)
        xs = [e._b(f"p{i}") for i in range(60)]
        e.add_rule("parity", Or(*xs))
        for i in range(60):
            e.set_fact(f"p{i}", False)  # forces deep search before UNSAT
        v = e.validate({})
        if v.violated_rules == ["__undetermined__"]:
            self.assertFalse(v.valid)                      # timed out -> invalid
            self.assertTrue(e.validate({}, fail_closed=False).valid)  # opt-out
        else:
            # Solver decided fast (UNSAT); still must be invalid, just not a timeout
            self.assertFalse(v.valid)


class TestCausalDAG(unittest.TestCase):
    def test_add_and_sort(self):
        d = CausalDAG()
        d.add_edge("a", "b")
        d.add_edge("b", "c")
        d.add_edge("a", "c")
        order = d.topological_sort()
        self.assertLess(order.index("a"), order.index("b"))
        self.assertLess(order.index("b"), order.index("c"))

    def test_cycle_detection(self):
        d = CausalDAG()
        d.add_edge("a", "b")
        d.add_edge("b", "c")
        d.add_edge("c", "a")
        self.assertTrue(d.has_cycle())
        with self.assertRaises(ValueError):
            d.topological_sort()

    def test_ancestors(self):
        d = CausalDAG()
        d.add_edge("a", "b")
        d.add_edge("b", "c")
        self.assertEqual(d.ancestors("c"), {"a", "b"})
        self.assertEqual(d.ancestors("a"), set())

    def test_descendants(self):
        d = CausalDAG()
        d.add_edge("a", "b")
        d.add_edge("b", "c")
        self.assertEqual(d.descendants("a"), {"b", "c"})
        self.assertEqual(d.descendants("c"), set())

    def test_causal_paths(self):
        d = CausalDAG()
        d.add_edge("a", "b")
        d.add_edge("b", "d")
        d.add_edge("a", "c")
        d.add_edge("c", "d")
        paths = d.causal_paths("a", "d")
        self.assertEqual(len(paths), 2)

    def test_disconnected(self):
        d = CausalDAG()
        d.add_node("x")
        d.add_node("y")
        order = d.topological_sort()
        self.assertEqual(len(order), 2)

    def test_edge_count(self):
        d = CausalDAG()
        d.add_edge("a", "b")
        d.add_edge("b", "c")
        self.assertEqual(d.edge_count, 2)
        self.assertEqual(d.node_count, 3)


class TestGillespieSSA(unittest.TestCase):
    def test_single_reaction(self):
        g = GillespieSSA(seed=42)
        fired = []
        g.add_reaction("test", lambda: 1.0, lambda: fired.append(True))
        result = g.step()
        self.assertIsNotNone(result)
        dt, name, eff = result
        self.assertEqual(name, "test")
        self.assertGreater(dt, 0)
        eff()
        self.assertEqual(fired, [True])

    def test_deterministic_with_seed(self):
        results = []
        for _ in range(2):
            g = GillespieSSA(seed=123)
            g.add_reaction("a", lambda: 0.5, lambda: None)
            g.add_reaction("b", lambda: 0.5, lambda: None)
            r = g.step()
            results.append((r[0], r[1]))
        self.assertEqual(results[0], results[1])

    def test_zero_propensity_absorbing(self):
        g = GillespieSSA(seed=1)
        g.add_reaction("dead", lambda: 0.0, lambda: None)
        self.assertIsNone(g.step())
        self.assertTrue(g.is_absorbing)

    def test_scheduled_event_wins(self):
        g = GillespieSSA(seed=42)
        g.add_reaction("slow", lambda: 0.001, lambda: None)
        g.schedule_event(0.1, "fast", lambda: None)
        r = g.step()
        self.assertEqual(r[1], "fast")

    def test_time_monotonic(self):
        g = GillespieSSA(seed=42)
        g.add_reaction("a", lambda: 1.0, lambda: None)
        times = []
        for _ in range(10):
            r = g.step()
            if r is None:
                break
            times.append(g.time)
        for i in range(1, len(times)):
            self.assertGreaterEqual(times[i], times[i - 1])

    def test_propensity_weighted_selection(self):
        """With prop 100 vs 1, the high one should be selected most often."""
        counts = {"high": 0, "low": 0}
        for seed in range(200):
            g = GillespieSSA(seed=seed)
            g.add_reaction("high", lambda: 100.0, lambda: None)
            g.add_reaction("low", lambda: 1.0, lambda: None)
            r = g.step()
            if r:
                counts[r[1]] += 1
        self.assertGreater(counts["high"], counts["low"] * 5)

    def test_run_returns_trajectory(self):
        g = GillespieSSA(seed=42)
        g.add_reaction("tick", lambda: 10.0, lambda: None)
        results = g.run(max_time=5.0, max_steps=100)
        self.assertGreater(len(results), 0)
        self.assertLessEqual(g.time, 5.1)

    def test_run_applies_effects(self):
        g = GillespieSSA(seed=7)
        hits = []
        g.add_reaction("tick", lambda: 5.0, lambda: hits.append(1))
        log = g.run(max_time=2.0, max_steps=200)
        self.assertEqual(len(hits), len(log))
        self.assertGreater(len(hits), 0)

    def test_step_returns_effect_without_calling(self):
        g = GillespieSSA(seed=42)
        called = []
        g.add_reaction("x", lambda: 1.0, lambda: called.append(1))
        g.step()
        self.assertEqual(called, [])  # effect NOT called by step


class TestNetworkGraph(unittest.TestCase):
    def test_degree_centrality(self):
        g = NetworkGraph()
        g.add_edge("hub", "a", 0.9)
        g.add_edge("hub", "b", 0.9)
        g.add_edge("hub", "c", 0.9)
        g.add_edge("a", "b", 0.5)
        dc = g.degree_centrality()
        self.assertGreater(dc["hub"], dc["b"])

    def test_ic_simulate_cascade(self):
        g = NetworkGraph()
        g.add_edge("a", "b", 1.0)  # 100% activation
        g.add_edge("b", "c", 1.0)
        rng = random.Random(42)
        count = g.ic_simulate({"a"}, rng)
        self.assertEqual(count, 3)

    def test_ic_simulate_no_cascade(self):
        g = NetworkGraph()
        g.add_edge("a", "b", 0.0)  # 0% activation
        rng = random.Random(42)
        count = g.ic_simulate({"a"}, rng)
        self.assertEqual(count, 1)

    def test_kkt_greedy_selects_hub(self):
        g = NetworkGraph()
        for i in range(5):
            g.add_node(f"leaf_{i}")
        g.add_edge("hub", "leaf_0", 0.9)
        g.add_edge("hub", "leaf_1", 0.9)
        g.add_edge("hub", "leaf_2", 0.9)
        g.add_edge("hub", "leaf_3", 0.9)
        g.add_edge("hub", "leaf_4", 0.9)
        g.add_edge("leaf_0", "leaf_1", 0.1)

        seeds = g.kkt_greedy(k=1, mc_runs=200, seed=42)
        self.assertEqual(seeds, ["hub"])

    def test_kkt_chain_selects_start(self):
        g = NetworkGraph()
        g.add_edge("A", "B", 0.9)
        g.add_edge("B", "C", 0.9)
        g.add_edge("C", "D", 0.9)
        seeds = g.kkt_greedy(k=1, mc_runs=300, seed=42)
        self.assertEqual(seeds, ["A"])

    def test_neighbors(self):
        g = NetworkGraph()
        g.add_edge("a", "b", 0.7)
        g.add_edge("a", "c", 0.3)
        n = g.neighbors("a")
        self.assertEqual(n, {"b": 0.7, "c": 0.3})


class TestBiasResolver(unittest.TestCase):
    def test_catastrophizing(self):
        b = BiasResolver()
        r = b.process("Market crashed", Vector3(-0.3, 0.8, 0.1), -0.8)
        self.assertEqual(r.bias, "catastrophizing")
        self.assertGreater(r.threat_multiplier, 1.5)

    def test_denial(self):
        b = BiasResolver()
        r = b.process("Revenue down", Vector3(0.7, 0.2, 0.5), -0.6)
        self.assertEqual(r.bias, "denial")
        self.assertLess(r.threat_multiplier, 1.0)

    def test_exclusive_group_no_contradiction(self):
        b = BiasResolver()
        r = b.process("Crisis erupts", Vector3(0.5, 0.8, 0.2), -0.6)
        applied = r.bias or ""
        self.assertFalse(
            "catastrophizing" in applied and "denial" in applied,
            f"Contradictory biases: {r.bias}"
        )

    def test_tunnel_vision_suppresses(self):
        b = BiasResolver()
        r = b.process("Good news", Vector3(-0.5, 0.9, 0.1), 0.7)
        self.assertTrue(r.suppressed)
        self.assertEqual(r.perceived, "[FILTERED OUT]")

    def test_no_bias_neutral(self):
        b = BiasResolver()
        r = b.process("Cloudy weather", Vector3(0, 0.3, 0.5), 0.0)
        self.assertIsNone(r.bias)

    def test_authority_bias(self):
        b = BiasResolver()
        r = b.process("Orders", Vector3(-0.2, 0.5, 0.1), -0.2, source_authority=0.9)
        self.assertEqual(r.bias, "authority")

    def test_optimism_bias(self):
        b = BiasResolver()
        r = b.process("Slight decline", Vector3(0.8, 0.2, 0.5), -0.3)
        self.assertEqual(r.bias, "optimism")
        self.assertLess(r.threat_multiplier, 1.0)

    def test_overload(self):
        self.assertTrue(BiasResolver.is_overloaded(Vector3(-0.5, 0.9, 0.1)))
        self.assertFalse(BiasResolver.is_overloaded(Vector3(0, 0.3, 0.5)))


class TestBifocalMemory(unittest.TestCase):
    def test_recall(self):
        m = BifocalMemory()
        m.register_agent("a", "Alice")
        m.add_fact("f1", "bomb", visibility=["a"])
        self.assertEqual(m.recall("a")[0].objective, "bomb")

    def test_visibility(self):
        m = BifocalMemory()
        m.register_agent("a", "Alice")
        m.register_agent("b", "Bob")
        m.add_fact("f1", "secret", visibility=["a"])
        m.add_fact("f2", "public", visibility=["public"])
        self.assertEqual(len(m.recall("a")), 2)
        self.assertEqual(len(m.recall("b")), 1)

    def test_distortion(self):
        m = BifocalMemory()
        m.register_agent("a", "Alice")
        m.add_fact("f1", "clear")
        m.distort("a", "f1", "DANGER", "catastrophizing", 0.3)
        e = m.recall("a")[0]
        self.assertEqual(e.perceived, "DANGER")
        self.assertEqual(e.bias, "catastrophizing")
        self.assertEqual(e.confidence, 0.3)

    def test_epistemic_gap(self):
        m = BifocalMemory()
        m.register_agent("a", "Alice")
        m.add_fact("f1", "500 troops")
        m.distort("a", "f1", "5000 troops", "catastrophizing")
        g = m.epistemic_gap("a", "f1")
        self.assertTrue(g["gap"])

    def test_no_gap_without_distortion(self):
        m = BifocalMemory()
        m.register_agent("a", "Alice")
        m.add_fact("f1", "sunny")
        self.assertFalse(m.epistemic_gap("a", "f1")["gap"])

    def test_nonexistent(self):
        m = BifocalMemory()
        self.assertIsNone(m.epistemic_gap("x", "none"))


class TestDPOPairBuilder(unittest.TestCase):
    def test_build_pairs(self):
        b = DPOPairBuilder()
        b.add_run("s1", [{"time": 0, "emotions": {"a": {"p": 0, "a": 0.1, "d": 0.5}}}], True)
        b.add_run("s1", [{"time": 0, "emotions": {"a": {"p": 0, "a": 0.1, "d": 0.5}}}], False)
        pairs = b.build_pairs()
        self.assertEqual(len(pairs), 1)
        self.assertIn("chosen", pairs[0])
        self.assertIn("rejected", pairs[0])

    def test_no_pairs_without_both_outcomes(self):
        b = DPOPairBuilder()
        b.add_run("s1", [], True)
        b.add_run("s1", [], True)
        self.assertEqual(len(b.build_pairs()), 0)

    def test_chosen_is_stable_by_default(self):
        b = DPOPairBuilder()
        stable = [{"time": 0, "emotions": {"a": {"p": 0.5, "a": 0.1, "d": 0.5}}}]
        crisis = [{"time": 0, "emotions": {"a": {"p": -0.9, "a": 0.95, "d": 0.0}}}]
        b.add_run("s1", crisis, True)
        b.add_run("s1", stable, False)
        p = b.build_pairs()[0]
        # chosen must be the non-tipping (stable) run, not the crisis run
        self.assertEqual(p["chosen"], b._serialize(stable))
        self.assertEqual(p["rejected"], b._serialize(crisis))
        self.assertIn("avoids a runaway crisis", p["prompt"])

    def test_prefer_tipping_flips_direction(self):
        b = DPOPairBuilder()
        stable = [{"time": 0, "emotions": {"a": {"p": 0.5, "a": 0.1, "d": 0.5}}}]
        crisis = [{"time": 0, "emotions": {"a": {"p": -0.9, "a": 0.95, "d": 0.0}}}]
        b.add_run("s1", crisis, True)
        b.add_run("s1", stable, False)
        p = b.build_pairs(prefer="tipping")[0]
        self.assertEqual(p["chosen"], b._serialize(crisis))
        self.assertEqual(p["rejected"], b._serialize(stable))

    def test_invalid_prefer_raises(self):
        with self.assertRaises(ValueError):
            DPOPairBuilder().build_pairs(prefer="whatever")

    def test_stratified_cap(self):
        b = DPOPairBuilder()
        for i in range(20):
            b.add_run("s1", [{"time": 0, "emotions": {}}], i % 2 == 0)
        pairs = b.build_pairs(max_per_scenario=5)
        self.assertEqual(len(pairs), 5)

    def test_stats(self):
        b = DPOPairBuilder()
        b.add_run("s1", [], True)
        b.add_run("s1", [], False)
        b.add_run("s2", [], True)
        s = b.stats()
        self.assertEqual(s["scenarios"], 2)
        self.assertEqual(s["total_runs"], 3)

    def test_export_jsonl(self):
        import tempfile, os
        b = DPOPairBuilder()
        b.add_run("s1", [{"time": 0, "emotions": {}}], True)
        b.add_run("s1", [{"time": 0, "emotions": {}}], False)
        path = os.path.join(tempfile.gettempdir(), "test_dpo.jsonl")
        n = b.export_jsonl(path)
        self.assertEqual(n, 1)
        with open(path) as f:
            line = json.loads(f.readline())
            self.assertIn("prompt", line)
            self.assertIn("chosen", line)
            self.assertIn("rejected", line)
        os.unlink(path)


class TestSimulationEngine(unittest.TestCase):
    def test_basic_run(self):
        e = SimulationEngine(SimulationConfig(), seed=42)
        e.add_agent("a", "A", "r")
        result = e.run(max_time=5.0)
        self.assertGreater(len(result.trajectory), 0)

    def test_crisis_increases_arousal(self):
        e = SimulationEngine(SimulationConfig(), seed=42)
        e.add_agent("a", "A", "r", Vector3(0, 0.1, 0.5))
        e.inject_crisis(1.0, "Explosion", intensity=0.9)
        result = e.run(max_time=10.0)
        initial = result.trajectory[0]["emotions"]["a"]["a"]
        peak = max(s["emotions"]["a"]["a"] for s in result.trajectory[1:])
        self.assertGreater(peak, initial)

    def test_contagion_spreads_emotion(self):
        cfg = SimulationConfig(contagion_rate=1.0, decay_rate=0.01)
        e = SimulationEngine(cfg, seed=42)
        e.add_agent("panicked", "P", "r", Vector3(-0.8, 0.9, 0.1))
        e.add_agent("calm", "C", "r", Vector3(0.5, 0.1, 0.7))
        e.add_trust_edge("panicked", "calm", trust=0.9)
        result = e.run(max_time=5.0, max_steps=100)
        calm_initial = 0.1
        calm_final = result.trajectory[-1]["emotions"]["calm"]["a"]
        self.assertGreater(calm_final, calm_initial)

    def test_intervention_calms(self):
        e = SimulationEngine(SimulationConfig(), seed=42)
        e.add_agent("a", "A", "r", Vector3(-0.5, 0.6, 0.3))
        e.inject_crisis(1.0, "Emergency", intensity=0.8)
        e.schedule_intervention(5.0)
        result = e.run(max_time=15.0)
        mid_idx = len(result.trajectory) // 2
        final_idx = len(result.trajectory) - 1
        mid_a = result.trajectory[mid_idx]["emotions"]["a"]["a"]
        final_a = result.trajectory[final_idx]["emotions"]["a"]["a"]
        self.assertLessEqual(final_a, mid_a + 0.2)

    def test_dag_recorded(self):
        e = SimulationEngine(SimulationConfig(), seed=42)
        e.add_agent("a", "A", "r")
        e.add_agent("b", "B", "r")
        e.add_trust_edge("a", "b", trust=0.9)
        e.inject_crisis(0.5, "Boom", intensity=0.9)
        result = e.run(max_time=10.0, max_steps=100)
        self.assertGreater(result.dag_nodes, 2)
        self.assertGreater(result.dag_edges, 0)

    def test_z3_wired(self):
        if not _Z3:
            self.skipTest("z3 not installed")
        e = SimulationEngine(SimulationConfig(), seed=42)
        e.add_agent("a", "A", "r")
        z = e.z3_engine
        self.assertIsNotNone(z)
        snap = z.snapshot()
        self.assertTrue(len(snap["permanent"]) > 0)

    def test_tipping_point_detected(self):
        cfg = SimulationConfig(tipping_threshold=0.3, tipping_arousal=0.5,
                                tipping_pleasure=-0.1, contagion_rate=0.5)
        e = SimulationEngine(cfg, seed=42)
        for i in range(5):
            e.add_agent(f"p{i}", f"P{i}", "r", Vector3(-0.3, 0.4, 0.3))
        for i in range(4):
            e.add_trust_edge(f"p{i}", f"p{i+1}", trust=0.9)
        e.inject_crisis(0.5, "Nuclear meltdown", intensity=1.0)
        result = e.run(max_time=20.0, max_steps=200)
        peak = max(max(e["a"] for e in s["emotions"].values())
                   for s in result.trajectory)
        self.assertGreater(peak, 0.3)

    def test_dpo_builder_integration(self):
        cfg = SimulationConfig(contagion_rate=0.3, decay_rate=0.05)
        dpo = DPOPairBuilder()

        e1 = SimulationEngine(cfg, seed=42)
        e1.add_agent("a", "A", "r", Vector3(-0.5, 0.6, 0.2))
        e1.inject_crisis(1.0, "Crisis", intensity=1.0)
        r1 = e1.run(max_time=10.0)
        dpo.add_run("crisis", r1.trajectory, r1.tipping_point is not None)

        e2 = SimulationEngine(cfg, seed=99)
        e2.add_agent("a", "A", "r", Vector3(0.0, 0.1, 0.8))
        r2 = e2.run(max_time=10.0)
        dpo.add_run("crisis", r2.trajectory, r2.tipping_point is not None)

        stats = dpo.stats()
        self.assertEqual(stats["total_runs"], 2)

    def test_memory_integration(self):
        e = SimulationEngine(SimulationConfig(), seed=42)
        e.add_agent("a", "Alice", "spy")
        e.inject_crisis(0.5, "Secret intel", intensity=0.5)
        e.run(max_time=5.0)
        entries = e.memory.recall("a")
        self.assertGreater(len(entries), 0)


class TestIntegration(unittest.TestCase):
    """Full pipeline: all algorithms working together."""

    def test_crisis_simulation_with_all_components(self):
        cfg = SimulationConfig(contagion_rate=0.4, decay_rate=0.05,
                                tipping_threshold=0.4)
        e = SimulationEngine(cfg, seed=42)

        e.add_agent("ceo", "CEO", "leader", Vector3(-0.2, 0.3, 0.8))
        e.add_agent("pr", "PR Dir", "advisor", Vector3(-0.1, 0.4, 0.6))
        e.add_agent("staff", "Staff", "worker", Vector3(0.0, 0.1, 0.4))

        e.add_trust_edge("ceo", "pr", 0.9)
        e.add_trust_edge("pr", "staff", 0.7)
        e.add_trust_edge("ceo", "staff", 0.5)

        e.inject_crisis(2.0, "CEO tweet goes viral", intensity=0.9)
        e.schedule_intervention(8.0)

        result = e.run(max_time=20.0, max_steps=300)

        self.assertGreater(len(result.trajectory), 5)
        self.assertGreater(result.total_events, 0)

        self.assertGreater(result.dag_nodes, 3)
        self.assertGreater(result.dag_edges, 2)

        pre_crisis = result.trajectory[0]["emotions"]["ceo"]["a"]
        post_crisis = max(s["emotions"]["ceo"]["a"] for s in result.trajectory[1:])
        self.assertGreater(post_crisis, pre_crisis)

        crisis_ancestors = e.dag.ancestors("staff")
        crisis_nodes = [n for n in crisis_ancestors if "crisis" in n]
        self.assertGreater(len(crisis_nodes), 0)

        dpo = DPOPairBuilder()
        dpo.add_run("pr_crisis", result.trajectory,
                     result.tipping_point is not None)
        self.assertEqual(dpo.stats()["total_runs"], 1)

    def test_kkt_finds_influencer_then_intervene(self):
        """Use KKT to find best intervention target, then simulate."""
        g = NetworkGraph()
        g.add_edge("influencer", "a", 0.8)
        g.add_edge("influencer", "b", 0.8)
        g.add_edge("a", "c", 0.6)
        g.add_edge("b", "c", 0.6)
        g.add_edge("observer", "d", 0.3)

        seeds = g.kkt_greedy(k=1, mc_runs=300, seed=42)
        self.assertEqual(seeds, ["influencer"])

        cfg = SimulationConfig(contagion_rate=0.5, decay_rate=0.05)
        e = SimulationEngine(cfg, seed=42)
        for n in g.nodes:
            e.add_agent(n, n, "agent", location="hq")
        for src in g.nodes:
            for dst, w in g.neighbors(src).items():
                e.add_trust_edge(src, dst, trust=w)

        e.inject_crisis(1.0, "Targeted crisis", intensity=0.9)
        result = e.run(max_time=10.0)

        peak_influencer = max(s["emotions"]["influencer"]["a"]
                              for s in result.trajectory)
        peak_observer = max(s["emotions"]["observer"]["a"]
                            for s in result.trajectory)
        self.assertGreaterEqual(peak_influencer, peak_observer - 0.1)


class TestSymbolicPerception(unittest.TestCase):
    def test_catastrophizing_is_structured(self):
        b = BiasResolver()
        sp = b.process_symbolic("Market crashed", Vector3(-0.3, 0.8, 0.1), -0.8)
        self.assertIn("catastrophizing", sp.biases_applied)
        self.assertGreater(sp.perceived_threat_level, 1.5)
        self.assertFalse(sp.suppressed)
        self.assertIn("CRITICAL", sp.to_prompt_context())

    def test_tunnel_vision_suppressed(self):
        b = BiasResolver()
        sp = b.process_symbolic("Good news", Vector3(-0.5, 0.9, 0.1), 0.7)
        self.assertTrue(sp.suppressed)
        self.assertEqual(sp.to_generation_directives()["suppress"], True)
        self.assertFalse(sp.to_z3_constraints("a")["a__aware"])

    def test_neutral_is_baseline(self):
        b = BiasResolver()
        sp = b.process_symbolic("Cloudy weather", Vector3(0, 0.3, 0.5), 0.0)
        self.assertEqual(sp.biases_applied, ())
        self.assertAlmostEqual(sp.perceived_threat_level, 1.0, 4)
        self.assertTrue(sp.to_z3_constraints("a")["a__aware"])

    def test_must_react_on_high_threat(self):
        b = BiasResolver()
        sp = b.process_symbolic("Bombs", Vector3(-0.5, 0.95, 0.05), -0.9)
        self.assertTrue(sp.to_z3_constraints("x").get("x__must_react", False))


class TestEventBus(unittest.TestCase):
    def test_delay_delivery(self):
        bus = EventBus()
        got = []
        bus.subscribe("b", ["speech"], lambda e: got.append(e))
        bus.publish(AgentEvent("speech", "a", "hi", 0.0), delay=0.5)
        bus.tick(0.3)
        self.assertEqual(len(got), 0)   # not due yet
        bus.tick(0.3)
        self.assertEqual(len(got), 1)   # now past 0.5

    def test_no_echo_to_sender(self):
        bus = EventBus()
        got = []
        bus.subscribe("a", ["speech"], lambda e: got.append(e))
        bus.publish(AgentEvent("speech", "a", "hi", 0.0))
        bus.tick(0.1)
        self.assertEqual(got, [])

    def test_targeted_vs_broadcast(self):
        bus = EventBus()
        b_got, c_got = [], []
        bus.subscribe("b", ["speech"], lambda e: b_got.append(e))
        bus.subscribe("c", ["speech"], lambda e: c_got.append(e))
        bus.publish(AgentEvent("speech", "a", "to b only", 0.0, target_agents=("b",)))
        bus.tick(0.1)
        self.assertEqual(len(b_got), 1)
        self.assertEqual(len(c_got), 0)

    def test_event_type_filter(self):
        bus = EventBus()
        got = []
        bus.subscribe("b", ["action"], lambda e: got.append(e))
        bus.publish(AgentEvent("speech", "a", "x", 0.0))
        bus.tick(0.1)
        self.assertEqual(got, [])

    def test_handler_error_isolated(self):
        bus = EventBus()
        ok = []
        bus.subscribe("b", ["speech"], lambda e: (_ for _ in ()).throw(RuntimeError("boom")))
        bus.subscribe("c", ["speech"], lambda e: ok.append(e))
        bus.publish(AgentEvent("speech", "a", "x", 0.0))
        bus.tick(0.1)
        self.assertEqual(len(ok), 1)   # second handler still ran
        self.assertTrue(any(e.event_type == "handler_error" for e in bus.delivered))


class TestNeuralSymbolicBridge(unittest.TestCase):
    def test_parse_valid(self):
        br = NeuralSymbolicBridge()
        out = br.parse('{"action":"attack","confidence":0.7,'
                       '"preconditions":{"has_weapon":true}}')
        self.assertIsNotNone(out)
        self.assertEqual(out.action, "attack")
        self.assertEqual(out.preconditions, {"has_weapon": True})

    def test_parse_invalid_returns_none(self):
        br = NeuralSymbolicBridge()
        self.assertIsNone(br.parse("not json"))
        self.assertIsNone(br.parse('{"confidence":0.5}'))   # missing action
        self.assertIsNone(br.parse('[1,2,3]'))

    def test_confidence_clamped(self):
        br = NeuralSymbolicBridge()
        out = br.parse('{"action":"x","confidence":5,"preconditions":{}}')
        self.assertEqual(out.confidence, 1.0)

    def test_validate_fail_closed_on_none(self):
        br = NeuralSymbolicBridge()
        valid, viol = br.validate(None, None)
        self.assertFalse(valid)
        self.assertTrue(viol)

    @unittest.skipUnless(_Z3, "z3-solver not installed")
    def test_validate_against_z3(self):
        br = NeuralSymbolicBridge()
        e = IncrementalZ3(timeout_ms=500)
        e.set_fact("alice__dead", True)
        e.add_rule("mortal_alice",
                   Implies(e._b("alice__dead"), Not(e._b("alice__can_act"))))
        # LLM wants to act while dead -> precondition can_act must hold -> UNSAT
        bad = br.parse('{"action":"run","confidence":0.9,'
                       '"preconditions":{"alice__can_act":true}}')
        valid, viol = br.validate(e, bad)
        self.assertFalse(valid)
        self.assertIn("mortal_alice", viol)
        # A precondition that does not contradict any rule -> valid
        ok = br.parse('{"action":"wait","confidence":0.9,"preconditions":{}}')
        self.assertTrue(br.validate(e, ok)[0])


# ── New: time-bounded aftermath window, phase labels, recovery flag ──────

class TestAftermath(unittest.TestCase):
    def _tip_engine(self, observation_time=8.0, interventions=()):
        cfg = SimulationConfig(
            tipping_threshold=0.3, tipping_arousal=0.5, tipping_pleasure=-0.1,
            contagion_rate=0.5, decay_rate=0.02,
            tipping_observation_time=observation_time)
        e = SimulationEngine(cfg, seed=42)
        for i in range(5):
            e.add_agent(f"p{i}", f"P{i}", "r", Vector3(-0.3, 0.4, 0.3))
        for i in range(4):
            e.add_trust_edge(f"p{i}", f"p{i+1}", 0.9)
        e.inject_crisis(0.5, "meltdown", intensity=1.0)
        for t in interventions:
            e.schedule_intervention(t)
        return e

    def test_phases_and_tipping_recorded(self):
        r = self._tip_engine().run(max_time=40, max_steps=400)
        self.assertIsNotNone(r.tipping_point)
        self.assertIsNotNone(r.tipping_time)
        self.assertGreater(r.tipping_time, 0.0)
        phases = {s["phase"] for s in r.trajectory}
        self.assertTrue(phases <= {"pre", "tipping", "aftermath"})
        self.assertEqual(r.trajectory[0]["phase"], "pre")
        self.assertIn("tipping", phases)
        self.assertIn("aftermath", phases)
        self.assertIsInstance(r.recovered, bool)
        self.assertFalse(r.recovered)   # no intervention -> stays tipped

    def test_window_scales_with_config(self):
        short = self._tip_engine(observation_time=1.0).run(max_time=40, max_steps=400)
        long = self._tip_engine(observation_time=8.0).run(max_time=40, max_steps=400)
        self.assertAlmostEqual(short.tipping_time, long.tipping_time, places=6)
        # A longer observation window must observe at least as long.
        self.assertGreaterEqual(long.final_time, short.final_time)

    def test_recovery_detected_with_interventions(self):
        r = self._tip_engine(interventions=(1, 2, 3, 4, 5, 6)).run(
            max_time=40, max_steps=400)
        self.assertIsNotNone(r.tipping_time)
        self.assertTrue(r.recovered)    # interventions pulled it back below threshold

    def test_no_tipping_leaves_fields_none(self):
        e = SimulationEngine(SimulationConfig(), seed=7)
        e.add_agent("a", "A", "r", Vector3(0.0, 0.1, 0.5))
        r = e.run(max_time=5.0)
        self.assertIsNone(r.tipping_point)
        self.assertIsNone(r.tipping_time)
        self.assertIsNone(r.recovered)
        self.assertTrue(all(s["phase"] == "pre" for s in r.trajectory))


# ── New: Z3-gated action layer (fail-closed) + Bifocal write path ────────

@unittest.skipUnless(_Z3, "z3-solver not installed")
class TestActionGate(unittest.TestCase):
    def test_alive_action_allowed_and_recorded(self):
        e = SimulationEngine(SimulationConfig(), seed=1)
        e.add_agent("a", "A", "r")
        res = e.attempt_action(AgentAction("a", ActionType.SPEAK, content="hi"))
        self.assertEqual(res.action_type, ActionType.SPEAK)
        self.assertFalse(res.blocked)
        # write path: the action is now in the agent's memory
        self.assertTrue(any("performed speak" in m.objective
                            for m in e.memory.recall("a")))

    def test_dead_action_blocked_names_rule(self):
        e = SimulationEngine(SimulationConfig(), seed=1)
        e.add_agent("a", "A", "r")
        e.incapacitate("a")
        res = e.attempt_action(AgentAction("a", ActionType.SPEAK))
        self.assertEqual(res.action_type, ActionType.BLOCKED)
        self.assertTrue(res.blocked)
        self.assertIn("mort_a", res.reason)
        # blocked action must NOT be recorded as if it happened
        self.assertFalse(any("performed speak" in m.objective
                             for m in e.memory.recall("a")))

    def test_move_commits_location(self):
        e = SimulationEngine(SimulationConfig(), seed=1)
        e.add_agent("a", "A", "r", location="hq")
        res = e.attempt_action(AgentAction("a", ActionType.MOVE, new_location="field"))
        self.assertEqual(res.action_type, ActionType.MOVE)
        perm = e.z3_engine.snapshot()["permanent"]
        self.assertTrue(any(n == "a__at__field" and v for n, v in perm))


class TestActionPolicyInLoop(unittest.TestCase):
    def test_policy_actions_recorded_during_run(self):
        e = SimulationEngine(SimulationConfig(), seed=3)
        e.add_agent("a", "A", "r", Vector3(0.0, 0.2, 0.5))
        e.inject_crisis(0.5, "x", intensity=0.5)
        calls = {"n": 0}

        def policy(aid, state):
            calls["n"] += 1
            return AgentAction(aid, ActionType.OBSERVE)

        e.run(max_time=5.0, action_policy=policy)
        self.assertGreater(calls["n"], 0)
        self.assertTrue(any("performed observe" in m.objective
                            for m in e.memory.recall("a")))


# ── New: honest aftermath metrics (derived from real snapshots) ──────────

class TestAftermathMetrics(unittest.TestCase):
    def _tip_engine(self, interventions=()):
        cfg = SimulationConfig(
            tipping_threshold=0.3, tipping_arousal=0.5, tipping_pleasure=-0.1,
            contagion_rate=0.5, decay_rate=0.02, tipping_observation_time=8.0)
        e = SimulationEngine(cfg, seed=42)
        for i in range(5):
            e.add_agent(f"p{i}", f"P{i}", "r", Vector3(-0.3, 0.4, 0.3))
        for i in range(4):
            e.add_trust_edge(f"p{i}", f"p{i+1}", 0.9)
        e.inject_crisis(0.5, "meltdown", intensity=1.0)
        for t in interventions:
            e.schedule_intervention(t)
        return e

    def test_metrics_present_and_shaped(self):
        r = self._tip_engine().run(max_time=40, max_steps=400)
        self.assertIsInstance(r.aftermath, dict)
        for key in ("cascade_count", "peak_arousal", "affected_agents",
                    "total_damage", "recovery_time"):
            self.assertIn(key, r.aftermath)
        self.assertIsInstance(r.aftermath["cascade_count"], int)
        self.assertGreaterEqual(r.aftermath["total_damage"], 0.0)
        self.assertGreater(r.aftermath["peak_arousal"], self._tip_engine().cfg.tipping_arousal)
        self.assertTrue(set(r.aftermath["affected_agents"]) <= {f"p{i}" for i in range(5)})

    def test_recovery_time_none_without_intervention(self):
        r = self._tip_engine().run(max_time=40, max_steps=400)
        self.assertFalse(r.recovered)
        self.assertIsNone(r.aftermath["recovery_time"])

    def test_recovery_time_set_with_intervention(self):
        r = self._tip_engine(interventions=(1, 2, 3, 4, 5, 6)).run(
            max_time=40, max_steps=400)
        self.assertTrue(r.recovered)
        self.assertIsNotNone(r.aftermath["recovery_time"])
        self.assertGreaterEqual(r.aftermath["recovery_time"], 0.0)

    def test_no_aftermath_when_no_tipping(self):
        e = SimulationEngine(SimulationConfig(), seed=7)
        e.add_agent("a", "A", "r", Vector3(0.0, 0.1, 0.5))
        r = e.run(max_time=5.0)
        self.assertIsNone(r.aftermath)
