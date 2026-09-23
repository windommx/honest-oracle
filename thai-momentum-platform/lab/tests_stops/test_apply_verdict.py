# -*- coding: utf-8 -*-
"""apply_verdict.py — config รูปเดียวกับ Setting config_th + audit แบบที่ Prisma อ่านได้
รัน:  python3 -m unittest discover -s lab/tests_stops -v"""

import json
import sqlite3
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import apply_verdict as av  # noqa: E402

# DDL เดียวกับที่ Prisma สร้างให้ model Decision (prisma/schema.prisma)
DECISION_DDL = '''CREATE TABLE "Decision" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "date" TEXT NOT NULL, "question" TEXT NOT NULL, "target" TEXT NOT NULL,
    "action" TEXT NOT NULL, "conf" REAL NOT NULL, "reason" TEXT NOT NULL DEFAULT '',
    "executed" BOOLEAN NOT NULL DEFAULT false, "outcome" REAL,
    "source" TEXT NOT NULL DEFAULT 'lite',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)'''


def _report(h1=True, h2=False, h3=True, h4=False, n=100, mode="all"):
    return {
        "mode": mode, "verdict": "x", "ranAt": "2026-09-22T00:00:00+00:00",
        "h1": {"pass": h1, "best": []}, "h2": {"pass": h2}, "h3": {"pass": h3},
        "h4": {"pass": h4, "longCells": []},
        "scan": [{"form": 5, "hold": 3, "n": n}],
        "actions": {"H1": "เปิด core สั้น (form<=20,hold<=10) ใน shadow"},
    }


class Config(unittest.TestCase):
    def test_platform_rules(self):
        nxt = av.build_next_config(_report(h1=True, h2=False, h3=True), None, "2026-09-23", 1790000000)
        self.assertEqual(nxt["holdDefault"], 5)
        self.assertEqual(nxt["tfWeights"], av.TF_SHORT)
        self.assertTrue(nxt["calendarOverlay"])
        self.assertFalse(nxt["reversalEnabled"])
        self.assertEqual(nxt["updatedBy"], "auto-verdict@2026-09-23")
        self.assertEqual(nxt["history"][-1], {
            "ts": 1790000000, "verdict": {"H1": True, "H2": False, "H3": True, "H4": False},
            "note": "auto-apply จาก thai_fit verdict (H1-H4)"})
        nxt2 = av.build_next_config(_report(h1=False, h2=True, h3=False), nxt, "2026-09-24", 1790000100)
        self.assertEqual(nxt2["holdDefault"], 10)   # ไม่ใช่ "tf ที่ดีที่สุด" (เคยได้ 80 — นอกช่วง 1..40 ของแพลตฟอร์ม)
        self.assertEqual(nxt2["tfWeights"], av.TF_LONG)
        self.assertTrue(nxt2["reversalEnabled"])
        self.assertEqual(len(nxt2["history"]), 2)

    def test_camelcase_keys_same_as_setting_config_th(self):
        nxt = av.build_next_config(_report(), None, "2026-09-23", 1)
        self.assertEqual(list(nxt), ["tfWeights", "holdDefault", "calendarOverlay",
                                     "reversalEnabled", "updatedBy", "history"])

    def test_merge_ignores_bad_or_legacy_values(self):
        cfg = av.merge_config({"tf_weights": {"5": 1}, "hold_default": 80, "holdDefault": 80,
                               "tfWeights": {"5": 2, "10": 0.5, "x": 0.1}, "calendarOverlay": 1,
                               "history": [{"at": "x"}, {"ts": 5, "verdict": {"H1": True, "H2": "y"}}]})
        self.assertEqual(cfg["holdDefault"], 5)
        self.assertEqual(cfg["tfWeights"]["5"], 0.35)
        self.assertEqual(cfg["tfWeights"]["10"], 0.5)
        self.assertFalse(cfg["calendarOverlay"])
        self.assertEqual(cfg["history"], [{"ts": 5, "verdict": {"H1": True}}])
        self.assertEqual(av.merge_config("garbage"), av.DEFAULT_CONFIG)

    def test_history_cap(self):
        cur = {"history": [{"ts": i} for i in range(av.HISTORY_MAX + 5)]}
        self.assertEqual(len(av.build_next_config(_report(), cur, "d", 1)["history"]), av.HISTORY_MAX)


class Gate(unittest.TestCase):
    def test_gate(self):
        self.assertIsNone(av.apply_gate(_report()))
        self.assertIsNotNone(av.apply_gate(_report(mode="tom")))
        self.assertIsNotNone(av.apply_gate(_report(n=0)))   # ไม่มี cell ที่วัดได้ → ไม่ใช่หลักฐาน

    def test_bangkok_date(self):
        self.assertEqual(av.bangkok_date(datetime(2026, 9, 22, 20, 30, tzinfo=timezone.utc)), "2026-09-23")
        self.assertEqual(av.bangkok_date(datetime(2026, 9, 22, 16, 59, tzinfo=timezone.utc)), "2026-09-22")


class Audit(unittest.TestCase):
    def test_row_matches_prisma_storage(self):
        with tempfile.TemporaryDirectory() as tmp:
            db = Path(tmp) / "t.db"
            cx = sqlite3.connect(db)
            cx.execute(DECISION_DDL)
            cx.commit()
            cx.close()
            self.assertTrue(av.audit_decision(_report(), "2026-09-23", db))
            cx = sqlite3.connect(db)
            row = cx.execute('SELECT date, question, target, action, conf, reason, executed, source, '
                             'createdAt, typeof(createdAt), typeof(executed) FROM "Decision"').fetchone()
            cx.close()
        self.assertEqual(row[:5], ("2026-09-23", "Q_SIGNAL", "config_th", "auto-apply", 1.0))
        self.assertEqual(json.loads(row[5]), _report()["actions"])
        self.assertEqual(row[6], 1)
        self.assertEqual(row[7], "system")
        self.assertEqual(row[9], "integer")      # Prisma เก็บ DateTime ใน SQLite เป็น epoch ms
        self.assertGreater(row[8], 1_700_000_000_000)
        self.assertEqual(row[10], "integer")

    def test_missing_db_is_not_created(self):
        with tempfile.TemporaryDirectory() as tmp:
            db = Path(tmp) / "nope" / "custom.db"
            self.assertFalse(av.audit_decision(_report(), "2026-09-23", db))
            self.assertFalse(db.exists())
            db2 = Path(tmp) / "custom.db"
            self.assertFalse(av.audit_decision(_report(), "2026-09-23", db2))
            self.assertFalse(db2.exists())


if __name__ == "__main__":
    unittest.main()
