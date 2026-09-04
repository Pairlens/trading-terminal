---
title: The AI assistant
description: An assistant that can see your screen, read any market, draw on your charts, write Python, research an asset with sources, and draft trades you approve. What it does, and the one thing it can never do.
group: traders
order: 4
eyebrow: For traders
updated: 4 SEP 2026
readTime: 10 min read
---

Most "AI in a trading app" is a chatbot in a sidebar that cannot see anything you
are looking at. This one can. It reads your chart, your panels, your positions
and your risk limits, and it can act: add an indicator, draw a level, set an
alert, write a strategy, build you a workspace, or draft an order for you to
approve.

It can never place a trade on its own, and it can never move your risk limits.
More on that boundary below, because it is the part worth trusting.

## Opening it

An orb sits in the terminal with a line of text that changes with the page: on a
chart it reads **Analyze the chart of BTC/USDT**, on the workflows page **Build a
workflow**, on Discovery **Find me something to trade**.

Click it, or press <kbd>⌘/</kbd>, and a chat window opens over the terminal. The
shortcut works even while you are typing in a field, because reaching the
assistant should not cost you the sentence you were in the middle of.

<kbd>⌘J</kbd> works too, though on the web terminal prefer <kbd>⌘/</kbd>, since
Chrome and Firefox on Windows and Linux take Ctrl+J for their Downloads panel
before the page ever sees it. Both are rebindable in **Settings → Keyboard**.

## Where it sits

Three placements, in **Settings → Assistant**:

**Sidebar** is the default. The orb docks in the left nav rail, so it is a tool
among tools and never covers anything you are reading.

**Bottom bar** puts it in the bottom-right corner with the suggestion readable
beside it, in a strip the terminal reserves under your panels. Same corner as
floating, none of the overlap.

**Floating** is the loudest: the orb and its suggestion sit over your workspace,
always readable, and the only placement that covers part of your layout.

The chat window itself drags anywhere by its header, and stays where you drop it
across reloads. It is clamped so you can never lose it off-screen, and a reset
button appears once you have moved it.

## Good first questions

If you are not sure what to ask it, these all work as typed:

- "What is this chart telling me?"
- "Explain what the order book is showing right now"
- "Is Bitcoin overbought on the 4-hour?"
- "Add a 50 and 200 EMA and tell me if they have crossed"
- "Research SOL"
- "Set an alert if ETH breaks 3,200"
- "Mark my entry, stop and target on this chart"
- "Build me a workspace for trading perpetuals"
- "What did I trade this week, and how did it go?"

On an empty conversation the window offers three starters for whatever screen you
are on, which is the fastest way to find out what it can do here.

## Reading a run

One question can trigger a lot of work, so the chat shows you what it did rather
than a spinner.

**Thinking is visible.** On a reasoning model you see the reasoning as it
arrives, folded to "Reasoned for 12s" once the answer starts.

**Tool calls collapse into one group.** Open any of them to see the arguments it
was given and the result it got back, which is how you check what the assistant
actually read before forming an opinion. This matters: an AI answer you cannot
audit is an opinion, and an AI answer with its inputs visible is a workflow.

**Answers that searched the web carry their sources.** If it tells you a listing
is confirmed, you can see where it read that.

**Code gets its own block**, with a copy button and, for Python, an **Open in
workbench** action that puts the script in your library ready to run.

**Chart screenshots land in the conversation** rather than being described.

Hover any answer for a copy button, which is the fastest way to get a level out
of the chat and into an order ticket. Failed runs carry a **Retry** rather than
making you retype, and every answer has a regenerate button.

## While it is working

The composer never locks. Type during a run and your message waits its turn,
marked **Queued**, and sends itself when the current answer finishes. One message
waits rather than a backlog, because a second would be answered with context from
before an answer you have not read.

The thread follows the answer while you are at the bottom, and lets go the moment
you scroll up, because reading something further back is a decision rather than
an accident. A button takes you back down and tells you which case you are in:
**Jump to latest**, or **New messages** if something landed while you were away.

Minimizing does not stop anything. The orb reports what it is doing in place of
the suggestion (**Thinking...**, **Using tools...**, **Looking on the web...**),
so a collapsed assistant is never a black box. Navigating away does not stop it
either: ask for a backtest, go read the order book, and the run is still going
when you come back. Switching to another conversation in History is the same:
the answer keeps writing in the background, and it is there when you return.

## Your conversations

Down the left of the window, **History** holds every conversation, newest first.
Clicking a row opens it exactly as you left it, tool activity and cards included.
Switching rows does not stop a run that is still writing: come back and the rest
of the answer is there, the same way minimizing keeps it going. Deleting a
conversation is the one way a live run on that thread is aborted.

Threads name themselves from your first message, then get a better title in the
background. Double-click a row to rename it. Deleting asks first and is not
undoable. The last 50 are kept.

### Where they are stored

**On your device, unless you say otherwise.** Conversations live in local storage
on the machine you typed them on. Nothing is uploaded by default, whether or not
you have an account.

Signed in, the sidebar asks once whether to sync them. Either answer retires the
question, and the switch lives in **Settings → Cloud Sync** afterwards.

This is the only sync domain that ships off, and the reason is worth stating:
what you ask an assistant is a fuller record of what you are thinking about than
a chart layout is. Uploading that should be a decision you make rather than one
you discover.

With sync off, threads never leave the machine, and clearing your browser data
deletes them for good. With sync on, your 25 most recent conversations travel
between your signed-in devices whole.

The model sees your messages either way, because it has to answer them. Which
model, and who runs it, is your choice. See [AI providers](/docs/ai-providers).

## What it can do

113 tools, and one turn can chain up to 28 of them: enough to read your chart,
pull two more timeframes, write a strategy, backtest it and deploy it without
coming back to you in between.

**Markets.** Candles, prices, order books, signals, multi-timeframe reads and
pair comparisons, for any instrument on any connected exchange, not just the one
on screen. It can search for instruments it does not know.

**Charts.** Add and configure indicators, draw lines, trendlines, rectangles and
Fibonacci levels, mark entry, stop and target, change chart type and scale, add a
comparison symbol, run replay, and read back what is on the chart right now,
including the levels you drew yourself.

**Your account.** Balances, open orders, your risk limits and what today has used
of them, your trade journal, your watchlists, and which venues are connected. It
can see that an account exists. It can never see its keys.

**Scripts and bots.** Read, write and validate Python indicators and strategies,
run backtests through the same engine live bots use, and deploy a strategy as a
bot.

**Automation.** Build and edit workflows, price alerts and alert flows.

**Workspaces.** Read the whole panel catalogue and build you a saved layout out
of it, from scratch, from a template, or from the board you are looking at. See
[workspaces](/docs/workspaces).

**Research.** Web search, news, top coins, market sentiment, and a full sourced
[research report](/docs/research-reports).

**Navigation.** Take you to any page, pair or workspace, and then act there.

**Trading.** Prepare orders for you to confirm, and cancel resting ones.

Full list in the [assistant tool reference](/docs/copilot-tools).

## Three personas

Switch from the dropdown in the chat header, or **Settings → Assistant**.

**Mentor.** Explains its reasoning step by step, with analogies. Best when you
are learning why a setup is a setup.

**Balanced.** Clear signals with enough context to judge them. The default.

**Technical.** Data and structure, terse. Key levels, percentages, one sentence
per point. Best when you already know what you are looking at.

The persona changes how it writes, not what it can do. All the tools and all the
safety rules are identical in each.

## It can see what you are looking at

Every panel on screen publishes what it is showing, and the assistant is handed
that on every turn. A chart reports its pair, exchange, timeframe, indicators and
drawings. So "is this overbought?" is a complete question, and "add an order book
to this" has something to refer to.

Pages report the record they have open, not just their own name. On Workflows the
answer to "what am I looking at" is the workflow, with its name and steps. On
Bots it is the deployment, with its mode and status, so an answer about "this
bot" can never come back about the wrong one.

That means "tighten the stop on this" needs no follow-up question.

Prediction events go further, publishing the whole field: the question, every
answer with its probability, when it resolves, and which outcome your ticket is
pointed at. Ask "which of these is worth a look?" and the assistant is reading
the same ladder you are.

## It can point at things

When the assistant changes something you were not watching, it puts a brief glow
on it: ask it to add indicators and the chart lights up; ask to see an
indicator's code and the editor does.

It is a pointing finger rather than an explanation, so the reply still tells you
what changed. Navigation lights the frame by itself, because the screen changing
under someone who was reading it is exactly the moment it matters whether the
assistant moved you or you clicked something.

## Order proposals, and the boundary

**The assistant cannot place an order.** What it can do is prepare one: a card in
the chat with the pair, side, size and price, its reasoning above it, and paper
preselected. Nothing is sent until you confirm, with the same press-and-hold
gesture as the order ticket.

Ticking **Don't ask again** turns that into a standing grant, either for practice
trades generally or for live trades on one exchange. Grants are listed and
revocable in **Settings → Risk Management**.

Auto-approval skips the card. **It does not skip your
[risk guardrails](/docs/risk-guardrails)**, which are enforced by the code that
sends orders, below the AI entirely.

This is the boundary the whole design rests on. A language model can be wrong. It
can be argued into things. It can be manipulated by text it reads while
researching, because it cannot always tell a web page's instructions from yours.
It should not be the thing standing between you and a blown account.

The same shape holds anywhere it builds something that could cost you money. A
bot it creates is always in practice mode and switched off, and it has no tool
that can arm one. Workflows and alert flows land as drafts for you to review.
Simple price alerts are the one exception, because an alert nobody armed is not
an alert, and it tells you when it makes one.

When a decision is genuinely yours, it asks with buttons rather than a paragraph,
and waits.

## What it knows about you

It sees market data your terminal already has, the panels you have open, and
whatever your prompt includes. Chat history is local by default and synced only
if you turn that on.

**It never receives your API keys or private keys.** Those live in your OS
keychain or encrypted vault and are read only by the connector signing a request.
There is no path from the assistant to them.

## On a phone

The [mobile terminal](/docs/mobile-terminal) has no room for a floating window,
so the assistant is one of the five tabs instead. Same conversation, same tools,
same confirmation cards.

## Choosing a model

The assistant runs on whichever provider you pick. Bring your own key from Groq,
OpenAI, DeepSeek, Anthropic or OpenRouter, which is free and always will be, or subscribe
to hosted Pairlens Intelligence.

The reasoning loop runs on your machine either way. With a hosted model the
Pairlens server is only a relay, forwarding a request and streaming a response
back. It decides nothing and never sees your exchange credentials. See
[AI providers](/docs/ai-providers).

## Related

- [Assistant tool reference](/docs/copilot-tools) for all 113 tools
- [Research reports](/docs/research-reports) for the long-form sourced write-up
- [AI providers](/docs/ai-providers) for keys, plans and credits
- [Risk guardrails](/docs/risk-guardrails) for the limits the AI cannot move
