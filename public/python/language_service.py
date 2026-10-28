"""
language_service.py
Static Python language intelligence service powered by Jedi.
Uses in-process InterpreterEnvironment to avoid subprocess spawning in browser WebAssembly.
Never executes source code to generate completions.
"""

from typing import Dict, List, Optional

jedi = None
_env = None
_JEDI_AVAILABLE = False
_INIT_ERROR = None

try:
    import jedi
    from jedi.api.environment import InterpreterEnvironment

    _env = InterpreterEnvironment()
    _JEDI_AVAILABLE = True
except Exception as exc:
    _env = None
    _JEDI_AVAILABLE = False
    _INIT_ERROR = str(exc)


def _map_jedi_type_to_kind(jedi_type: str) -> str:
    """Map Jedi completion types to lowercase strings expected by Monaco mapper."""
    mapping = {
        "module": "module",
        "class": "class",
        "instance": "variable",
        "function": "function",
        "param": "variable",
        "path": "file",
        "keyword": "keyword",
        "property": "property",
        "statement": "variable",
    }
    return mapping.get(jedi_type, "variable")


def _clamp_position(code: str, line: int, column: int) -> tuple[int, int]:
    """
    Safely clamp line (1-based) and column (0-based) to valid ranges.
    Prevents ValueError when column is passed beyond line length.
    """
    lines = code.splitlines() or [""]
    safe_line = max(1, min(line, len(lines)))
    line_len = len(lines[safe_line - 1])
    safe_col = max(0, min(column, line_len))
    return safe_line, safe_col


def complete(code: str, line: int, column: int) -> List[Dict[str, str]]:
    """
    Perform static code completion.
    line: 1-based line number
    column: 0-based column index (clamped to line length)
    Returns list of { label: str, kind: str, detail: str, insertText: str }
    """
    if not _JEDI_AVAILABLE or jedi is None or _env is None:
        raise RuntimeError(f"Jedi language service is not available: {_INIT_ERROR or 'Jedi failed to initialize'}")

    safe_line, safe_col = _clamp_position(code, line, column)
    script = jedi.Script(code=code, path="main.py", environment=_env)
    completions = script.complete(line=safe_line, column=safe_col)
    results = []
    for c in completions:
        item = {
            "label": c.name,
            "kind": _map_jedi_type_to_kind(c.type),
            "detail": c.description or "",
            "insertText": c.name,
        }
        results.append(item)
    return results


def signature(code: str, line: int, column: int) -> str:
    """
    Get function signature help.
    line: 1-based line number
    column: 0-based column index
    """
    if not _JEDI_AVAILABLE or jedi is None or _env is None:
        raise RuntimeError(f"Jedi language service is not available: {_INIT_ERROR or 'Jedi failed to initialize'}")

    safe_line, safe_col = _clamp_position(code, line, column)
    script = jedi.Script(code=code, path="main.py", environment=_env)
    signatures = script.get_signatures(line=safe_line, column=safe_col)
    if not signatures:
        return ""
    sig_strings = [s.to_string() for s in signatures]
    return "\n".join(sig_strings)


def hover(code: str, line: int, column: int) -> str:
    """
    Get hover documentation and type info.
    line: 1-based line number
    column: 0-based column index
    """
    if not _JEDI_AVAILABLE or jedi is None or _env is None:
        raise RuntimeError(f"Jedi language service is not available: {_INIT_ERROR or 'Jedi failed to initialize'}")

    safe_line, safe_col = _clamp_position(code, line, column)
    script = jedi.Script(code=code, path="main.py", environment=_env)
    help_defs = script.help(line=safe_line, column=safe_col)
    if not help_defs:
        return ""
    docs = []
    for h in help_defs:
        doc = h.docstring(raw=True)
        if doc:
            docs.append(f"**{h.name}** ({h.type}):\n```python\n{h.description}\n```\n{doc}")
        else:
            docs.append(f"**{h.name}** ({h.type}):\n```python\n{h.description}\n```")
    return "\n\n---\n\n".join(docs)


__all__ = ["complete", "signature", "hover"]
