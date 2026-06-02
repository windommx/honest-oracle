"""
═══════════════════════════════════════════════════════════════════
  OMNISIM DEEP CORE v4.2 — backward-compatible entry point

  The implementation now lives in the `omnisim/` package (one module per
  component, matching the SDK layout). This file is a thin shim so the
  historical commands keep working and existing imports of `deep_core`
  still resolve:

      python deep_core.py --test     # run the full suite under tests/
      python deep_core.py --demo     # run the end-to-end demo

  z3-solver is optional. Without it the Z3 engine is disabled and its
  tests are skipped; everything else still runs.
═══════════════════════════════════════════════════════════════════
"""

from __future__ import annotations

import os
import sys
import unittest

# Re-export the full public API so `from deep_core import X` still works.
from omnisim import *            # noqa: F401,F403
from omnisim import _Z3, run_demo  # noqa: F401

_TESTS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "tests")


def _run_tests() -> int:
    loader = unittest.TestLoader()
    suite = loader.discover(start_dir=_TESTS_DIR, pattern="test_*.py")
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    total = result.testsRun
    skipped = len(result.skipped)
    failed = len(result.failures) + len(result.errors)
    passed = total - failed - skipped
    print(f"\n{'='*50}")
    print(f"  {passed} passed, {skipped} skipped, {failed} failed (of {total})")
    if failed == 0:
        print("  ALL TESTS PASSED")
    print(f"{'='*50}")
    return 0 if failed == 0 else 1


def main():
    if "--test" in sys.argv:
        sys.exit(_run_tests())
    elif "--demo" in sys.argv:
        run_demo()
    else:
        print("python deep_core.py --test")
        print("python deep_core.py --demo")


if __name__ == "__main__":
    main()
