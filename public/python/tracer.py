"""
tracer.py
CPython execution tracer using sys.settrace.
Emits bounded TraceEvents conforming to types.ts TraceEvent schema.
Only traces user workspace frames and coordinates with playground_world.
"""

import sys
from typing import Callable, Dict, List, Optional, Set

import playground_world
import serializer


class _TracedStream:
    """Wraps stdout/stderr to capture outputs as ordered TraceEvents in slow mode."""

    def __init__(self, tracer: "ExecutionTracer", channel: str, original):
        self.tracer = tracer
        self.channel = channel
        self.original = original

    def write(self, text) -> int:
        if isinstance(text, bytes):
            s = text.decode("utf-8", errors="replace")
        elif not isinstance(text, str):
            s = str(text)
        else:
            s = text
        self.tracer._record_output(self.channel, s)
        return len(s)

    def flush(self) -> None:
        pass

    def isatty(self) -> bool:
        return False


class _TracedStdin:
    """Wraps stdin so each answer typed for input() is echoed as an ordered stdout TraceEvent."""

    def __init__(self, tracer: "ExecutionTracer", original):
        self.tracer = tracer
        self.original = original

    def readline(self, *args) -> str:
        line = self.original.readline(*args)
        if line:
            self.tracer._record_output("stdout", line if line.endswith("\n") else line + "\n")
        return line

    def read(self, *args) -> str:
        return self.original.read(*args)

    def isatty(self) -> bool:
        return False

    def __getattr__(self, name):
        return getattr(self.original, name)


class ExecutionTracer:
    def __init__(
        self,
        workspace_filename: str = "main.py",
        allowed_filenames: Optional[Set[str]] = None,
        max_events: int = 3000,
        on_event: Optional[Callable[[dict], None]] = None,
    ):
        self.workspace_filename = workspace_filename
        self.allowed_filenames = allowed_filenames or {workspace_filename, "<string>", "<workspace>", "main.py"}
        self.max_events = max_events
        self.on_event = on_event
        self.events: List[dict] = []
        self.seq = 0
        self.stopped = False
        self._current_world_state: Optional[dict] = None

        # Listen to playground_world actions
        playground_world.set_world_listener(self._handle_world_action)

    def _handle_world_action(self, state: dict) -> None:
        """
        Record world state update.
        Emits a new unique strictly ordered event so event seq is strictly increasing
        and previously emitted events are never mutated.
        """
        self._current_world_state = dict(state)
        if self.stopped or self.seq >= self.max_events:
            self.stop()
            return

        self.seq += 1
        last_ev = self.events[-1] if self.events else {}
        event: Dict = {
            "seq": self.seq,
            "kind": "line",
            "line": last_ev.get("line", 1),
            "file": last_ev.get("file", self.workspace_filename),
            "name": last_ev.get("name", "<module>"),
            "locals": dict(last_ev.get("locals", {})),
            "stack": list(last_ev.get("stack", ["<main>"])),
            "world": dict(state),
        }
        self.events.append(event)
        if self.on_event:
            try:
                self.on_event(event)
            except Exception:
                pass

    def is_workspace_frame(self, frame) -> bool:
        """Return True only if the frame belongs to user workspace code."""
        filename = frame.f_code.co_filename
        if filename in self.allowed_filenames:
            return True
        base = filename.split("/")[-1].split("\\")[-1]
        return base in self.allowed_filenames

    def _record_event(
        self,
        kind: str,
        line: int,
        frame,
        name: Optional[str] = None,
        text: Optional[str] = None,
    ) -> None:
        if self.stopped or self.seq >= self.max_events:
            self.stop()
            return

        self.seq += 1
        co = frame.f_code
        file_name = co.co_filename
        fn_name = name or co.co_name

        locals_dict = serializer.serialize_locals(frame.f_locals)
        stack_list = serializer.serialize_stack(frame, self.workspace_filename)

        event: Dict = {
            "seq": self.seq,
            "kind": kind,
            "line": line,
            "file": file_name,
            "name": fn_name,
            "locals": locals_dict,
            "stack": stack_list,
        }

        if text is not None:
            event["text"] = text

        # Preserve world scene current state for backwards replay
        if self._current_world_state is not None:
            w = dict(self._current_world_state)
            w["action"] = "idle"
            event["world"] = w

        self.events.append(event)
        if self.on_event:
            try:
                self.on_event(event)
            except Exception:
                pass

    def _record_output(self, channel: str, text: str) -> None:
        """Record stdout or stderr output as a TraceEvent in slow mode."""
        if not text:
            return
        if self.stopped or self.seq >= self.max_events:
            self.stop()
            return

        self.seq += 1

        # Search up the call stack for the user workspace frame
        user_frame = None
        try:
            curr = sys._getframe(2)
            while curr:
                if self.is_workspace_frame(curr):
                    user_frame = curr
                    break
                curr = curr.f_back
        except Exception:
            user_frame = None

        last_ev = self.events[-1] if self.events else {}
        line = user_frame.f_lineno if user_frame else last_ev.get("line", 1)
        file_name = user_frame.f_code.co_filename if user_frame else last_ev.get("file", self.workspace_filename)
        name = user_frame.f_code.co_name if user_frame else last_ev.get("name", "<module>")
        locals_dict = serializer.serialize_locals(user_frame.f_locals) if user_frame else dict(last_ev.get("locals", {}))
        stack_list = serializer.serialize_stack(user_frame, self.workspace_filename) if user_frame else list(last_ev.get("stack", ["<main>"]))

        event: Dict = {
            "seq": self.seq,
            "kind": channel,
            "line": line,
            "file": file_name,
            "name": name,
            "locals": locals_dict,
            "stack": stack_list,
            "text": text,
        }

        if self._current_world_state is not None:
            w = dict(self._current_world_state)
            w["action"] = "idle"
            event["world"] = w

        self.events.append(event)
        if self.on_event:
            try:
                self.on_event(event)
            except Exception:
                pass

    def trace_dispatch(self, frame, event: str, arg):
        if self.stopped:
            return None

        if not self.is_workspace_frame(frame):
            return None

        lineno = frame.f_lineno

        if event == "line":
            self._record_event(kind="line", line=lineno, frame=frame)
            return self.trace_dispatch

        elif event == "call":
            fn_name = frame.f_code.co_name
            if fn_name != "<module>":
                self._record_event(kind="call", line=lineno, frame=frame, name=fn_name)
            return self.trace_dispatch

        elif event == "return":
            fn_name = frame.f_code.co_name
            if fn_name != "<module>":
                return_val_str = serializer.serialize_value(arg, max_depth=1)["value"]
                self._record_event(kind="return", line=lineno, frame=frame, name=fn_name, text=return_val_str)
            return self.trace_dispatch

        elif event == "exception":
            exc_type, exc_val, _ = arg
            exc_name = getattr(exc_type, "__name__", "Exception")
            exc_msg = f"{exc_name}: {exc_val}"
            self._record_event(kind="exception", line=lineno, frame=frame, text=exc_msg)
            return self.trace_dispatch

        return self.trace_dispatch

    def start(self) -> None:
        """Activate sys.settrace."""
        self.stopped = False
        sys.settrace(self.trace_dispatch)

    def stop(self) -> None:
        """Deactivate sys.settrace."""
        self.stopped = True
        sys.settrace(None)
        playground_world.set_world_listener(None)


def run_traced(
    code: str,
    globals_dict: Optional[dict] = None,
    filename: str = "main.py",
    max_events: int = 3000,
    on_event: Optional[Callable[[dict], None]] = None,
) -> List[dict]:
    """
    Execute user Python code with bounded tracing and return list of TraceEvents.
    Explicit lesson module only (no implicit injection of move_forward/turn_left/turn_right).
    """
    tracer = ExecutionTracer(
        workspace_filename=filename,
        max_events=max_events,
        on_event=on_event,
    )

    if globals_dict is None:
        globals_dict = {}

    globals_dict["__name__"] = "__main__"
    globals_dict["__file__"] = filename

    compiled = compile(code, filename, "exec")
    old_stdout = sys.stdout
    old_stderr = sys.stderr
    old_stdin = sys.stdin
    sys.stdin = _TracedStdin(tracer, old_stdin)
    sys.stdout = _TracedStream(tracer, "stdout", old_stdout)
    sys.stderr = _TracedStream(tracer, "stderr", old_stderr)

    tracer.start()
    try:
        exec(compiled, globals_dict)
    finally:
        tracer.stop()
        sys.stdout = old_stdout
        sys.stderr = old_stderr
        sys.stdin = old_stdin

    return tracer.events


__all__ = ["ExecutionTracer", "run_traced"]
