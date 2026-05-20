"""Test package bootstrap for backend module imports and unittest discovery."""

from pathlib import Path
import importlib
import inspect
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def load_tests(loader, tests, pattern):
    """Expose pytest-style test functions to unittest discovery."""
    suite = unittest.TestSuite()
    for module_name in ("test_database", "test_load_policies", "test_monitor"):
        module = importlib.import_module(f"backend.tests.{module_name}")
        for name, obj in inspect.getmembers(module):
            if name.startswith("test_") and callable(obj):
                suite.addTest(unittest.FunctionTestCase(obj))
    return suite
