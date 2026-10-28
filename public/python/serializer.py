"""
serializer.py
Safe object and frame serializer for trace visualization.
Protects against user-defined __repr__ side-effects, infinite recursions,
and property getters during inspection.
"""

from itertools import islice
import types
from typing import Optional

PRIMITIVE_TYPES = (bool, int, float, str, bytes, type(None))


def safe_repr_custom(obj) -> str:
    """
    Safely produce a string representation of an object without invoking
    any user-overridden __repr__ or __str__ methods.
    """
    try:
        return object.__repr__(obj)
    except Exception:
        try:
            cls_name = getattr(type(obj), "__name__", "object")
        except Exception:
            cls_name = "object"
        return f"<{cls_name} object at {hex(id(obj))}>"


def serialize_value(val, max_depth: int = 2, max_len: int = 160) -> dict:
    """
    Serialize an arbitrary Python value to {type: string, value: string, id?: string}
    conforming to types.ts Value interface.
    """
    val_type = type(val)

    if val is None:
        return {"type": "NoneType", "value": "None"}

    if val_type is bool:
        return {"type": "bool", "value": "True" if val else "False"}

    if val_type is int:
        s = str(val)
        if len(s) > max_len:
            s = s[:max_len] + "..."
        return {"type": "int", "value": s}

    if val_type is float:
        s = str(val)
        if len(s) > max_len:
            s = s[:max_len] + "..."
        return {"type": "float", "value": s}

    if val_type is str:
        s = repr(val)
        if len(s) > max_len:
            s = s[:max_len] + "...'"
        return {"type": "str", "value": s}

    if val_type is bytes:
        s = repr(val)
        if len(s) > max_len:
            s = s[:max_len] + "...'"
        return {"type": "bytes", "value": s}

    obj_id = hex(id(val))

    # Built-in collections (exact type check to avoid custom __iter__ hooks)
    if val_type is list:
        if max_depth <= 0:
            return {"type": "list", "value": f"list({len(val)})", "id": obj_id}
        # Safely slice at most 8 items without traversing entire large list
        sliced = list.__getitem__(val, slice(0, 8))
        items = [serialize_value(item, max_depth - 1, max_len=40)["value"] for item in sliced]
        if len(val) > 8:
            items.append("...")
        return {"type": "list", "value": f"[{', '.join(items)}]", "id": obj_id}

    if val_type is tuple:
        if max_depth <= 0:
            return {"type": "tuple", "value": f"tuple({len(val)})", "id": obj_id}
        sliced = tuple.__getitem__(val, slice(0, 8))
        items = [serialize_value(item, max_depth - 1, max_len=40)["value"] for item in sliced]
        if len(val) > 8:
            items.append("...")
        if len(items) == 1 and items[0] != "...":
            return {"type": "tuple", "value": f"({items[0]},)", "id": obj_id}
        return {"type": "tuple", "value": f"({', '.join(items)})", "id": obj_id}

    if val_type is set:
        if max_depth <= 0:
            return {"type": "set", "value": f"set({len(val)})", "id": obj_id}
        if len(val) == 0:
            return {"type": "set", "value": "set()", "id": obj_id}
        # Use islice on exact set iterator to only take 8 items without traversing entire large set
        items = [serialize_value(item, max_depth - 1, max_len=40)["value"] for item in islice(val, 8)]
        if len(val) > 8:
            items.append("...")
        return {"type": "set", "value": f"{{{', '.join(items)}}}", "id": obj_id}

    if val_type is dict:
        if max_depth <= 0:
            return {"type": "dict", "value": f"dict({len(val)})", "id": obj_id}
        items = []
        for k, v in islice(val.items(), 8):
            k_str = serialize_value(k, 0, max_len=20)["value"]
            v_str = serialize_value(v, max_depth - 1, max_len=40)["value"]
            items.append(f"{k_str}: {v_str}")
        if len(val) > 8:
            items.append("...")
        return {"type": "dict", "value": f"{{{', '.join(items)}}}", "id": obj_id}

    # Functions, methods, modules, classes - safely check type without invoking user hooks
    try:
        if val_type in (types.FunctionType, types.BuiltinFunctionType):
            fn_name = getattr(val, "__name__", "anonymous")
            return {"type": "function", "value": f"<function {fn_name}>", "id": obj_id}

        if val_type in (types.MethodType, types.BuiltinMethodType):
            m_name = getattr(val, "__name__", "anonymous")
            return {"type": "method", "value": f"<method {m_name}>", "id": obj_id}

        if val_type is types.ModuleType:
            mod_name = getattr(val, "__name__", "anonymous")
            return {"type": "module", "value": f"<module {mod_name}>", "id": obj_id}

        if isinstance(val, type):
            cls_name = getattr(val, "__name__", "type")
            return {"type": "class", "value": f"<class {cls_name}>", "id": obj_id}
    except Exception:
        pass

    # Custom object instances: NEVER invoke user __repr__ or __str__!
    try:
        type_name = getattr(val_type, "__name__", "object")
    except Exception:
        type_name = "object"

    safe_val = safe_repr_custom(val)
    if len(safe_val) > max_len:
        safe_val = safe_val[:max_len] + "...>"
    return {"type": type_name, "value": safe_val, "id": obj_id}


def serialize_locals(f_locals: dict, max_vars: int = 50) -> dict:
    """
    Serialize frame.f_locals to Record<string, Value>, filtering out internal variables.
    """
    result = {}
    count = 0
    for name, val in f_locals.items():
        if name.startswith("__") and name.endswith("__"):
            continue
        if name.startswith("_tracer") or name.startswith("_world"):
            continue
        if count >= max_vars:
            result["..."] = {"type": "info", "value": f"({len(f_locals) - count} variables omitted)"}
            break
        result[name] = serialize_value(val)
        count += 1
    return result


def serialize_stack(frame, workspace_filename: Optional[str] = None) -> list:
    """
    Walk call stack from root frame to current frame and return list of function names.
    Only includes workspace frames if workspace_filename is provided.
    """
    stack = []
    curr = frame
    while curr is not None:
        co = curr.f_code
        if workspace_filename is None or co.co_filename == workspace_filename:
            fn_name = co.co_name
            if fn_name == "<module>":
                stack.append("<main>")
            else:
                stack.append(f"{fn_name}()")
        curr = curr.f_back

    # Order from bottom (outermost) to top (innermost)
    stack.reverse()
    return stack


__all__ = ["serialize_value", "serialize_locals", "serialize_stack", "safe_repr_custom"]
