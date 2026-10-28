import sys
from pathlib import Path
import pytest

public_python = Path(__file__).resolve().parent.parent.parent / "public" / "python"
if str(public_python) not in sys.path:
    sys.path.insert(0, str(public_python))

import playground_world
import tracer


def test_tracer_simple_loop():
    code = """
x = 0
for i in range(3):
    x += i
"""
    events = tracer.run_traced(code, filename="main.py")
    assert len(events) > 0

    # Ensure seq is strictly increasing
    seqs = [e["seq"] for e in events]
    assert seqs == list(range(1, len(events) + 1))

    # Check that events have required fields
    for e in events:
        assert "kind" in e
        assert "line" in e
        assert "file" in e
        assert "locals" in e
        assert "stack" in e

    # Check kinds present
    kinds = set(e["kind"] for e in events)
    assert "line" in kinds

    # Verify locals were captured
    final_line_events = [e for e in events if e["kind"] == "line"]
    assert any("x" in e["locals"] for e in final_line_events)


def test_tracer_functions_and_calls():
    code = """
def add(a, b):
    return a + b

res = add(2, 3)
"""
    events = tracer.run_traced(code, filename="main.py")
    kinds = [e["kind"] for e in events]
    assert "call" in kinds
    assert "return" in kinds

    call_event = next(e for e in events if e["kind"] == "call")
    assert call_event["name"] == "add"

    return_event = next(e for e in events if e["kind"] == "return")
    assert return_event["name"] == "add"
    assert return_event["text"] == "5"


def test_tracer_exceptions():
    code = """
try:
    1 / 0
except ZeroDivisionError:
    pass
"""
    events = tracer.run_traced(code, filename="main.py")
    kinds = [e["kind"] for e in events]
    assert "exception" in kinds
    exc_event = next(e for e in events if e["kind"] == "exception")
    assert "ZeroDivisionError" in exc_event["text"]


def test_tracer_world_integration():
    playground_world.reset_world()
    code = """
from playground_world import move_forward, turn_left

move_forward()
move_forward()
turn_left()
"""
    events = tracer.run_traced(code, filename="main.py")

    # Filter events that carry world state
    world_events = [e for e in events if "world" in e]
    assert len(world_events) >= 2

    # Check last world event
    last_world = world_events[-1]["world"]
    assert last_world["action"] == "turn_left"
    assert last_world["direction"] == 3  # North
    assert last_world["x"] == 2
    assert last_world["y"] == 0


def test_tracer_event_bounding_prevents_unbounded_trace():
    code = """
for i in range(1000):
    pass
"""
    max_cap = 25
    events = tracer.run_traced(code, filename="main.py", max_events=max_cap)
    assert len(events) <= max_cap


def test_tracer_stdout_and_stderr_events():
    code = """
import sys
x = 42
print("Hello stdout!")
sys.stderr.write("Hello stderr!\\n")
"""
    events = tracer.run_traced(code, filename="main.py")
    seqs = [e["seq"] for e in events]
    assert seqs == list(range(1, len(events) + 1))

    stdout_events = [e for e in events if e.get("kind") == "stdout"]
    assert len(stdout_events) >= 1
    assert any("Hello stdout!" in e.get("text", "") for e in stdout_events)

    stderr_events = [e for e in events if e.get("kind") == "stderr"]
    assert len(stderr_events) >= 1
    assert any("Hello stderr!" in e.get("text", "") for e in stderr_events)


def test_tracer_no_implicit_world_injection():
    # Calling move_forward without explicit import must raise NameError
    code = """
move_forward()
"""
    with pytest.raises(NameError):
        tracer.run_traced(code, filename="main.py")


def test_tracer_unique_strictly_ordered_world_events_and_preserved_state():
    playground_world.reset_world()
    code = """
from playground_world import move_forward
move_forward()
x = 99
y = 1
"""
    events = tracer.run_traced(code, filename="main.py")
    seqs = [e["seq"] for e in events]
    assert seqs == list(range(1, len(events) + 1))

    # The action event should have action 'move_forward'
    action_events = [e for e in events if e.get("world", {}).get("action") == "move_forward"]
    assert len(action_events) == 1
    assert action_events[0]["world"]["x"] == 1

    # Subsequent line event (y = 1) should preserve current world position but with action idle
    final_line_events = [e for e in events if e.get("kind") == "line" and "x" in e.get("locals", {})]
    assert len(final_line_events) > 0
    preserved_world = final_line_events[-1].get("world")
    assert preserved_world is not None
    assert preserved_world["x"] == 1
    assert preserved_world["action"] == "idle"
