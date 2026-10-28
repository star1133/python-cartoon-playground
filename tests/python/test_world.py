import sys
from pathlib import Path
import pytest

public_python = Path(__file__).resolve().parent.parent.parent / "public" / "python"
if str(public_python) not in sys.path:
    sys.path.insert(0, str(public_python))

import playground_world


def test_world_initial_state_and_reset():
    playground_world.reset_world()
    state = playground_world.get_state()
    assert state == {"x": 0, "y": 0, "direction": 0, "action": "idle"}


def test_world_move_forward_east():
    playground_world.reset_world()
    playground_world.move_forward()
    assert playground_world.get_state() == {"x": 1, "y": 0, "direction": 0, "action": "move_forward"}
    playground_world.move_forward()
    assert playground_world.get_state() == {"x": 2, "y": 0, "direction": 0, "action": "move_forward"}


def test_world_turn_left_and_right():
    playground_world.reset_world()
    # East (0) -> turn_left -> North (3)
    playground_world.turn_left()
    assert playground_world.get_state()["direction"] == 3
    assert playground_world.get_state()["action"] == "turn_left"

    # North (3) -> turn_left -> West (2)
    playground_world.turn_left()
    assert playground_world.get_state()["direction"] == 2

    # West (2) -> turn_right -> North (3)
    playground_world.turn_right()
    assert playground_world.get_state()["direction"] == 3

    # North (3) -> turn_right -> East (0)
    playground_world.turn_right()
    assert playground_world.get_state()["direction"] == 0


def test_world_four_directions_movement():
    playground_world.reset_world(x=0, y=0, direction=0)

    # Move East (+x)
    playground_world.move_forward()
    assert (playground_world.get_state()["x"], playground_world.get_state()["y"]) == (1, 0)

    # Turn Right to South (1), move South (+y)
    playground_world.turn_right()
    playground_world.move_forward()
    assert (playground_world.get_state()["x"], playground_world.get_state()["y"]) == (1, 1)

    # Turn Right to West (2), move West (-x)
    playground_world.turn_right()
    playground_world.move_forward()
    assert (playground_world.get_state()["x"], playground_world.get_state()["y"]) == (0, 1)

    # Turn Right to North (3), move North (-y)
    playground_world.turn_right()
    playground_world.move_forward()
    assert (playground_world.get_state()["x"], playground_world.get_state()["y"]) == (0, 0)


def test_world_listener_called():
    actions = []

    def on_world_event(st):
        actions.append(st["action"])

    playground_world.reset_world()
    playground_world.set_world_listener(on_world_event)

    playground_world.move_forward()
    playground_world.turn_left()
    playground_world.move_forward()

    assert actions == ["move_forward", "turn_left", "move_forward"]
    playground_world.set_world_listener(None)
