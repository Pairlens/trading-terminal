---
title: Python scripts
description: The workbench where you write indicators and strategies in real Python, run them against live candles, backtest them, and ship them to your charts or a bot.
group: traders
order: 5
eyebrow: For traders
updated: AUG 2026
readTime: 6 min read
---

Pairlens runs your Python. Not a scripting dialect that looks like Python: an
actual CPython interpreter compiled to WebAssembly (Pyodide), living in a
dedicated Web Worker, with numpy preloaded and pip packages available. Your
code and your candles never touch a server.

Open **Indicators & Strategies** in the left nav. That is the workbench.

## Two kinds of script

The difference is one line, and it decides what the script can do.

**`meta = indicator(...)`** declares something that draws. Lines, histograms,
markers, fills, reference levels. It shows up in every chart's indicator picker
under **Custom**.

**`meta = strategy(...)`** declares something that trades. Same drawing surface,
plus your `compute()` returns entries and exits. That makes it backtestable,
and deployable as a [bot](/docs/bots).

An indicator cannot run as a bot. There is nothing to execute. Swapping
`indicator(` for `strategy(` and returning entry and exit arrays is the whole
upgrade path.

## Templates

Nine to start from, six indicators and three strategies:

| Template               | Kind      | What it demonstrates                  |
| ---------------------- | --------- | ------------------------------------- |
| Simple Moving Average  | Indicator | The smallest useful script            |
| RSI                    | Indicator | Sub-pane, reference levels, zone fill |
| MACD                   | Indicator | Histogram with up and down colouring  |
| Bollinger Bands        | Indicator | Split across two files                |
| SuperTrend             | Indicator | Per-bar colour and markers            |
| Higher-Timeframe Trend | Indicator | Pulling a second timeframe            |
| EMA Cross Strategy     | Strategy  | Trend following, long and short       |
| RSI Reversion Bot      | Strategy  | Buying dips inside an uptrend         |
| Breakout Bot           | Strategy  | Channel break with a trailing stop    |

## The editor

**Live preview.** Pick a market, pair, and timeframe, hit **Run**, and the
script renders on a real chart with real candles. Adjust the data window and
history depth to test how your script behaves on 200 bars against 2,000.

**Parameters.** Your declared inputs render as controls right there, so you can
sweep a length from 9 to 21 and watch the plot move without editing code.

**Console.** Anything you `print()` lands here, along with `log.info`,
`log.warning`, and `log.error`, which are coloured by level.

**Errors.** Failures surface with the real Python traceback, trimmed to your
own frames so you are not reading Pyodide internals.

**Format.** One button formats the current file with black.

**Compute time.** Shown after every run. If your script is slow, you will know
before a chart tells you.

## Build with AI

The assistant is the rail on the right of the workbench, open by default, and
the composer on the empty page is the same thing: a chat that writes scripts
with you. Describe what you want in plain words ("an RSI that colours red
above 70", "a breakout strategy with a 3% stop") and it writes the Python
straight into your editor, validates it in the runtime, and re-runs the
preview so the result is on the chart before you reply. **Build with AI** in
the **+** menu above the script list starts the same conversation.

It checks its own work. Every write goes through the Python runtime, and when
the runtime rejects it the traceback comes back to the assistant, not to you:
it reads the error, fixes the code, and runs it again. What you see is the
attempt and the repair, and the script is validated by the time it says it is
done. For a strategy it goes one step further and backtests it, then reads the
stats back critically rather than selling them to you.

It works on existing scripts too. It reads every file of the open script, so
"make the bands adaptive" or "why does this throw?" needs no copy-pasting, and
it can add a helper module, rewrite one, or delete one it no longer imports.
Asking for something new gets a new script rather than an overwrite of the one
you are looking at. Every edit is saved through the normal path with version
history, so anything it does can be rolled back from the script's history.

The data under the preview is its to move as well. It can list the venues you
have connected and re-point the preview at another venue, pair, timeframe or
history depth when the script needs it, because a 4h breakout judged on 300
bars is not judged at all.

When a decision is yours rather than its, it asks. Questions arrive as a small
card with two to four options you tap, and you can always type something else
instead. It is the difference between a builder that picks your timeframe and
one that asks which you meant.

The two builders are one workflow. From here, a finished strategy you want
running goes to [Bots](/docs/bots) with a tap, and the assistant there picks
up the thread with the context already written down. It works the other way
too: ask the Bots assistant for something that needs real code and it brings
you back here.

The assistant uses whatever AI provider the terminal resolves: Pairlens
Intelligence when you are signed in with a plan, or any bring-your-own-key
provider (Groq, OpenAI, Anthropic, OpenRouter) from the Plugins page. The
whole loop runs in the terminal. Your prompt and the open script go to the
provider you chose (through the Pairlens inference proxy when that provider is
Pairlens Intelligence, which only forwards the request and streams the
response), and the tools it calls execute on your machine.

## Multiple files

A script is a folder, not a single file. `main.py` is the entry module that
defines `meta` and `compute`, and you can add helper modules next to it and
`import helpers` exactly as you would on disk. The Bollinger Bands template
ships this way as a worked example.

Each script gets its own directory on the Python filesystem, so two scripts can
both have a `helpers.py` without colliding.

## Packages

numpy is preloaded. Several hundred compiled scientific packages (pandas,
scipy, scikit-learn, statsmodels, polars, ...) are built into the runtime and
install on first import; the **Libraries** catalog in the editor lists every
one with its version. Beyond those, any pure-Python wheel on PyPI works:
import it, or declare it in `packages=[...]` to pin a version
(`packages=['ta==0.11.0']`). Compiled packages outside the runtime
distribution are the one thing that cannot install. The first install needs a
network connection, then the wheels are cached. Works the same in the browser
build and the desktop app: scripts and their dependencies run entirely on
your machine.

## Sharing what you write

**Export as plugin** packages a script as a standalone plugin zip: a manifest
plus a self-contained module embedding your Python source. Send it to anyone
and they install it from **Plugins → Import plugin**.

To distribute through the in-app Plugin Store, submit it to the community tier
by pull request. See
[custom Python indicators](/docs/custom-python-indicators#publish-to-the-community-registry).

## In this section

- **[Custom Python indicators](/docs/custom-python-indicators).** Write your
  first one, and the full drawing surface.
- **[Python API reference](/docs/python-api).** Every builder, the compute
  context, and the `pairlens.ta` function library.
- **[Strategies and backtesting](/docs/strategies-and-backtests).** Entries,
  exits, risk exits, and reading the backtest report.
