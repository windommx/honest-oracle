# -*- coding: utf-8 -*-
"""thai_fit.py — นิยาม/เกณฑ์ต้องตรงกับแพลตฟอร์ม (src/lib/research/thai-fit.ts)
รัน:  python3 -m unittest discover -s lab/tests_stops -v   (ไม่แตะ db/custom.db / ไม่เขียนไฟล์ใน lab/)"""

import sys
import unittest
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import thai_fit as tf  # noqa: E402


def _frame(rows):
    return pd.DataFrame(rows, columns=["date", "symbol", "close", "val", "liq5"])


class IcHarness(unittest.TestCase):
    def test_icir_is_mean_over_std_not_t_stat(self):
        # 3 วัน × 30 หุ้น: IC = +1, −1, +1 → mean 1/3, std(ddof=1) = √(4/3) → ICIR 0.289, t = ICIR·√3 = 0.5
        syms = [f"S{i:02d}" for i in range(30)]
        idx = ["2026-01-05", "2026-01-06", "2026-01-07"]
        base = np.arange(30, dtype=float)
        sig = pd.DataFrame([base, base, base], index=idx, columns=syms)
        fwd = pd.DataFrame([base, -base, base], index=idx, columns=syms)
        st = tf.ic_per_date(sig, fwd)
        self.assertEqual(st["n"], 3)
        self.assertAlmostEqual(st["meanIC"], 0.3333, places=4)
        self.assertEqual(st["ICIR"], 0.289)   # เดิมรายงาน t-stat (0.5) ในชื่อ "icir" แล้วเทียบเกณฑ์ ICIR 0.25
        self.assertEqual(st["t"], 0.5)

    def test_days_with_fewer_than_30_names_are_skipped(self):
        syms = [f"S{i:02d}" for i in range(29)]
        sig = pd.DataFrame([np.arange(29.0)], index=["2026-01-05"], columns=syms)
        self.assertEqual(tf.ic_per_date(sig, sig)["n"], 0)

    def test_js_rounding(self):
        self.assertEqual(tf._jround(-2.5, 0), -2.0)   # Math.round(-2.5) = -2
        self.assertEqual(tf._jround(0.12345, 4), 0.1235)


class Scan(unittest.TestCase):
    def test_no_measured_cell_is_not_evidence_and_h4_does_not_pass_vacuously(self):
        # 5 หุ้น (< 30 ต่อวัน) → ทุก cell n=0: ห้ามถือว่า "tf ยาวตายแล้ว" และห้าม auto-apply
        dates = pd.bdate_range("2025-01-01", periods=400).strftime("%Y-%m-%d")
        rows = [(d, f"S{j}", 10 + 0.01 * i * (j + 1), 5e6, 1) for i, d in enumerate(dates) for j in range(5)]
        res = tf.scan(tf.load_pivots(_frame(rows)))
        self.assertTrue(all(c["n"] == 0 for c in res["cells"]))
        self.assertFalse(res["h1Pass"])
        self.assertFalse(res["h4Pass"])
        self.assertEqual(res["best"], [])
        self.assertFalse(tf.scan_has_evidence(res["cells"]))

    def test_cell_grid_matches_platform(self):
        dates = pd.bdate_range("2025-01-01", periods=30).strftime("%Y-%m-%d")
        rows = [(d, "AAA", 10.0, 5e6, 1) for d in dates]
        grid = [(c["form"], c["hold"]) for c in tf.scan(tf.load_pivots(_frame(rows)))["cells"]]
        exp = [(f, h) for f in (5, 10, 20, 40, 80) for h in (3, 5, 10, 20)] + [(160, 10), (300, 10)]
        self.assertEqual(grid, exp)


class Tom(unittest.TestCase):
    def test_boundary_months_of_the_sample_are_not_guessed(self):
        # ข้อมูลเริ่มกลางเดือน ม.ค. และจบกลางเดือน มี.ค. → "3 วันแรก" ของ ม.ค. และ "3 วันท้าย" ของ มี.ค. ระบุไม่ได้
        dates = pd.bdate_range("2026-01-14", "2026-03-13").strftime("%Y-%m-%d").tolist()
        rows = [(d, "AAA", 10 + 0.01 * i, 5e6, 1) for i, d in enumerate(dates)]
        res = tf.tom(tf.load_pivots(_frame(rows)))
        jan = [d for d in dates if d.startswith("2026-01")]
        feb = [d for d in dates if d.startswith("2026-02")]
        mar = [d for d in dates if d.startswith("2026-03")]
        # วันแรกไม่มี market return (ไม่มีราคาก่อนหน้า) → ม.ค. นับได้แค่ 3 วันท้าย, ก.พ. 3+3, มี.ค. 3 วันแรก
        self.assertEqual(res["nIn"], 3 + 6 + 3)
        self.assertGreater(len(jan) + len(feb) + len(mar), res["nIn"])

    def test_empty(self):
        res = tf.tom(tf.load_pivots(_frame([])))
        self.assertEqual(res, {"pass": False, "insideMean": 0, "outsideMean": 0, "t": 0, "nIn": 0})


class Report(unittest.TestCase):
    def test_params_hash_matches_platform_researchrun(self):
        # sha256(JSON.stringify(params)) ที่แพลตฟอร์มบันทึกใน ResearchRun kind 'thai_fit' (rules: 2)
        _, h = tf.params_hash("all")
        self.assertEqual(h, "81951a9b076ed63553346adb5eccd1a676cb067f519bebbcaf00c7fd48c10f74")

    def test_report_shape_and_no_nan(self):
        rng = np.random.default_rng(7)
        dates = pd.bdate_range("2024-01-01", periods=320).strftime("%Y-%m-%d")
        rows = []
        for j in range(35):
            px = 20.0
            for d in dates:
                px *= float(np.exp(rng.normal(0, 0.02)))
                rows.append((d, f"S{j:02d}", px, float(rng.uniform(4e6, 9e6)), 1))
        rep = tf.run_thai_fit(_frame(rows), "all")
        for k in ("ranAt", "mode", "h1", "h2", "h3", "h4", "scan", "actions", "verdict", "paramsHash"):
            self.assertIn(k, rep)
        self.assertEqual(set(rep["actions"]), {"H1", "H2", "H3", "H4"})
        import json
        txt = json.dumps(rep, allow_nan=False)   # ValueError ถ้ามี NaN/Infinity หลุด
        self.assertIn('"mode": "all"', txt)
        part = tf.run_thai_fit(_frame(rows), "tom")
        self.assertIsNone(part["h1"])
        self.assertIsNone(part["h2"])
        self.assertIsNotNone(part["h3"])
        self.assertEqual(part["scan"], [])


if __name__ == "__main__":
    unittest.main()
