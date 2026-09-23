# -*- coding: utf-8 -*-
"""preflight.py — ตรวจไฟล์ที่ผู้ใช้ส่งมา (CSV/SQLite) ไม่ใช่ db/custom.db เสมอ
รัน:  python3 -m unittest discover -s lab/tests_stops -v"""

import contextlib
import io
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import preflight as pf  # noqa: E402


def _run(argv):
    out, err = io.StringIO(), io.StringIO()
    with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
        code = pf.main(argv)
    return code, out.getvalue(), err.getvalue()


class Csv(unittest.TestCase):
    def test_csv_argument_is_checked(self):
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / "history.csv"
            p.write_text("﻿Date,Symbol,Close,Volume\n"
                         "2026-09-21,ptt,33.5,100\n2026-09-21,PTT,33.5,100\n"
                         "20260922,PTT,-1,100\nbad,PTT,1,1\n2026/9/23,KBANK,x,5\n", encoding="utf-8")
            cx = pf.open_csv(p)
            checks = {c["name"]: c for c in pf.run_preflight(cx)}
            code, out, _ = _run([str(p)])
        self.assertEqual(checks["rows"]["detail"].split()[0], "4")
        self.assertFalse(checks["no_dup"]["ok"])            # ptt/PTT วันเดียวกัน = คีย์ซ้ำ
        self.assertIn("close ว่าง 1 แถว", checks["close_valid"]["detail"])
        self.assertIn("ผิดปกติ (<=0 หรือ >= 1,000,000) 1 แถว", checks["close_valid"]["detail"])
        self.assertEqual(code, 1)
        self.assertIn("ข้าม 1 แถว", out)

    def test_missing_or_bad_header_exits_2(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.assertEqual(_run([str(Path(tmp) / "none.csv")])[0], 2)
            bad = Path(tmp) / "bad.csv"
            bad.write_text("foo,bar\n1,2\n", encoding="utf-8")
            self.assertEqual(_run([str(bad)])[0], 2)


class Db(unittest.TestCase):
    def test_sqlite_argument(self):
        with tempfile.TemporaryDirectory() as tmp:
            db = Path(tmp) / "x.db"
            cx = sqlite3.connect(db)
            cx.execute('CREATE TABLE "RawDaily" (date TEXT, symbol TEXT, close REAL)')
            cx.executemany('INSERT INTO "RawDaily" VALUES (?,?,?)',
                           [("2026-09-21", "PTT", 33.5), ("2026-09-22", "PTT", 34.0)])
            cx.commit()
            cx.close()
            code, out, _ = _run([str(db)])
            self.assertEqual(code, 1)
            self.assertIn("2 แถว", out)
            self.assertEqual(_run([str(Path(tmp) / "missing.db")])[0], 2)


if __name__ == "__main__":
    unittest.main()
