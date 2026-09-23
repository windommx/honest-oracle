# -*- coding: utf-8 -*-
"""context_updater.py — วันที่ตลาด (เวลาไทย) + สัปดาห์ ISO + journal ที่มีค่าเสีย
รัน:  python3 -m unittest discover -s lab/tests_stops -v"""

import json
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import context_updater as cu  # noqa: E402


class MarketDate(unittest.TestCase):
    def test_default_date_is_bangkok_not_utc(self):
        # จันทร์ 2026-09-21 05:00 เวลาไทย = อาทิตย์ 2026-09-20 22:00 UTC
        self.assertEqual(cu.market_today(datetime(2026, 9, 20, 22, 0, tzinfo=timezone.utc)), "2026-09-21")
        self.assertEqual(cu.market_today(datetime(2026, 9, 21, 16, 59, tzinfo=timezone.utc)), "2026-09-21")
        self.assertEqual(cu.market_today(datetime(2026, 9, 21, 17, 0, tzinfo=timezone.utc)), "2026-09-22")

    def test_monday_premarket_starts_a_new_week(self):
        trades = [{"date": "2026-09-18", "type": "trade", "r": -3.0}]   # ศุกร์สัปดาห์ก่อน
        monday = cu.market_today(datetime(2026, 9, 20, 22, 0, tzinfo=timezone.utc))
        ctx = cu.compute_context(trades, monday)
        self.assertEqual(ctx["week_pnl_R"], 0.0)   # วันที่ UTC (อาทิตย์) จะได้ −3 ของสัปดาห์ก่อน
        self.assertEqual(ctx["day_pnl_R"], 0.0)
        self.assertEqual(cu.compute_context(trades, "2026-09-20")["week_pnl_R"], -3.0)


class IsoWeek(unittest.TestCase):
    def test_year_boundary(self):
        # 2026-12-31 (พฤ) และ 2027-01-01 (ศ) อยู่ ISO 2026-W53 · 2027-01-04 (จ) = 2027-W01
        trades = [{"date": "2026-12-31", "type": "trade", "r": -1.0},
                  {"date": "2027-01-01", "type": "trade", "r": 0.5},
                  {"date": "2027-01-04", "type": "trade", "r": 2.0}]
        self.assertEqual(cu.compute_context(trades, "2027-01-01")["week_pnl_R"], -0.5)
        self.assertEqual(cu.compute_context(trades, "2027-01-04")["week_pnl_R"], 2.0)
        self.assertEqual(cu.compute_context(trades, "2027-01-01")["loss_streak"], 0)
        self.assertEqual(cu.compute_context(trades, "2026-12-31")["loss_streak"], 1)


class Journal(unittest.TestCase):
    def test_non_finite_or_bool_r_is_skipped(self):
        with tempfile.TemporaryDirectory() as tmp:
            j = Path(tmp) / "journal.jsonl"
            j.write_text('{"date":"2026-09-22","type":"trade","r":NaN}\n'
                         '{"date":"2026-09-22","type":"trade","r":Infinity}\n'
                         '{"date":"2026-09-22","type":"trade","r":true}\n'
                         '[1, 2]\n'
                         '{"date":"2026-09-22","type":"trade","r":-2.5}\n', encoding="utf-8")
            ctx = cu.compute_context(cu.load_trades(j), "2026-09-22")
        self.assertEqual(ctx["day_pnl_R"], -2.5)   # ค่า NaN ทำให้ผลรวม NaN → กฎ R6.1 (<= −2) ไม่ทำงาน
        json.dumps(ctx, allow_nan=False)


if __name__ == "__main__":
    unittest.main()
