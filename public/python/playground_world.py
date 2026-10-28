"""
playground_world.py
Explicit world lesson API for 3D cartoon scene.
Provides move_forward, turn_left, turn_right actions with deterministic state tracking.
"""

# World state
_x = 0
_y = 0
_direction = 0  # 0: East (+x), 1: South (+y), 2: West (-x), 3: North (-y)
_last_action = "idle"
_listener = None


def get_state() -> dict:
    """Return the current world snapshot."""
    return {
        "x": _x,
        "y": _y,
        "direction": _direction,
        "action": _last_action,
    }


def reset_world(x: int = 0, y: int = 0, direction: int = 0) -> None:
    """Reset world state to default or specified coordinates."""
    global _x, _y, _direction, _last_action
    _x = int(x)
    _y = int(y)
    _direction = int(direction) % 4
    _last_action = "idle"


def set_world_listener(fn) -> None:
    """Register a callback to be called whenever a world action occurs."""
    global _listener
    _listener = fn


def _notify(action: str) -> None:
    global _last_action
    _last_action = action
    if _listener is not None:
        try:
            _listener(get_state())
        except Exception:
            pass


def move_forward() -> None:
    """
    Move character forward 1 tile in current direction:
    0: East (+x)
    1: South (+y)
    2: West (-x)
    3: North (-y)
    """
    global _x, _y
    if _direction == 0:
        _x += 1
    elif _direction == 1:
        _y += 1
    elif _direction == 2:
        _x -= 1
    elif _direction == 3:
        _y -= 1
    _notify("move_forward")


def turn_left() -> None:
    """Turn character 90 degrees counter-clockwise (left)."""
    global _direction
    _direction = (_direction - 1) % 4
    _notify("turn_left")


def turn_right() -> None:
    """Turn character 90 degrees clockwise (right)."""
    global _direction
    _direction = (_direction + 1) % 4
    _notify("turn_right")


__all__ = ["move_forward", "turn_left", "turn_right", "get_state", "reset_world", "set_world_listener"]
