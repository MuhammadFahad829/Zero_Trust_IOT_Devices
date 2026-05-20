"""Project-wide Python path bootstrap.

This ensures modules inside backend/ can be imported as top-level modules
when running tests or scripts from the repository root.
"""

from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent
BACKEND = ROOT / "backend"

for path in (str(ROOT), str(BACKEND)):
    if path not in sys.path:
        sys.path.insert(0, path)
