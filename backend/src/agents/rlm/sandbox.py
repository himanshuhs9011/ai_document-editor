"""The coding harness: a sandbox that runs model-written code over a long text.

Nothing here calls exec or eval. The code is parsed with ast, every node is checked against an allow-list, and a
small async interpreter walks the tree itself. The only objects code can reach are the values it builds and the
functions it is handed, methods only on plain str/list/dict/tuple/set values, and never a name with an underscore.
Steps, value sizes, printed output and helper calls are capped, so a runaway loop or a giant string ends with an
error message for the model instead of tying up the server.
"""
import ast
import asyncio
import re
import time
from dataclasses import dataclass
from typing import Any, Awaitable, Callable, Dict, List, Optional

MAX_CODE_CHARS = 20_000
MAX_STEPS = 200_000
MAX_CHARS = 4_000_000
MAX_ITEMS = 1_000_000
MAX_INT_BITS = 4_096
MAX_OUTPUT_CHARS = 20_000
# Seconds of computing per run; time spent waiting for helper models does not count.
MAX_COMPUTE_SECONDS = 5.0
# The interpreter hands the event loop back this often, so other requests keep moving while code runs.
YIELD_EVERY = 1_000
FORMAT_SPEC = re.compile(r"^[<>^]?\d{0,3}(,)?(\.\d{1,2})?[sdf%]?$")

METHODS = {
    str: {"lower", "upper", "strip", "lstrip", "rstrip", "split", "rsplit", "splitlines", "join", "replace", "find",
          "rfind", "count", "startswith", "endswith", "title", "capitalize", "isdigit", "isalpha", "isspace",
          "partition", "rpartition"},
    list: {"append", "extend", "insert", "pop", "index", "count", "sort", "reverse", "copy"},
    dict: {"get", "keys", "values", "items", "update", "pop", "setdefault", "copy"},
    tuple: {"index", "count"},
    set: {"add", "update", "discard", "union", "intersection", "difference"},
}
METHOD_NAMES = set().union(*METHODS.values())

STATEMENTS = (ast.Module, ast.Expr, ast.Assign, ast.AugAssign, ast.For, ast.While, ast.If, ast.Break, ast.Continue,
              ast.Pass)
EXPRESSIONS = (ast.Constant, ast.Name, ast.BinOp, ast.UnaryOp, ast.BoolOp, ast.Compare, ast.IfExp, ast.Call,
               ast.Attribute, ast.Subscript, ast.Slice, ast.List, ast.Tuple, ast.Dict, ast.Set, ast.ListComp,
               ast.SetComp, ast.DictComp, ast.GeneratorExp, ast.comprehension, ast.JoinedStr, ast.FormattedValue,
               ast.keyword)
CONTEXTS = (ast.Load, ast.Store)
OPERATORS = (ast.Add, ast.Sub, ast.Mult, ast.Div, ast.FloorDiv, ast.Mod, ast.Not, ast.USub, ast.UAdd, ast.And,
             ast.Or, ast.Eq, ast.NotEq, ast.Lt, ast.LtE, ast.Gt, ast.GtE, ast.In, ast.NotIn, ast.Is, ast.IsNot)
ALLOWED_NODES = STATEMENTS + EXPRESSIONS + CONTEXTS + OPERATORS


class SandboxError(Exception):
    """The code broke a sandbox rule or limit; the message is shown to the model."""


class _Break(Exception):
    pass


class _Continue(Exception):
    pass


def _check_name(name: str, lineno: int) -> None:
    if name.startswith("_"):
        raise SandboxError(f"line {lineno}: names starting with an underscore are not allowed")


def validate(code: str) -> ast.Module:
    """Parse the code and reject anything outside the allowed subset of Python."""
    if len(code) > MAX_CODE_CHARS:
        raise SandboxError(f"code is longer than {MAX_CODE_CHARS} characters")
    try:
        tree = ast.parse(code, mode="exec")
    except SyntaxError as error:
        raise SandboxError(f"syntax error on line {error.lineno}: {error.msg}") from None
    calls = {id(node.func) for node in ast.walk(tree) if isinstance(node, ast.Call)}
    for node in ast.walk(tree):
        line = getattr(node, "lineno", 0)
        if not isinstance(node, ALLOWED_NODES):
            raise SandboxError(f"line {line}: {type(node).__name__} is not allowed here (no imports, def, lambda, "
                               "class, try or with)")
        if isinstance(node, ast.Name):
            _check_name(node.id, line)
        elif isinstance(node, ast.Attribute):
            _check_name(node.attr, line)
            if id(node) not in calls or node.attr not in METHOD_NAMES:
                raise SandboxError(f"line {line}: .{node.attr} is not an allowed method call")
        elif isinstance(node, ast.Constant) and not isinstance(node.value, (str, int, float, bool, type(None))):
            raise SandboxError(f"line {line}: that kind of constant is not allowed")
        elif isinstance(node, (ast.For, ast.While)) and node.orelse:
            raise SandboxError(f"line {line}: else on a loop is not supported")
        elif isinstance(node, ast.comprehension) and node.is_async:
            raise SandboxError(f"line {line}: async comprehensions are not allowed")
        elif isinstance(node, ast.Call) and any(isinstance(arg, ast.Starred) for arg in node.args):
            raise SandboxError(f"line {line}: *args is not supported")
        elif isinstance(node, ast.keyword) and node.arg is None:
            raise SandboxError(f"line {line}: **kwargs is not supported")
        elif isinstance(node, ast.Dict) and any(key is None for key in node.keys):
            raise SandboxError(f"line {line}: ** in a dict is not supported")
        elif isinstance(node, ast.FormattedValue) and node.format_spec is not None:
            spec = node.format_spec
            if not (isinstance(spec, ast.JoinedStr) and all(isinstance(v, ast.Constant) for v in spec.values)
                    and FORMAT_SPEC.match("".join(str(v.value) for v in spec.values))):
                raise SandboxError(f"line {line}: only simple format specs like :>10 or :.2f are allowed")
    return tree


def _checked(value: Any) -> Any:
    """Refuse values big enough to hurt the server."""
    if isinstance(value, str) and len(value) > MAX_CHARS:
        raise SandboxError(f"a string grew past {MAX_CHARS:,} characters")
    if isinstance(value, (list, tuple, dict, set)) and len(value) > MAX_ITEMS:
        raise SandboxError(f"a collection grew past {MAX_ITEMS:,} items")
    if isinstance(value, int) and not isinstance(value, bool) and value.bit_length() > MAX_INT_BITS:
        raise SandboxError("a number grew too large")
    return value


def _text_size(value: Any, limit: int = MAX_CHARS) -> int:
    """Roughly how long str(value) would be, stopping as soon as it passes the limit (and safe on cycles)."""
    total, stack, seen = 0, [value], set()
    while stack and total <= limit:
        item = stack.pop()
        if isinstance(item, str):
            total += len(item) + 4
        elif isinstance(item, (list, tuple, set, dict)):
            if id(item) in seen:
                total += 5
                continue
            seen.add(id(item))
            total += 2 + 2 * len(item)
            stack.extend(item.items() if isinstance(item, dict) else item)
        else:
            total += 24 if not isinstance(item, int) or isinstance(item, bool) else item.bit_length() // 3 + 2
    return total


def _printable(value: Any) -> Any:
    if _text_size(value) > MAX_CHARS:
        raise SandboxError("that value is too large to turn into text; print a slice or len() instead")
    return value


def _safe_str(value: Any = "") -> str:
    return str(_printable(value))


def _safe_sum(items: Any, start: Any = 0) -> Any:
    if not isinstance(start, (int, float)):
        raise SandboxError("sum() only adds numbers; use \"\".join(...) for text")
    return sum(items, start)


def _safe_range(*args: int) -> range:
    span = range(*args)
    if len(span) > MAX_ITEMS:
        raise SandboxError(f"range is limited to {MAX_ITEMS:,} numbers")
    return span


SAFE_FUNCTIONS: Dict[str, Callable] = {
    "len": len, "str": _safe_str, "int": int, "float": float, "bool": bool, "list": list, "dict": dict, "set": set,
    "tuple": tuple, "range": _safe_range, "enumerate": enumerate, "zip": zip, "sorted": sorted, "reversed": reversed,
    "min": min, "max": max, "sum": _safe_sum, "abs": abs, "round": round, "any": any, "all": all,
}
_BINARY = {
    ast.Add: lambda a, b: a + b, ast.Sub: lambda a, b: a - b, ast.Mult: lambda a, b: a * b,
    ast.Div: lambda a, b: a / b, ast.FloorDiv: lambda a, b: a // b, ast.Mod: lambda a, b: a % b,
}
_COMPARE = {
    ast.Eq: lambda a, b: a == b, ast.NotEq: lambda a, b: a != b, ast.Lt: lambda a, b: a < b,
    ast.LtE: lambda a, b: a <= b, ast.Gt: lambda a, b: a > b, ast.GtE: lambda a, b: a >= b,
    ast.In: lambda a, b: a in b, ast.NotIn: lambda a, b: a not in b, ast.Is: lambda a, b: a is b,
    ast.IsNot: lambda a, b: a is not b,
}
_PLAIN = (str, int, float, bool, type(None), list, tuple, dict, set)


@dataclass
class RunResult:
    output: str
    error: Optional[str] = None


class Sandbox:
    """One interpreter whose variables persist between runs, like a notebook."""

    def __init__(self, variables: Dict[str, Any], functions: Dict[str, Callable],
                 helpers: Dict[str, Callable[..., Awaitable[Any]]]):
        self.globals: Dict[str, Any] = dict(variables)
        self.functions = {**SAFE_FUNCTIONS, **functions, "print": self._print}
        self.helpers = helpers
        self.scopes: List[Dict[str, Any]] = [self.globals]
        self.steps = 0
        self.output: List[str] = []
        self.output_size = 0
        self.started = 0.0
        self.waited = 0.0

    def get(self, name: str) -> Any:
        return self.globals.get(name)

    async def run(self, code: str) -> RunResult:
        self.steps, self.output, self.output_size, self.scopes = 0, [], 0, [self.globals]
        self.started, self.waited = time.monotonic(), 0.0
        try:
            tree = validate(code)
            await self._block(tree.body)
            return RunResult("".join(self.output))
        except (_Break, _Continue):
            return RunResult("".join(self.output), "break/continue outside a loop")
        except SandboxError as error:
            return RunResult("".join(self.output), str(error))
        except (TypeError, ValueError, KeyError, IndexError, ZeroDivisionError, OverflowError, AttributeError,
                RecursionError, MemoryError) as error:
            return RunResult("".join(self.output), f"{type(error).__name__}: {error}")

    def _print(self, *values: Any, sep: str = " ", end: str = "\n") -> None:
        # Only the part that can still be shown is ever joined, however many large values are printed.
        sep, end = _safe_str(sep), _safe_str(end)
        pieces = [piece for index, value in enumerate(values) for piece in ((sep,) if index else ()) + (_safe_str(value),)]
        for piece in pieces + [end]:
            room = MAX_OUTPUT_CHARS - self.output_size
            if room > 0:
                self.output.append(piece[:room])
            self.output_size += len(piece)

    async def _tick(self, node: ast.AST) -> None:
        self.steps += 1
        if self.steps > MAX_STEPS:
            raise SandboxError(f"stopped on line {getattr(node, 'lineno', '?')}: the code ran too long "
                               f"({MAX_STEPS:,} steps). Work on slices or use grep instead of looping over characters.")
        if time.monotonic() - self.started - self.waited > MAX_COMPUTE_SECONDS:
            raise SandboxError(f"stopped on line {getattr(node, 'lineno', '?')}: the code used more than "
                               f"{MAX_COMPUTE_SECONDS:g} seconds of computing. Work on smaller pieces.")
        if self.steps % YIELD_EVERY == 0:
            await asyncio.sleep(0)

    # Statements

    async def _block(self, body: List[ast.stmt]) -> None:
        for statement in body:
            await self._exec(statement)

    async def _exec(self, node: ast.stmt) -> None:
        await self._tick(node)
        if isinstance(node, ast.Expr):
            await self._eval(node.value)
        elif isinstance(node, ast.Assign):
            value = await self._eval(node.value)
            for target in node.targets:
                await self._assign(target, value)
        elif isinstance(node, ast.AugAssign):
            current = await self._eval(_as_load(node.target))
            await self._assign(node.target, self._binary(node.op, current, await self._eval(node.value)))
        elif isinstance(node, ast.If):
            await self._block(node.body if await self._eval(node.test) else node.orelse)
        elif isinstance(node, ast.For):
            for item in await self._eval(node.iter):
                await self._assign(node.target, item)
                try:
                    await self._block(node.body)
                except _Break:
                    break
                except _Continue:
                    continue
        elif isinstance(node, ast.While):
            while await self._eval(node.test):
                try:
                    await self._block(node.body)
                except _Break:
                    break
                except _Continue:
                    continue
        elif isinstance(node, ast.Break):
            raise _Break()
        elif isinstance(node, ast.Continue):
            raise _Continue()

    async def _assign(self, target: ast.expr, value: Any) -> None:
        if isinstance(target, ast.Name):
            if target.id in self.functions or target.id in self.helpers:
                raise SandboxError(f"line {target.lineno}: {target.id} is a built-in and cannot be replaced")
            self.scopes[-1][target.id] = value
        elif isinstance(target, (ast.Tuple, ast.List)):
            items = list(value)
            if len(items) != len(target.elts):
                raise SandboxError(f"line {target.lineno}: expected {len(target.elts)} values to unpack, got {len(items)}")
            for element, item in zip(target.elts, items):
                await self._assign(element, item)
        elif isinstance(target, ast.Subscript):
            container = await self._eval(target.value)
            if not isinstance(container, (list, dict)):
                raise SandboxError(f"line {target.lineno}: only list and dict items can be assigned")
            container[await self._eval(target.slice)] = value
            _checked(container)
        else:
            raise SandboxError(f"line {target.lineno}: cannot assign to that")

    # Expressions

    async def _eval(self, node: ast.expr) -> Any:
        await self._tick(node)
        if isinstance(node, ast.Constant):
            return node.value
        if isinstance(node, ast.Name):
            return self._lookup(node)
        if isinstance(node, ast.BinOp):
            return self._binary(node.op, await self._eval(node.left), await self._eval(node.right))
        if isinstance(node, ast.UnaryOp):
            operand = await self._eval(node.operand)
            return {ast.Not: lambda v: not v, ast.USub: lambda v: -v, ast.UAdd: lambda v: +v}[type(node.op)](operand)
        if isinstance(node, ast.BoolOp):
            value = None
            for part in node.values:
                value = await self._eval(part)
                if isinstance(node.op, ast.And) and not value or isinstance(node.op, ast.Or) and value:
                    return value
            return value
        if isinstance(node, ast.Compare):
            left = await self._eval(node.left)
            for op, comparator in zip(node.ops, node.comparators):
                right = await self._eval(comparator)
                if not _COMPARE[type(op)](left, right):
                    return False
                left = right
            return True
        if isinstance(node, ast.IfExp):
            return await self._eval(node.body if await self._eval(node.test) else node.orelse)
        if isinstance(node, ast.Call):
            return await self._call(node)
        if isinstance(node, ast.Subscript):
            container = await self._eval(node.value)
            if not isinstance(container, (str, list, tuple, dict)):
                raise SandboxError(f"line {node.lineno}: only strings, lists, tuples and dicts can be indexed")
            return container[await self._eval(node.slice)]
        if isinstance(node, ast.Slice):
            parts = [await self._eval(part) if part is not None else None for part in (node.lower, node.upper, node.step)]
            return slice(*parts)
        if isinstance(node, (ast.List, ast.Tuple, ast.Set)):
            items = [await self._eval(element) for element in node.elts]
            return _checked({ast.List: list, ast.Tuple: tuple, ast.Set: set}[type(node)](items))
        if isinstance(node, ast.Dict):
            return _checked({await self._eval(k): await self._eval(v) for k, v in zip(node.keys, node.values)})
        if isinstance(node, (ast.ListComp, ast.SetComp, ast.GeneratorExp, ast.DictComp)):
            return await self._comprehension(node)
        if isinstance(node, ast.JoinedStr):
            parts = [str(await self._eval(part)) for part in node.values]
            if sum(len(part) for part in parts) > MAX_CHARS:
                raise SandboxError(f"an f-string grew past {MAX_CHARS:,} characters")
            return "".join(parts)
        if isinstance(node, ast.FormattedValue):
            value = _printable(await self._eval(node.value))
            converter = {115: str, 114: repr, 97: ascii}.get(node.conversion)
            value = converter(value) if converter else value
            spec = "".join(str(v.value) for v in node.format_spec.values) if node.format_spec else ""
            return format(value, spec)
        raise SandboxError(f"line {getattr(node, 'lineno', '?')}: {type(node).__name__} is not supported")

    def _lookup(self, node: ast.Name) -> Any:
        for scope in reversed(self.scopes):
            if node.id in scope:
                return scope[node.id]
        if node.id in self.functions:
            return self.functions[node.id]
        if node.id in self.helpers:
            raise SandboxError(f"line {node.lineno}: {node.id} can only be called directly, e.g. {node.id}(...)")
        raise SandboxError(f"line {node.lineno}: name '{node.id}' is not defined")

    def _binary(self, op: ast.operator, left: Any, right: Any) -> Any:
        if isinstance(op, ast.Mod) and isinstance(left, str):
            raise SandboxError("%-formatting is not supported; use an f-string")
        if isinstance(op, ast.Mult):
            for sequence, count in ((left, right), (right, left)):
                if isinstance(sequence, (str, list, tuple)) and isinstance(count, int) and len(sequence) * max(count, 0) > MAX_CHARS:
                    raise SandboxError("that repetition would be too large")
        if isinstance(op, ast.Add) and isinstance(left, (str, list, tuple)) and isinstance(right, (str, list, tuple)):
            if len(left) + len(right) > MAX_CHARS:
                raise SandboxError(f"a value grew past {MAX_CHARS:,} characters")
        return _checked(_BINARY[type(op)](left, right))

    async def _call(self, node: ast.Call) -> Any:
        args = [await self._eval(arg) for arg in node.args]
        kwargs = {kw.arg: await self._eval(kw.value) for kw in node.keywords}
        if any(callable(value) and value not in self.functions.values() for value in [*args, *kwargs.values()]):
            raise SandboxError(f"line {node.lineno}: only built-in functions can be passed as arguments")
        if isinstance(node.func, ast.Attribute):
            owner = await self._eval(node.func.value)
            name = node.func.attr
            if type(owner) not in METHODS or name not in METHODS[type(owner)]:
                raise SandboxError(f"line {node.lineno}: {type(owner).__name__} has no allowed method .{name}")
            if isinstance(owner, str):
                _precheck_text_method(owner, name, args)
            result = _checked(getattr(owner, name)(*args, **kwargs))
            _checked(owner)  # append/extend/update grow the value in place
            return result
        if isinstance(node.func, ast.Name) and node.func.id in self.helpers and not any(
                node.func.id in scope for scope in self.scopes):
            waiting_since = time.monotonic()
            try:
                return _checked(await self.helpers[node.func.id](*args, **kwargs))
            finally:
                self.waited += time.monotonic() - waiting_since
        function = await self._eval(node.func)
        if function not in self.functions.values():
            raise SandboxError(f"line {node.lineno}: that value cannot be called")
        result = function(*args, **kwargs)
        # Lazy builtins (zip, enumerate, reversed) become lists so their size is checked like everything else.
        if not isinstance(result, _PLAIN + (range,)) and result is not None:
            result = list(result)
        return _checked(result)

    async def _comprehension(self, node: ast.expr) -> Any:
        results: List[Any] = []
        scope: Dict[str, Any] = {}
        self.scopes.append(scope)
        try:
            await self._generate(node, node.generators, 0, results)
        finally:
            self.scopes.pop()
        if isinstance(node, ast.SetComp):
            return _checked(set(results))
        if isinstance(node, ast.DictComp):
            return _checked(dict(results))
        return _checked(results)

    async def _generate(self, node: ast.expr, generators: List[ast.comprehension], index: int, results: List[Any]) -> None:
        if index == len(generators):
            if isinstance(node, ast.DictComp):
                results.append((await self._eval(node.key), await self._eval(node.value)))
            else:
                results.append(await self._eval(node.elt))
            if len(results) > MAX_ITEMS:
                raise SandboxError(f"a collection grew past {MAX_ITEMS:,} items")
            return
        generator = generators[index]
        for item in await self._eval(generator.iter):
            await self._assign(generator.target, item)
            if await self._passes(generator.ifs):
                await self._generate(node, generators, index + 1, results)

    async def _passes(self, conditions: List[ast.expr]) -> bool:
        for condition in conditions:
            if not await self._eval(condition):
                return False
        return True


def _precheck_text_method(text: str, name: str, args: List[Any]) -> None:
    """replace and join can build huge strings in one call, so their size is worked out first."""
    if name == "replace" and len(args) >= 2 and isinstance(args[0], str) and isinstance(args[1], str):
        hits = len(text) + 1 if args[0] == "" else text.count(args[0])
        if len(args) > 2 and isinstance(args[2], int) and args[2] >= 0:
            hits = min(hits, args[2])
        if len(text) + hits * max(0, len(args[1]) - len(args[0])) > MAX_CHARS:
            raise SandboxError(f"that replace would grow the text past {MAX_CHARS:,} characters")
    if name == "join" and args:
        items = args[0]
        if isinstance(items, (list, tuple, set, dict)):
            size = sum(len(item) for item in items if isinstance(item, str)) + len(text) * max(0, len(items) - 1)
            if size > MAX_CHARS:
                raise SandboxError(f"that join would grow past {MAX_CHARS:,} characters")


def _as_load(target: ast.expr) -> ast.expr:
    """The read form of an assignment target, for x += 1."""
    if isinstance(target, ast.Name):
        return ast.copy_location(ast.Name(id=target.id, ctx=ast.Load()), target)
    if isinstance(target, ast.Subscript):
        return ast.copy_location(ast.Subscript(value=target.value, slice=target.slice, ctx=ast.Load()), target)
    raise SandboxError("cannot use += on that")
