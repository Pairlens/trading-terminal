---
title: The AI assistant
description: One assistant for the whole terminal, in the nav rail, a strip under your panes or floating over them, in a window you can drag anywhere. 113 tools over markets, charts, portfolio, scripts, bots, workflows, alerts and workspaces, three personas, and a hard boundary at your risk limits.
group: traders
order: 4
eyebrow: For traders
updated: 22 AUG 2026
readTime: 14 min read
---

The assistant sits outside the content area: an orb, and a line of text that
tells you what it would do here. On a chart it reads **Analyze the chart of
BTC/USDT**. On the workflows page, **Build a workflow**. On Discovery, **Find me
something to trade**. Where that line lives depends on the placement, below.

Click the orb and a chat window opens over the terminal. Click it again and the
window folds back into the orb. <kbd>⌘/</kbd> does the same from the keyboard,
and it works while you are typing in a field, because reaching the assistant
should not cost you the sentence you were in the middle of.

While the window is open, the orb you clicked opens into a ring: dimmer, less
coloured, turning at a fraction of the speed. There is one assistant, and it is
in the window now. What stays behind is the socket it came out of, still the
button that puts it away, and while the window has it the pill stops repeating
the status the window is already showing.

<kbd>⌘J</kbd> is bound to it too. On the desktop app either one is fine; on the
web terminal prefer <kbd>⌘/</kbd>, since <kbd>Ctrl</kbd>+<kbd>J</kbd> is the
Downloads panel in Chrome and Firefox on Windows and Linux and the browser can
take it before the page ever sees it. Both are rebindable in **Settings →
Keyboard**.

## Three placements

Where the orb waits is a setting, in **Settings → Assistant**.

**Sidebar** is the default. The orb docks in the left nav rail, under the charts
icon and above the first divider, so it is a tool among tools and always in the
same place. The rail is 60px wide, so the suggestion cannot sit beside it. It
flies out to the right instead: on hover, on keyboard focus, and unprompted
whenever the assistant is working. That last case is the one that matters.
Tucked into the rail the orb is easy to forget, so a run in progress announces
itself without being asked for. It ships as the default because it is the only
placement that can never land on top of something you were reading.

**Bottom bar** puts the orb back in the bottom-right corner, suggestion readable
beside it, in a strip the terminal reserves underneath the workspace. The rail is
chrome beside your panes; this is chrome below them. Same corner as floating with
none of the overlap: the panes and the status bar shrink by the height of the
strip, so nothing ever ends up under it.

**Floating** is the loudest of the three. The orb and its suggestion sit over the
bottom right of the workspace, always readable, easiest to notice, and the only
placement that covers part of your layout.

Switching moves the orb immediately, no reload. The choice is per device, so a
rail on your desktop does not follow you to the laptop.

## Drag the window anywhere

Grab the chat window's header, anywhere that is not a control, and move it. It
tracks mouse, trackpad and pen, and a fast drag that outruns the cursor keeps
following rather than dropping the window. Where you let go is where it stays,
across reloads and across sessions.

The window is clamped so you can never lose it: enough of the header always
stays on screen to grab again, and if you shrink the terminal or unplug a
display, a window that would be stranded off screen is pulled back in.

Until you drag it, the window is anchored to the orb's placement: in sidebar
mode it hangs off the top bar exactly where a workspace column starts, bottom
right for the other two. That is why it stays put when
you resize. Once it has been moved, a reset button appears in the header next to
the persona menu and puts it back on that anchor.

## The chat window

It is frosted glass, and the frost is heavy. The terminal underneath is blurred
past the point where anything of it survives as shape or text, leaving the
faintest sense of tone, so the chat reads as floating over your workspace
without ever competing with it. Legibility settles that trade: whatever runs
behind the panel, candles, a book, a tape, body text keeps its contrast.

The header repeats the same contextual line the collapsed orb showed, so opening
the window never costs you the context that made you open it. While a run is
going the line becomes the status and shimmers. The persona dropdown and the
eraser that clears the thread sit on the right of it.

On an empty thread the window offers three starters for whatever screen you are
on: on a chart they name the pair, on the workflows page they name a workflow.
Click one to send it. Hover any answer the assistant writes and a copy button
appears under it, which is the fastest way to get a level or a size out of the
chat and into an order ticket.

## Reading a run

A turn can run 28 steps, so the thread shows the work rather than a spinner.

**Thinking is visible.** On a reasoning model the chat shows the reasoning as it
arrives, open while it streams and folded to "Reasoned for 12s" once the answer
starts. One click reopens it. Models that do not reason show nothing here.

**Tool calls collapse into one group.** Thirty calls do not become thirty rows.
While the run works, the group is open and names the call in flight; when it
finishes it folds to "Used 7 tools". Open any call to see the arguments it was
given and the result it got back, which is how you check what the assistant
actually read before it formed an opinion.

**Answers that searched the web carry their sources.** A count sits under the
answer, and opening it lists the pages, same as a
[research report](/docs/research-reports) does. If the assistant tells you a
listing is confirmed, you can see where it read that.

**Code gets a block of its own,** with the language, a copy button, and for
Python an **Open in workbench** action. That writes the script into your library
and opens it in the [indicator workbench](/docs/python-scripts), so an indicator
the assistant wrote is one click from running on live candles.

**Chart screenshots land in the thread.** When the assistant captures the chart,
the image appears in the conversation instead of being announced and lost.

## While it is working

The composer never locks. Type during a run and the message waits its turn: it
appears at the end of the thread marked **Queued** and sends itself the moment
the current answer is finished. One message waits, not a backlog, because a
second one would be answered with context from before an answer you have not
read yet.

The thread follows the answer while you are at the bottom of it, so a run you
are watching never scrolls out from under you. Scroll up and it lets go
immediately, because reading something further back is a decision, not an
accident. A button appears to take you down again, and it tells you which of
the two you are in: **Jump to latest** if the thread simply moved on, or **New
messages** with a dot if something has landed below you since you scrolled
away. Scrolling back down yourself clears it just the same.

Sending overrides all of that. Type a message from anywhere in the thread and
the view returns to the bottom and starts following again, because writing
something is about as clear as it gets that you want to see what happens next.

If a run fails, the error carries a **Retry** rather than making you retype the
prompt, and every finished answer has a regenerate button beside its copy
button.

## One assistant, every conversation

There used to be four AI chats in Pairlens: a co-pilot pane scoped to one pair,
a research pane, and a builder rail on each of the four builder pages. You had
to know which one you were talking to. Now there is one, and it follows you.

Because it is mounted above the routed content, none of the following interrupt
it: navigating to another page, switching pair, minimizing the window. Ask for a
backtest on the workbench, minimize the orb, go read the order book, and the run
is still going when you come back. While it works, the orb reports what it is
doing in place of the suggestion: **Thinking...**, **Using tools...**, **Looking
on the web...**, and it takes a halo, so a collapsed assistant is never a black
box. With the window open the header does that job instead.

The window header carries the controls that act on the thread you are in: the
persona dropdown, a delete button, and the reset button once you have dragged
the window somewhere.

### Your threads

Down the left of the window, under **History**, is every conversation you have
had, newest first, grouped by Today, Yesterday, Previous 7 days and Older. The
plus beside that title starts a new one. Clicking a row opens it exactly as you
left it: the tool activity, the research cards, the order proposals, all of it,
because the whole message is stored and not just its text.

Threads name themselves. The first thing you ask titles the row immediately,
then the assistant is asked in the background for something shorter and better
and swaps it in. Nothing about titling blocks the answer you asked for. Until
the first message lands the row reads **New conversation**.

**Rename a thread in place.** Double-click a row, or right-click it and pick
**Rename**, and the title becomes a field on the row itself with the old name
selected. Enter saves it, Escape puts it back, clicking away saves. Clear the
field entirely and the row goes back to reading **New conversation**.

Starting a new conversation while one is still running stops that run and keeps
what it had already written. The last 50 conversations are kept; past that the
oldest fall off.

Deleting asks first, and deletes the conversation rather than emptying it. Three
ways in: the button in the window header, which takes the thread on screen, the
trash on a row when you hover it, and **Delete conversation** in that row's
right-click menu. None of them is undoable, which is why they all confirm.

### Where they are stored

**On your device, unless you say otherwise.** Conversations live in your
browser's local storage, or in the desktop app's, on the machine you typed them
on. Nothing is uploaded by default, and that default holds whether or not you
have an account.

Signed in, the rail asks you once whether to sync them, with **Turn on sync** and
**Not now**. Either answer retires the banner, and neither is final: the switch
lives in Settings → Cloud Sync as **Assistant conversations**, alongside the
other domains. It is the only one that ships off, because what you ask the
assistant is a fuller record of what you are thinking about than a chart layout
is, and uploading that should be a decision you make rather than one you
discover.

**With sync off**, threads never leave the machine. They do not travel between
your laptop and your phone, signing out does not take them with it, and clearing
your browser data deletes them for good.

**With sync on**, your 25 most recent conversations ride to your account and back
down to your other signed-in devices, whole: the tool activity and cards come
with them, not just the text. Threads are merged per conversation, newest edit
winning, and nothing is deleted from a device just because the account has not
seen it. Very long threads sync with their oldest turns trimmed.

The model sees your messages either way, because it has to answer them. Which
model that is, and who runs it, is your choice on the
[Plugins](/docs/plugin-system) page: Pairlens Intelligence, or your own key
against Groq, OpenAI, Anthropic or OpenRouter.

## What it can do

113 tools. One turn runs up to 28 tool-calling steps, which is enough to read the
chart, pull two more timeframes, write a strategy, backtest it and deploy it
without coming back to you in between.

**Markets.** Candles, tickers, order books, deterministic strategy signals,
multi-timeframe reads and pair comparisons, for any instrument on any connected
venue. Not just the one on screen. It can search instruments it does not know
the id of.

**Charts.** Add and configure indicators, draw horizontal and vertical lines,
trendlines, rectangles, circles and Fibonacci retracements, annotate, mark
entry, stop and target, change chart type and price scale, add a compare
symbol, run replay, and read back what is on the chart right now, including the
levels you drew yourself.

**Account.** Balances and holdings, open orders, your risk guardrails and what
today has already used of them, your trade journal, your watchlists, and which
venues and wallets are connected. It can see that an account exists. It can
never see its keys.

**Scripts and bots.** Read, write and validate Python indicators and
strategies, run backtests through the same engine live bots use, and deploy a
strategy as a bot.

**Automation.** Build and edit workflows, price alerts and alert flows.

**Workspaces.** Read the whole panel catalogue, then build you a saved
workspace out of it: from scratch, from a Workspace Store template, or from the
board you are already looking at. It can file boards in folders, rename and
refile them, and rebuild the board on screen in one step. See
[workspaces](/docs/workspaces).

**Research.** Web search, news, top coins, Fear and Greed, asset overviews, and
`deep_research` for a full sourced report. See
[research reports](/docs/research-reports).

**Navigation.** Take you to any page, pair or workspace, and then act there.

**Trading.** Prepare spot, perpetual and prediction-market orders for you to
confirm, and cancel resting ones.

Full list in the [assistant tool reference](/docs/copilot-tools).

## Personas

Three modes. Switch them from the dropdown in the chat window's header, next to
the clear button, or from **Settings → Assistant**, which is the same setting
written from two places and the only way to reach it on a phone. A change
applies to your next message. Your choice sticks across sessions and syncs to
your other devices when sync is on. It carries over from the old co-pilot, so a
persona you picked back then is still the one you get.

**Mentor.** Explains its reasoning step by step, with analogies. Best when you
are learning why a setup is a setup.

**Balanced.** Clear signals with enough context to judge them. The default.

**Technical.** Data and structure, terse. Short bullets, key levels,
percentages, one sentence per insight. Best when you already know what you are
looking at and want numbers.

The persona changes how it writes, not what it can do. All 113 tools are
available in every mode, and the safety rules below hold identically in all
three.

## It can see what you are looking at

Every mounted surface publishes what it is showing, and the assistant is handed
that description on every turn. A chart reports its pair, venue, timeframe,
indicators and drawing count. So "is this overbought" is a complete question,
and "add an order book to this" has a referent.

Pages report the record they have open, not just their own name. Ask "what am I
looking at" on Workflows and the answer is the workflow: its name, its id, how
many steps it has, and whether the canvas is holding uncommitted edits. On Bots
it is the deployment, with its mode, market and current run status, so an answer
about "this bot" can never come back about the wrong one. Alerts report the rule,
whether it is armed and which pairs it watches. The workbench reports the script
and the file open in the editor. Discovery reports which asset-class section you
are on, because that decides what every pane on it is listing.

That means "tighten the stop on this" needs no follow-up question. The assistant
already has the id, so it reads the record with `get_workflow`, `get_bot`,
`get_alert` or `get_script` and gets on with it.

An instrument board reports the instrument, whichever of the five asset classes
it belongs to, because the address of an instrument already names its class, its
venue and its id. That is the floor: even a board with nothing else mounted can
say "this is AAPL on alpaca" rather than "this is a URL".

A **prediction event** goes further, and it has to. Its board is the one that
has no candle chart on it, because a multi-outcome probability chart replaces
the price chart. So the event desk publishes the event itself: the question, how
many answers it has, when it resolves, the leading runners with their
probabilities, what the whole field costs, and the outcome your order ticket is
currently pointed at. Ask "which of these is worth a look" and the assistant is
reading the same ladder you are, priced the same way. If it wants the rest of a
128-runner field it calls
[`get_prediction_event`](/docs/copilot-tools#prediction-markets).

That publication also decides what "this" means for every market tool. On a
prediction board the outcome your ticket is pointed at is what `get_ticker`,
`get_orderbook` and `place_order` default to, because an event has no book and a
leg does.

Each of those records lives in the address too. `/workflows?workflow=…`,
`/bots?bot=…`, `/notifications?alert=…`, `/indicators?script=…` and
`/?section=…` are written as you click, so a link you send someone opens what
you were looking at, and the back button walks between records instead of
jumping straight off the page. A link to something you have since deleted drops
the dead id rather than showing an empty screen.

Some surfaces publish **actions** as well, and those become tools only while the
surface is mounted. The workspace board is the clearest example: it publishes
`list_workspace_panes`, `add_pane` and `remove_pane`, so "put a depth chart and
a tape next to this" is a request the board itself executes. Leave the board and
the three tools withdraw with it.

The same gating runs the other way for tools that need somewhere to land. The
27 chart tools that change something are only offered while a chart is mounted,
and the three that write into the script editor only while the workbench is
open. The gate is re-read at every step, so if the assistant navigates to a
chart in step 2 it can draw on it in step 3.

## It can point at things

Reading the screen is half of it. The other half is being able to say **there**.

When the assistant does something you were not looking at, it can put a glow on
the thing it changed: a ring in the AI colours, held for six seconds, then gone.
Ask it to add indicators to your chart and the chart pane lights up. Ask to see
the code of an indicator and the script editor does. It is a pointing finger,
not an explanation, so the reply still tells you what changed.

Everything mounted publishes itself as somewhere that can be pointed at, the
same way surfaces publish context and actions. Every pane in every workspace is
covered by one seam in the pane frame, so a pane a plugin adds next month is
pointable the day it ships, with the pane's own translated name. `get_screen`
lists what is currently available, and pointing at something that is not on
screen is refused and handed back with the real list rather than quietly doing
nothing.

Navigation lights the terminal frame by itself. The screen changing under
someone who was reading it is the moment attribution matters most, and the glow
is what separates "the assistant moved me here" from "what did I just click".

The glow is drawn inside the target's own bounds, so a pane cannot bleed over
its neighbours, and it is CSS on the compositor rather than JavaScript, so it
costs nothing on a terminal that is already pushing frames. If you have asked
your OS for reduced motion the ring holds still instead of drifting: which pane
was meant is information, not decoration.

## Order proposals

The assistant cannot place an order. `place_order` prepares one and renders a
card in the chat with the pair, side, size and limit price, its reasoning above
it, and paper preselected. Nothing is sent until you confirm, with the same
press-and-hold or click gesture as the order ticket.

Ticking **Don't ask again** turns that into a standing grant, either for paper
trades generally or for live trades on that one exchange. Grants are listed and
revocable in **Settings → Risk Management**.

Auto-approval skips the card. It does not skip your
[risk guardrails](/docs/risk-guardrails), which are enforced on the order path
itself. This is the boundary the whole design rests on: a language model can be
wrong, and can be manipulated through the data it reads. It should not be the
thing standing between you and a blown account.

The same shape holds everywhere it builds something that could cost you money.
A bot it creates is always paper mode and switched off, and it has no tool that
can arm one. Workflows and alert flows land as uncommitted drafts in the builder
for you to review and commit. Simple price alerts are the one exception: they
arm on creation, because an alert nobody armed is not an alert, and the
assistant tells you so when it makes one.

When a decision is genuinely yours, it asks with buttons rather than a
paragraph. Those question cards end the model's turn until you tap an answer.

## What it knows about you

It sees market data your terminal already has, the surfaces you have open, and
whatever your prompt includes. Chat history is stored locally by default and
synced when you are signed in. It never receives your API keys or private keys,
because those live in the OS keychain or your encrypted vault and are only ever
read by the connector signing a request.

## On a phone

The [mobile terminal](/docs/mobile-terminal) has no room for a floating window,
so the assistant is one of the five destinations instead of a dock. Same
conversation, same tools, same confirm cards. Placement and window dragging are
desktop-shell settings and do nothing here: on a phone the assistant is a tab
whatever they say. There is no window header either, so the persona is set in
**Settings → Assistant**, which the phone reaches like every other section.

## Choosing a model

The assistant runs on any `ai:inference` provider. Bring your own key from
Groq, OpenAI, Anthropic or OpenRouter, which is free and always will be, or
subscribe to hosted Pairlens Intelligence. The agentic loop runs on your machine
either way: when you use a hosted model the App Server is only an inference
proxy, forwarding a request and streaming a response back. It decides nothing
and never sees your exchange credentials. See
[AI providers](/docs/ai-providers).

## Related

- [Assistant tool reference](/docs/copilot-tools) for all 113 tools
- [Research reports](/docs/research-reports) for the long-form sourced write-up
- [AI providers](/docs/ai-providers) for keys, plans, and credits
- [Risk guardrails](/docs/risk-guardrails) for the limits the AI cannot move
