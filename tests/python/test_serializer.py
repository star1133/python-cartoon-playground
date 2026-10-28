import sys
from pathlib import Path
import pytest

# Ensure public/python is on sys.path
public_python = Path(__file__).resolve().parent.parent.parent / "public" / "python"
if str(public_python) not in sys.path:
    sys.path.insert(0, str(public_python))

import serializer


def test_serialize_primitives():
    assert serializer.serialize_value(None) == {"type": "NoneType", "value": "None"}
    assert serializer.serialize_value(True) == {"type": "bool", "value": "True"}
    assert serializer.serialize_value(False) == {"type": "bool", "value": "False"}
    assert serializer.serialize_value(42) == {"type": "int", "value": "42"}
    assert serializer.serialize_value(3.14) == {"type": "float", "value": "3.14"}
    assert serializer.serialize_value("hello") == {"type": "str", "value": "'hello'"}
    assert serializer.serialize_value(b"abc") == {"type": "bytes", "value": "b'abc'"}


def test_serialize_collections():
    lst = [1, 2, "three"]
    res_list = serializer.serialize_value(lst)
    assert res_list["type"] == "list"
    assert res_list["value"] == "[1, 2, 'three']"
    assert "id" in res_list

    tup = (10, 20)
    res_tup = serializer.serialize_value(tup)
    assert res_tup["type"] == "tuple"
    assert res_tup["value"] == "(10, 20)"

    st = {1}
    res_set = serializer.serialize_value(st)
    assert res_set["type"] == "set"
    assert res_set["value"] == "{1}"

    dct = {"a": 1}
    res_dct = serializer.serialize_value(dct)
    assert res_dct["type"] == "dict"
    assert "'a': 1" in res_dct["value"]


def test_serialize_depth_limit():
    nested = [[[1]]]
    res = serializer.serialize_value(nested, max_depth=1)
    assert res["type"] == "list"
    assert "list(1)" in res["value"] or "[" in res["value"]


def test_serialize_dangerous_repr_no_side_effects():
    """
    CRITICAL: Serializer must NEVER call user __repr__ or __str__ that could
    trigger side-effects, raise exceptions, or hang execution.
    """
    side_effect_occurred = False

    class DangerousClass:
        def __repr__(self):
            nonlocal side_effect_occurred
            side_effect_occurred = True
            raise RuntimeError("CRITICAL ERROR: __repr__ was executed!")

        def __str__(self):
            nonlocal side_effect_occurred
            side_effect_occurred = True
            raise RuntimeError("CRITICAL ERROR: __str__ was executed!")

    obj = DangerousClass()
    # Must not raise and side effect must not occur
    res = serializer.serialize_value(obj)
    assert side_effect_occurred is False
    assert res["type"] == "DangerousClass"
    assert "DangerousClass object at" in res["value"]


def test_serialize_dangerous_property_no_side_effects():
    """
    Serializer must never access user @property descriptors during inspection.
    """
    prop_executed = False

    class HasBadProperty:
        @property
        def boom(self):
            nonlocal prop_executed
            prop_executed = True
            raise RuntimeError("Property accessed!")

    obj = HasBadProperty()
    res = serializer.serialize_value(obj)
    assert prop_executed is False
    assert res["type"] == "HasBadProperty"


def test_serialize_locals_filtering():
    locs = {
        "__name__": "__main__",
        "__doc__": "doc",
        "_tracer": "internal",
        "_world_state": "internal",
        "x": 100,
        "msg": "thai playground",
    }
    serialized = serializer.serialize_locals(locs)
    assert "__name__" not in serialized
    assert "__doc__" not in serialized
    assert "_tracer" not in serialized
    assert "_world_state" not in serialized
    assert serialized["x"] == {"type": "int", "value": "100"}
    assert serialized["msg"] == {"type": "str", "value": "'thai playground'"}


def test_serialize_stack():
    def level2():
        frame = sys._getframe()
        return serializer.serialize_stack(frame)

    def level1():
        return level2()

    stack = level1()
    assert len(stack) >= 2
    assert "level2()" in stack[-1]
    assert "level1()" in stack[-2]


def test_serialize_large_list_and_set_performance():
    # 100,000 items in list and set
    huge_list = list(range(100_000))
    res_list = serializer.serialize_value(huge_list)
    assert res_list["type"] == "list"
    assert "..." in res_list["value"]
    assert res_list["value"].startswith("[0, 1, 2, 3, 4, 5, 6, 7, ...]")

    huge_set = set(range(100_000))
    res_set = serializer.serialize_value(huge_set)
    assert res_set["type"] == "set"
    assert "..." in res_set["value"]


def test_serialize_metaclass_no_side_effects():
    class HostileMeta(type):
        def __repr__(cls):
            raise RuntimeError("HostileMeta __repr__")

        def __str__(cls):
            raise RuntimeError("HostileMeta __str__")

        def __getattribute__(cls, name):
            if name in ("__repr__", "__str__", "boom"):
                raise RuntimeError("HostileMeta intercepted: " + name)
            return super().__getattribute__(name)

    class CustomClass(metaclass=HostileMeta):
        pass

    res = serializer.serialize_value(CustomClass)
    assert res["type"] == "class"
    assert "CustomClass" in res["value"]
