"""Runnable end-to-end demo of the full pipeline."""
from __future__ import annotations
from .foundations import Vector3, SimulationConfig
from .social_contagion import NetworkGraph
from .engine import SimulationEngine
from .cognitive_bias import BiasResolver
from .dpo_builder import DPOPairBuilder


def run_demo():
    print("=" * 65)
    print("  OMNISIM DEEP CORE v4.1 — CRISIS SIMULATION DEMO")
    print("=" * 65)

    # --- Phase 1: KKT finds the key influencer ---
    print("\n[Phase 1] KKT Influence Maximization")
    net = NetworkGraph()
    net.add_edge("ceo", "vp_eng", 0.8)
    net.add_edge("ceo", "vp_sales", 0.8)
    net.add_edge("vp_eng", "eng_1", 0.7)
    net.add_edge("vp_eng", "eng_2", 0.7)
    net.add_edge("vp_sales", "sales_1", 0.6)
    net.add_edge("sales_1", "intern", 0.4)

    seeds = net.kkt_greedy(k=2, mc_runs=500, seed=42)
    print(f"  Best seed set (k=2): {seeds}")

    dc = net.degree_centrality()
    print(f"  Degree centrality: {', '.join(f'{k}={v:.2f}' for k, v in dc.items())}")

    # --- Phase 2: Simulate crisis ---
    print("\n[Phase 2] Gillespie SSA Simulation")
    cfg = SimulationConfig(contagion_rate=0.4, decay_rate=0.03, tipping_threshold=0.4)
    engine = SimulationEngine(cfg, seed=42)

    agents = [
        ("ceo", "CEO", "leader", Vector3(-0.2, 0.3, 0.8)),
        ("vp_eng", "VP Eng", "manager", Vector3(0.0, 0.2, 0.6)),
        ("vp_sales", "VP Sales", "manager", Vector3(0.1, 0.2, 0.6)),
        ("eng_1", "Engineer 1", "worker", Vector3(0.0, 0.1, 0.4)),
        ("eng_2", "Engineer 2", "worker", Vector3(0.0, 0.1, 0.4)),
        ("sales_1", "Sales Lead", "worker", Vector3(0.0, 0.1, 0.4)),
        ("intern", "Intern", "observer", Vector3(0.1, 0.05, 0.2)),
    ]

    for aid, name, role, em in agents:
        engine.add_agent(aid, name, role, em)

    for src in net.nodes:
        for dst, w in net.neighbors(src).items():
            engine.add_trust_edge(src, dst, trust=w)

    engine.inject_crisis(3.0, "CEO offensive tweet goes viral: 50K retweets", intensity=0.9)

    result_no_interv = engine.run(max_time=25.0, max_steps=500)

    print(f"  Events: {result_no_interv.total_events}")
    print(f"  Tipping point: tick {result_no_interv.tipping_point}")
    print(f"  DAG: {result_no_interv.dag_nodes} nodes, {result_no_interv.dag_edges} edges")
    print(f"  Final time: {result_no_interv.final_time:.2f}")

    print("\n  Emotion trajectory (sampled):")
    for i, snap in enumerate(result_no_interv.trajectory):
        if i % max(1, len(result_no_interv.trajectory) // 8) == 0:
            emos = " ".join(f"{aid}:A={e['a']:.2f}"
                            for aid, e in snap["emotions"].items())
            print(f"    t={snap['time']:6.2f} | {emos}")

    # --- Phase 3: Causal analysis ---
    print("\n[Phase 3] Causal DAG Analysis")
    staff_ancestors = engine.dag.ancestors("intern")
    print(f"  Intern's causal ancestors: {staff_ancestors}")
    ceo_descendants = engine.dag.descendants("ceo")
    print(f"  CEO's causal descendants: {ceo_descendants}")

    # --- Phase 4: DPO pair construction ---
    print("\n[Phase 4] DPO Pair Construction")

    engine2 = SimulationEngine(SimulationConfig(contagion_rate=0.2, decay_rate=0.1), seed=99)
    for aid, name, role, em in agents:
        engine2.add_agent(aid, name, role, Vector3(0.0, 0.05, 0.5))
    for src in net.nodes:
        for dst, w in net.neighbors(src).items():
            engine2.add_trust_edge(src, dst, trust=w * 0.3)
    result_calm = engine2.run(max_time=25.0, max_steps=500)

    dpo = DPOPairBuilder()
    dpo.add_run("ceo_crisis", result_no_interv.trajectory,
                 result_no_interv.tipping_point is not None,
                 {"scenario": "high_intensity"})
    dpo.add_run("ceo_crisis", result_calm.trajectory,
                 result_calm.tipping_point is not None,
                 {"scenario": "low_intensity"})

    pairs = dpo.build_pairs()
    stats = dpo.stats()
    print(f"  Stats: {stats}")
    print(f"  DPO pairs built: {len(pairs)}")
    if pairs:
        print(f"  Sample prompt: {pairs[0]['prompt'][:80]}...")

    # --- Phase 5: Bias analysis ---
    print("\n[Phase 5] Cognitive Bias Resolution")
    bias = BiasResolver()
    scenarios = [
        ("CEO sees crisis", Vector3(-0.5, 0.85, 0.1), -0.9),
        ("Board member sees crisis", Vector3(0.5, 0.3, 0.7), -0.6),
        ("Intern sees crisis", Vector3(0.0, 0.9, 0.05), -0.5),
    ]
    for desc, em, sent in scenarios:
        r = bias.process(desc, em, sent)
        print(f"  {desc}: bias={r.bias}, threat={r.threat_multiplier:.2f}x, "
              f"suppressed={r.suppressed}")

    print("\n" + "=" * 65)
    print("  DEMO COMPLETE")
    print("=" * 65)
