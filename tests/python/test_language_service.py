import sys
from pathlib import Path
import pytest

public_python = Path(__file__).resolve().parent.parent.parent / "public" / "python"
if str(public_python) not in sys.path:
    sys.path.insert(0, str(public_python))

import language_service


def test_language_service_complete_print():
    # 'pri' at line 1, column 3 (1-based line, 0-based col in language_service)
    completions = language_service.complete("pri", line=1, column=3)
    labels = [c["label"] for c in completions]
    assert "print" in labels

    # Verify insertText is the full name, not just suffix
    print_item = next(c for c in completions if c["label"] == "print")
    assert print_item["insertText"] == "print"
    assert print_item["kind"] == "function"


def test_language_service_complete_math_members():
    code = "import math\nmath."
    # 'math.' is on line 2, column 5
    completions = language_service.complete(code, line=2, column=5)
    labels = [c["label"] for c in completions]
    assert len(labels) > 0
    # Must contain math members such as sqrt, sin, cos, pi
    assert any(m in labels for m in ["sqrt", "sin", "cos", "pi"])

    # Ensure all kinds are lowercase
    for item in completions:
        assert item["kind"] == item["kind"].lower()


def test_language_service_complete_user_defined_function():
    # Truly dynamic user-defined function not present in any static list
    code = """
def custom_dynamic_transformer_987(data_chunk, multiplier=42):
    return data_chunk * multiplier

cust
"""
    completions = language_service.complete(code, line=5, column=4)
    labels = [c["label"] for c in completions]
    assert "custom_dynamic_transformer_987" in labels

    item = next(c for c in completions if c["label"] == "custom_dynamic_transformer_987")
    assert item["insertText"] == "custom_dynamic_transformer_987"
    assert item["kind"] == "function"


def test_language_service_complete_user_defined_class_and_methods():
    # Truly dynamic user-defined class and method
    code = """
class SpaceCruiser:
    def warp_drive(self, light_years):
        return light_years * 9999

ship = SpaceCruiser()
ship.
"""
    completions = language_service.complete(code, line=7, column=5)
    labels = [c["label"] for c in completions]
    assert "warp_drive" in labels

    item = next(c for c in completions if c["label"] == "warp_drive")
    assert item["insertText"] == "warp_drive"
    assert item["kind"] == "function"


def test_language_service_column_clamping_robustness():
    # When 1-based column (e.g. 4 for 3-char line 'pri') is passed,
    # clamping to line_len (3) prevents Jedi's ValueError and returns 'print'.
    completions = language_service.complete("pri", line=1, column=4)
    labels = [c["label"] for c in completions]
    assert "print" in labels

    # Out of bounds large column should also be clamped safely
    completions_large = language_service.complete("pri", line=1, column=100)
    labels_large = [c["label"] for c in completions_large]
    assert "print" in labels_large


def test_language_service_signature():
    code = "print("
    sig = language_service.signature(code, line=1, column=6)
    assert "print(" in sig or "values" in sig


def test_language_service_user_defined_signature():
    code = """
def launch_missile(target_id: str, yield_kt: float = 5.0) -> bool:
    return True

launch_missile(
"""
    sig = language_service.signature(code, line=5, column=15)
    assert "launch_missile" in sig
    assert "target_id" in sig


def test_language_service_hover():
    code = "print('hello')"
    hov = language_service.hover(code, line=1, column=3)
    assert len(hov) > 0
    assert "print" in hov


def test_language_service_user_defined_hover():
    code = """
def super_boost(multiplier: int):
    \"\"\"Docstring: Amplifies rocket output.\"\"\"
    return multiplier * 2

super_boost(10)
"""
    hov = language_service.hover(code, line=6, column=5)
    assert "super_boost" in hov
    assert "Amplifies rocket output" in hov


def test_language_service_never_executes_code():
    """
    CRITICAL: Language service must NEVER execute code during completion or hover!
    """
    code = """
import sys
# If this executes, it raises an exception
raise RuntimeError("Code execution during completion!")
"""
    # Should not raise exception
    completions = language_service.complete(code, line=4, column=0)
    assert isinstance(completions, list)
