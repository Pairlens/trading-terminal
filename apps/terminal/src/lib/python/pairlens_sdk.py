# Copyright (c) 2026 Juan Ignacio Molina Estrada
# SPDX-License-Identifier: FSL-1.1-Apache-2.0
"""Pairlens indicator SDK.

User scripts import this module to declare chart indicators::

    from pairlens import indicator, input, series, hline, color
    from pairlens.ta import ema, rsi, crossover

    meta = indicator(
        title='My Indicator',
        pane='sub',
        inputs=[input.int('length', default=14)],
        series=[series.line('value', color=color.primary)],
    )

    def compute(ctx):
        return {'value': rsi(ctx.close, ctx.params.length)}

Beyond plain lines the SDK covers the whole Pine-style drawing vocabulary:
per-bar colors via ``plot(values, color=...)``, ``fill.between(...)`` regions,
``marker.shape(...)`` signal stamps, ``series.background(...)`` tints,
``alert.condition(...)`` conditions wired into the alert engine, and
``request.security(...)`` for higher-timeframe or cross-symbol data read back
through ``ctx.data(key)``. ``strategy(...)`` swaps the declaration for a
backtested entry/exit script.

An indicator can be split across several files: the entry module is
``main.py`` and every other file sits next to it, so ``import helpers`` (or
``from signals.ema import ema``) works the way it would in a folder of
scripts on disk.

The host (the terminal's Pyodide worker) calls the underscore-prefixed
runner functions at the bottom; user scripts never touch those.
"""

import array as _array_mod
import importlib as _importlib
import os as _os
import shutil as _shutil
import sys as _sys

_NAN = float('nan')


class PairlensScriptError(Exception):
    """Raised for indicator-script contract violations."""


# ── Color tokens ─────────────────────────────────────────────────────────────
# Semantic tokens serialize as 'token:*' strings; the chart layer resolves
# them against the active theme. Raw CSS colors pass through untouched.


class _Color:
    primary = 'token:primary'
    up = 'token:up'
    down = 'token:down'
    muted = 'token:muted'
    accent = 'token:accent'


color = _Color()


# ── Leveled logging ──────────────────────────────────────────────────────────
# print() already reaches the editor console; `log.*` adds a severity the
# console can color and filter. The \x01 sentinel is what the worker splits on
# — no user's own print() output will collide with it.

_LOG_SENTINEL = '\x01'


class _Log:
    """Leveled output for the editor console (Pine's `log.*`)."""

    def info(self, *args, sep=' '):
        """Log at info level."""
        self._emit('info', args, sep, _sys.stdout)

    def warning(self, *args, sep=' '):
        """Log at warning level."""
        self._emit('warning', args, sep, _sys.stderr)

    def error(self, *args, sep=' '):
        """Log at error level."""
        self._emit('error', args, sep, _sys.stderr)

    def _emit(self, level, args, sep, stream):
        text = sep.join(str(a) for a in args)
        print(
            _LOG_SENTINEL + level + _LOG_SENTINEL + text,
            file=stream,
        )


log = _Log()


# ── Input specs ──────────────────────────────────────────────────────────────


def _clean(d):
    return {k: v for k, v in d.items() if v is not None}


class _InputNamespace:
    """Builders for the `inputs=[...]` list. Shadowing builtins like `int`
    is intentional — scripts access these as `input.int(...)`."""

    def int(self, key, default=0, min=None, max=None, step=None, label=None):
        return _clean(
            {
                'kind': 'int',
                'key': key,
                'label': label,
                'default': default,
                'min': min,
                'max': max,
                'step': step,
            }
        )

    def float(self, key, default=0.0, min=None, max=None, step=None, label=None):
        return _clean(
            {
                'kind': 'float',
                'key': key,
                'label': label,
                'default': default,
                'min': min,
                'max': max,
                'step': step,
            }
        )

    def bool(self, key, default=False, label=None):
        return _clean(
            {'kind': 'bool', 'key': key, 'label': label, 'default': default}
        )

    def choice(self, key, options=None, default=None, label=None):
        options = list(options or [])
        if not options:
            raise PairlensScriptError(
                f"input.choice('{key}') needs a non-empty options list"
            )
        if default is None:
            default = options[0]
        return _clean(
            {
                'kind': 'choice',
                'key': key,
                'label': label,
                'default': default,
                'options': options,
            }
        )

    def source(self, key, default='close', label=None):
        return _clean(
            {'kind': 'source', 'key': key, 'label': label, 'default': default}
        )


input = _InputNamespace()


# ── Series specs ─────────────────────────────────────────────────────────────


class _SeriesNamespace:
    """Builders for the `series=[...]` list — one entry per plotted output."""

    def _spec(self, style, key, title, color, width, line_style, palette,
              opacity, hidden, up_down=None):
        return _clean(
            {
                'key': key,
                'style': style,
                'title': title,
                'color': color,
                'width': width,
                'lineStyle': line_style,
                'palette': list(palette) if palette else None,
                'opacity': opacity,
                'hidden': True if hidden else None,
                'upDown': up_down,
            }
        )

    def line(self, key, title=None, color=None, width=None, style=None,
             palette=None, hidden=None):
        """A connected polyline. NaN values break the line into segments."""
        return self._spec('line', key, title, color, width, style, palette,
                          None, hidden)

    def stepline(self, key, title=None, color=None, width=None, style=None,
                 palette=None, hidden=None):
        """A step-and-hold line — for levels that only change on events."""
        return self._spec('stepline', key, title, color, width, style,
                          palette, None, hidden)

    def histogram(self, key, title=None, color=None, up_down=None,
                  palette=None, opacity=None, hidden=None):
        """Vertical bars from zero. `up_down=True` colors by sign."""
        return self._spec('histogram', key, title, color, None, None, palette,
                          opacity, hidden, up_down=up_down)

    def columns(self, key, title=None, color=None, up_down=None, palette=None,
                opacity=None, hidden=None):
        """Wide bars from zero (Pine's `style_columns`)."""
        return self._spec('columns', key, title, color, None, None, palette,
                          opacity, hidden, up_down=up_down)

    def area(self, key, title=None, color=None, width=None, style=None,
             palette=None, opacity=None, hidden=None):
        """A line with the region down to zero filled."""
        return self._spec('area', key, title, color, width, style, palette,
                          opacity, hidden)

    def circles(self, key, title=None, color=None, width=None, palette=None,
                hidden=None):
        """One dot per bar, unconnected."""
        return self._spec('circles', key, title, color, width, None, palette,
                          None, hidden)

    def cross(self, key, title=None, color=None, width=None, palette=None,
              hidden=None):
        """One small cross per bar, unconnected."""
        return self._spec('cross', key, title, color, width, None, palette,
                          None, hidden)

    def background(self, key, title=None, color=None, palette=None,
                   opacity=None):
        """Per-bar tint across the whole pane (Pine's `bgcolor`). The values
        are palette indices; NaN leaves the bar untinted."""
        return self._spec('background', key, title, color, None, None,
                          palette, opacity, None)


series = _SeriesNamespace()


class _MarkerNamespace:
    """Builders for the `markers=[...]` list — signal stamps on bars."""

    def shape(self, key, shape='circle', position='above', at=None, color=None,
              size=None, text=None, title=None):
        """Stamp `shape` on every bar where compute()'s `key` output is
        nonzero. `position` is 'above' | 'below' | 'top' | 'bottom' |
        'series' (riding the series named by `at`)."""
        return _clean(
            {
                'key': key,
                'shape': shape,
                'position': position,
                'at': at,
                'color': color,
                'size': size,
                'text': text,
                'title': title,
            }
        )

    def buy(self, key, text='BUY', color=None, title=None):
        """Up triangle below the bar — the conventional long marker."""
        return self.shape(key, shape='triangle_up', position='below',
                          color=color or 'token:up', text=text, title=title)

    def sell(self, key, text='SELL', color=None, title=None):
        """Down triangle above the bar — the conventional short marker."""
        return self.shape(key, shape='triangle_down', position='above',
                          color=color or 'token:down', text=text, title=title)


marker = _MarkerNamespace()


class _FillNamespace:
    """Builders for the `fills=[...]` list — shaded regions between plots."""

    def between(self, a, b, color=None, palette=None, opacity=None,
                title=None):
        """Shade between two series. Pass `palette=[above, below]` for a
        two-tone fill that flips when the series cross."""
        return _clean(
            {
                'from': a,
                'to': b,
                'color': color,
                'palette': list(palette) if palette else None,
                'opacity': opacity,
                'title': title,
            }
        )

    def level(self, key, value, color=None, palette=None, opacity=None,
              title=None):
        """Shade between a series and a constant price/level."""
        return _clean(
            {
                'from': key,
                'level': float(value),
                'color': color,
                'palette': list(palette) if palette else None,
                'opacity': opacity,
                'title': title,
            }
        )


fill = _FillNamespace()


class _AlertNamespace:
    """Builders for the `alerts=[...]` list."""

    def condition(self, key, title, message=None):
        """Expose compute()'s `key` output as an alert condition: the terminal
        fires when it turns nonzero on a closing bar. `message` may use
        {{pair}}, {{timeframe}}, {{title}}, {{value}} and {{price}}."""
        return _clean({'key': key, 'title': title, 'message': message})


alert = _AlertNamespace()


class _RequestNamespace:
    """Builders for the `requests=[...]` list — extra candle series."""

    def security(self, key, timeframe=None, pair=None, market=None):
        """Ask the host for another candle series, read back in compute() via
        `ctx.data(key)`. Omit a field to inherit the chart's own."""
        return _clean(
            {
                'key': key,
                'timeframe': timeframe,
                'pair': pair,
                'market': market,
            }
        )


request = _RequestNamespace()


def hline(value, color=None, label=None):
    """A static horizontal reference level."""
    return _clean({'value': float(value), 'color': color, 'label': label})


class Plot:
    """A series' values plus a per-bar color, returned from compute()::

        return {'trend': plot(line, color=np.where(up, color.up, color.down))}

    `color` may be a single color, an array of colors (the SDK folds them into
    a palette automatically), or an array of indices into the series' declared
    `palette=[...]`.
    """

    __slots__ = ('values', 'color')

    def __init__(self, values, color=None):
        self.values = values
        self.color = color


def plot(values, color=None):
    """Pair a series' values with a per-bar color. See `Plot`."""
    return Plot(values, color)


# ── Indicator meta ───────────────────────────────────────────────────────────


class Meta:
    def __init__(
        self,
        title,
        pane='overlay',
        inputs=None,
        series=None,
        hlines=None,
        markers=None,
        fills=None,
        alerts=None,
        requests=None,
        strategy=None,
        packages=None,
        min_bars=None,
        precision=None,
        format=None,
    ):
        self.title = title
        self.pane = pane
        self.inputs = list(inputs or [])
        self.series = list(series or [])
        self.hlines = list(hlines or [])
        self.markers = list(markers or [])
        self.fills = list(fills or [])
        self.alerts = list(alerts or [])
        self.requests = list(requests or [])
        self.strategy = strategy
        self.packages = list(packages or [])
        self.min_bars = min_bars
        self.precision = precision
        self.format = format

    def to_dict(self):
        """Plain dict matching the host's CustomIndicatorMeta shape (the host
        stamps `id` itself)."""
        d = {
            'title': str(self.title),
            'pane': 'separate' if self.pane in ('sub', 'separate') else 'overlay',
            'inputs': [dict(i) for i in self.inputs],
            'series': [dict(s) for s in self.series],
        }
        if self.hlines:
            d['hlines'] = [
                h if isinstance(h, dict) else {'value': float(h)}
                for h in self.hlines
            ]
        for key, value in (
            ('markers', self.markers),
            ('fills', self.fills),
            ('alerts', self.alerts),
            ('requests', self.requests),
        ):
            if value:
                d[key] = [dict(v) for v in value]
        if self.strategy is not None:
            d['strategy'] = dict(self.strategy)
        if self.packages:
            d['packages'] = [str(p) for p in self.packages]
        if self.min_bars is not None:
            d['minBars'] = int(self.min_bars)
        if self.precision is not None:
            d['precision'] = int(self.precision)
        if self.format is not None:
            d['format'] = str(self.format)
        return d


def indicator(
    title,
    pane='overlay',
    inputs=None,
    series=None,
    hlines=None,
    markers=None,
    fills=None,
    alerts=None,
    requests=None,
    packages=None,
    min_bars=None,
    precision=None,
    format=None,
):
    """Declare a chart indicator. Assign the result to a top-level `meta`."""
    return Meta(
        title,
        pane=pane,
        inputs=inputs,
        series=series,
        hlines=hlines,
        markers=markers,
        fills=fills,
        alerts=alerts,
        requests=requests,
        packages=packages,
        min_bars=min_bars,
        precision=precision,
        format=format,
    )


def strategy(
    title,
    pane='overlay',
    inputs=None,
    series=None,
    hlines=None,
    markers=None,
    fills=None,
    alerts=None,
    requests=None,
    packages=None,
    min_bars=None,
    initial_capital=10000.0,
    position_size=1.0,
    fee=0.001,
    slippage=0.0,
    allow_short=True,
    stop_loss=None,
    take_profit=None,
    trailing_stop=None,
    max_bars=None,
):
    """Declare a backtested strategy. Identical to `indicator(...)`, except
    compute() also returns an `entries`/`exits` pair (or a `position` array of
    -1/0/1) that the terminal replays into an equity curve and trade list.

    `stop_loss` / `take_profit` / `trailing_stop` are fractions of the entry
    price (0.02 = 2%) and `max_bars` caps how long a position may stay open.
    They are checked per bar against the held position rather than inside
    compute(), which is what lets a bot trading this strategy live apply the
    exact same exits the backtest did.
    """
    risk = _clean(
        {
            'stopLoss': None if stop_loss is None else float(stop_loss),
            'takeProfit': None if take_profit is None else float(take_profit),
            'trailingStop': (
                None if trailing_stop is None else float(trailing_stop)
            ),
            'maxBars': None if max_bars is None else int(max_bars),
        }
    )
    spec = {
        'initialCapital': float(initial_capital),
        'positionSize': float(position_size),
        'fee': float(fee),
        'slippage': float(slippage),
        'allowShort': bool(allow_short),
    }
    if risk:
        spec['risk'] = risk
    return Meta(
        title,
        pane=pane,
        inputs=inputs,
        series=series,
        hlines=hlines,
        markers=markers,
        fills=fills,
        alerts=alerts,
        requests=requests,
        packages=packages,
        min_bars=min_bars,
        strategy=spec,
    )


# ── Compute context ──────────────────────────────────────────────────────────


def _numpy():
    global _np_cache
    if _np_cache is _NP_UNSET:
        try:
            import numpy

            _np_cache = numpy
        except ImportError:
            _np_cache = None
    return _np_cache


_NP_UNSET = object()
_np_cache = _NP_UNSET


class Params(dict):
    """Mapping with attribute access: `ctx.params.length` == `ctx.params['length']`."""

    def __getattr__(self, name):
        try:
            return self[name]
        except KeyError:
            raise AttributeError(name) from None


class DataSeries:
    """One extra candle series pulled in by `request.security(...)`.

    Its arrays are on their own timeline (a 1d series is far shorter than the
    1h chart), so use `align()` to project a computed value back onto the
    chart's bars before returning it.
    """

    def __init__(self, key, *, time, open, high, low, close, volume,
                 host_time):
        self.key = key
        self.time = time
        self.open = open
        self.high = high
        self.low = low
        self.close = close
        self.volume = volume
        self._host_time = host_time

    def __len__(self):
        return len(self.close)

    def align(self, values, lookahead=False):
        """Project `values` (indexed by this series' bars) onto the chart's
        bars, holding each value until the next one arrives.

        By default a chart bar sees only the last *closed* bar of this series,
        which is what keeps a higher-timeframe value from repainting. Pass
        ``lookahead=True`` to use the in-progress bar instead.
        """
        np = _numpy()
        host = self._host_time
        n = len(host)
        offset = 0 if lookahead else 1
        if np is not None and isinstance(host, np.ndarray):
            src = np.asarray(values, dtype=np.float64).ravel()
            idx = np.searchsorted(self.time, host, side='right') - 1 - offset
            out = np.full(n, _NAN)
            ok = (idx >= 0) & (idx < len(src))
            out[ok] = src[idx[ok]]
            return out
        # numpy-less fallback: single forward walk, both timelines ascending.
        src = list(values)
        out = [_NAN] * n
        cursor = 0
        times = list(self.time)
        for i in range(n):
            while cursor < len(times) and times[cursor] <= host[i]:
                cursor += 1
            pos = cursor - 1 - offset
            if 0 <= pos < len(src):
                out[i] = src[pos]
        return out


class Context:
    """Per-compute call context. `time/open/high/low/close/volume` are numpy
    float64 arrays when numpy is loaded, plain Python lists otherwise."""

    def __init__(
        self,
        *,
        time,
        open,
        high,
        low,
        close,
        volume,
        params,
        pair,
        timeframe,
        source_key='close',
        data=None,
    ):
        self.time = time
        self.open = open
        self.high = high
        self.low = low
        self.close = close
        self.volume = volume
        self.params = Params(params)
        self.pair = pair
        self.timeframe = timeframe
        self.source = _select_source(self, source_key)
        self._data = data or {}

    def __len__(self):
        return len(self.close)

    def data(self, key):
        """The extra candle series declared as `request.security(key, ...)`."""
        entry = self._data.get(key)
        if entry is None:
            raise PairlensScriptError(
                f"no data for '{key}' — declare it with "
                f"request.security('{key}', ...) in requests=[...]"
            )
        return entry


def _select_source(ctx, key):
    if key in ('open', 'high', 'low', 'close'):
        return getattr(ctx, key)
    np = _numpy()
    o, h, l, c = ctx.open, ctx.high, ctx.low, ctx.close
    if np is not None and isinstance(c, np.ndarray):
        if key == 'hl2':
            return (h + l) / 2.0
        if key == 'hlc3':
            return (h + l + c) / 3.0
        if key == 'ohlc4':
            return (o + h + l + c) / 4.0
    else:
        if key == 'hl2':
            return [(h[i] + l[i]) / 2.0 for i in range(len(c))]
        if key == 'hlc3':
            return [(h[i] + l[i] + c[i]) / 3.0 for i in range(len(c))]
        if key == 'ohlc4':
            return [(o[i] + h[i] + l[i] + c[i]) / 4.0 for i in range(len(c))]
    return c


# ── Multi-file scripts ───────────────────────────────────────────────────────
# Each indicator gets its own directory on the pyodide filesystem holding its
# entry module plus any helper modules. That directory is what `sys.path[0]`
# points at while the indicator runs, so `import helpers` resolves exactly like
# it would for a folder of scripts on disk.
#
# Two indicators may both ship a `helpers.py`, so only one directory is ever on
# the path: switching indicators parks the outgoing one's modules (keeping them
# warm) and restores the incoming one's.

_ROOT = '/pairlens_indicators'
_active_script = None
_parked = {}


def _script_dir(script_id):
    return _ROOT + '/' + str(script_id)


def _owned_module_names(script_id):
    prefix = _script_dir(script_id) + '/'
    names = []
    for name, mod in list(_sys.modules.items()):
        path = getattr(mod, '__file__', None)
        if path and path.startswith(prefix):
            names.append(name)
            continue
        # Namespace packages (a subdirectory with no __init__.py) carry no
        # __file__ — match them on their search path instead.
        search = getattr(mod, '__path__', None)
        if search is not None and any(
            str(p).startswith(prefix) for p in list(search)
        ):
            names.append(name)
    return names


def _park_active():
    global _active_script
    if _active_script is None:
        return
    stash = _parked.setdefault(_active_script, {})
    for name in _owned_module_names(_active_script):
        stash[name] = _sys.modules.pop(name)
    _active_script = None


def _activate(script_id):
    """Make `script_id`'s directory the import root for subsequent imports."""
    global _active_script
    if _active_script == script_id:
        return
    _park_active()
    for name, mod in _parked.pop(script_id, {}).items():
        _sys.modules[name] = mod
    _sys.path[:] = [p for p in _sys.path if not p.startswith(_ROOT)]
    _sys.path.insert(0, _script_dir(script_id))
    _importlib.invalidate_caches()
    _active_script = script_id


def _forget_modules(script_id):
    """Drop every cached module of a script — its files are about to change."""
    _parked.pop(script_id, None)
    for name in _owned_module_names(script_id):
        _sys.modules.pop(name, None)


def _safe_relpath(rel):
    """Reject anything that could write outside the script's own directory —
    module paths reach here from installed plugins, not only the editor."""
    rel = str(rel)
    parts = rel.split('/')
    if not rel.endswith('.py') or not parts or any(
        p in ('', '.', '..') for p in parts
    ):
        raise PairlensScriptError(f"invalid module path '{rel}'")
    return rel


def _write_files(script_id, files):
    """Mirror the editor's files into the script's directory (replacing it, so
    deleted and renamed files disappear)."""
    path = _script_dir(script_id)
    _shutil.rmtree(path, ignore_errors=True)
    _os.makedirs(path, exist_ok=True)
    for rel, src in files.items():
        full = path + '/' + _safe_relpath(rel)
        parent = _os.path.dirname(full)
        if parent and parent != path:
            _os.makedirs(parent, exist_ok=True)
        with open(full, 'w') as fh:
            fh.write(src)


# ── Host-facing runners (called by the Pyodide worker) ───────────────────────

_registry = {}


def _from_js_f64(js_array, np):
    """One copy out of the JS heap (to_bytes), then a zero-copy numpy view
    (copied once more to be writable) or a plain list fallback."""
    to_bytes = getattr(js_array, 'to_bytes', None)
    if to_bytes is not None:
        data = to_bytes()
    else:
        data = js_array.to_py()
    if np is not None:
        return np.frombuffer(data, dtype=np.float64).copy()
    arr = _array_mod.array('d')
    arr.frombytes(bytes(data))
    return arr.tolist()


def _register_script(script_id, source, modules=None):
    global _active_script
    files = {'main.py': source}
    if modules is not None:
        for path, src in dict(modules).items():
            files[str(path)] = src
    _forget_modules(script_id)
    _write_files(script_id, files)
    # Files changed underneath the active path — force a full re-activation.
    if _active_script == script_id:
        _active_script = None
    _activate(script_id)

    ns = {
        '__name__': f'pairlens_script_{script_id}',
        '__file__': _script_dir(script_id) + '/main.py',
    }
    code = compile(source, f'<indicator:{script_id}>', 'exec')
    exec(code, ns)
    meta = ns.get('meta')
    compute = ns.get('compute')
    if not isinstance(meta, Meta):
        raise PairlensScriptError(
            'script must define a top-level `meta = indicator(...)`'
        )
    if not callable(compute):
        raise PairlensScriptError('script must define a `compute(ctx)` function')
    _registry[script_id] = {'ns': ns, 'meta': meta, 'compute': compute}
    return meta.to_dict()


def _norm_value(value, np):
    """Normalize one compute() output to a float scalar or a float64 buffer
    (numpy array / array('d')) the host reads out via the buffer protocol."""
    if value is None:
        return _NAN
    if isinstance(value, bool):
        return 1.0 if value else 0.0
    if isinstance(value, (int, float)):
        return float(value)
    if np is not None and isinstance(value, np.ndarray):
        return np.ascontiguousarray(value, dtype=np.float64)
    try:
        items = iter(value)
    except TypeError:
        raise PairlensScriptError(
            f'compute() output values must be numbers or sequences, got {type(value).__name__}'
        ) from None
    return _array_mod.array('d', (_NAN if v is None else float(v) for v in items))


# Palettes built during the last _compute, drained by the host right after.
_palettes = {}


def _palette_indices(colors, length, np):
    """Fold a per-bar color declaration into (palette, index-array).

    Colors stay in Python: only the small palette and a float64 index array
    cross into JS, so per-bar coloring costs nothing per candle.
    Returns (None, indices) when the script already passed indices into a
    palette it declared on the series spec.
    """
    if isinstance(colors, str):
        if np is not None:
            return [colors], np.zeros(length, dtype=np.float64)
        return [colors], _array_mod.array('d', [0.0] * length)

    if np is not None and isinstance(colors, np.ndarray):
        if colors.dtype.kind in ('U', 'S', 'O'):
            palette, inverse = np.unique(colors, return_inverse=True)
            return (
                [str(c) for c in palette],
                np.ascontiguousarray(inverse, dtype=np.float64),
            )
        return None, np.ascontiguousarray(colors, dtype=np.float64)

    items = list(colors)
    if items and not isinstance(items[0], str):
        return None, _array_mod.array(
            'd', (_NAN if v is None else float(v) for v in items)
        )
    palette = []
    seen = {}
    out = _array_mod.array('d')
    for item in items:
        text = str(item)
        index = seen.get(text)
        if index is None:
            index = len(palette)
            seen[text] = index
            palette.append(text)
        out.append(float(index))
    return palette, out


def _collect_outputs(result, np):
    """Flatten compute()'s dict into float64 outputs, splitting any `plot()`
    wrapper into its values plus a `<key>:c` palette-index companion."""
    outputs = {}
    _palettes.clear()
    for raw_key, value in result.items():
        key = str(raw_key)
        if isinstance(value, Plot):
            values = _norm_value(value.values, np)
            outputs[key] = values
            if value.color is not None:
                length = 1 if isinstance(values, float) else len(values)
                palette, indices = _palette_indices(value.color, length, np)
                outputs[key + ':c'] = indices
                if palette is not None:
                    _palettes[key] = palette
            continue
        outputs[key] = _norm_value(value, np)
    return outputs


def _take_palettes():
    """Hand the host the palettes built by the last _compute, then forget
    them. Safe because the host runs one compute at a time."""
    out = {k: list(v) for k, v in _palettes.items()}
    _palettes.clear()
    return out


def _build_data(extra, host_time, np):
    """Wrap the host's extra candle series as DataSeries keyed by request."""
    data = {}
    # The host always sends an array, but JS null/undefined would arrive as a
    # non-iterable proxy rather than None — don't let that take down a compute.
    try:
        items = list(extra) if extra is not None else []
    except TypeError:
        return data
    for item in items:
        candles = item.candles
        key = str(item.key)
        data[key] = DataSeries(
            key,
            time=_from_js_f64(candles.time, np),
            open=_from_js_f64(candles.open, np),
            high=_from_js_f64(candles.high, np),
            low=_from_js_f64(candles.low, np),
            close=_from_js_f64(candles.close, np),
            volume=_from_js_f64(candles.volume, np),
            host_time=host_time,
        )
    return data


def _compute(script_id, candles, params, pair, timeframe, source_key,
             extra=None):
    entry = _registry.get(script_id)
    if entry is None:
        raise PairlensScriptError(f"unknown script '{script_id}'")
    # compute() may import helper modules lazily — point sys.path at this
    # script's own directory first.
    _activate(script_id)
    np = _numpy()
    time = _from_js_f64(candles.time, np)
    ctx = Context(
        time=time,
        open=_from_js_f64(candles.open, np),
        high=_from_js_f64(candles.high, np),
        low=_from_js_f64(candles.low, np),
        close=_from_js_f64(candles.close, np),
        volume=_from_js_f64(candles.volume, np),
        params=dict(params),
        pair=pair,
        timeframe=timeframe,
        source_key=source_key,
        data=_build_data(extra, time, np),
    )
    result = entry['compute'](ctx)
    if not isinstance(result, dict):
        raise PairlensScriptError(
            'compute(ctx) must return a dict of series-key -> values'
        )
    return _collect_outputs(result, np)


def _format_source(source, line_length=88):
    """Reformat Python source with black, which the host installs on demand.

    Lives here rather than in the worker because black's `mode` is a
    keyword-only argument, and keywords do not survive a plain JS-side call.
    """
    import black

    return black.format_str(source, mode=black.Mode(line_length=line_length))


def _dispose_script(script_id):
    global _active_script
    _registry.pop(script_id, None)
    _forget_modules(script_id)
    if _active_script == script_id:
        _sys.path[:] = [p for p in _sys.path if not p.startswith(_ROOT)]
        _active_script = None
    _shutil.rmtree(_script_dir(script_id), ignore_errors=True)
