---
title: NFT collections
description: 'Trade NFT collections as markets instead of galleries. Listings are the ask ladder, collection offers aggregate into a real bid ladder, sales are the tape, and the ticket names the ordinary order behind each intent: sweep the floor, bid the collection, list a token you own, hit the best standing offer. Reads cover six chains through OpenSea with a keyless CoinGecko fallback, orders are signed on Ethereum and Base, and every one of them goes down the same guarded path as a CEX fill.'
group: traders
parent: trading
order: 10
eyebrow: For traders
updated: 22 AUG 2026
readTime: 13 min read
---

Every NFT site draws a collection as a wall of pictures with a buy button under
each one. That layout hides the only two numbers a trader needs: how much is
actually offered above the floor, and how much is actually bid below it.

Pairlens draws it as a book. Listings are the ask ladder. Collection offers
aggregate into a bid ladder. Sales are the tape. From there an NFT trade is an
ordinary order, so the chart, the depth vocabulary, the guarded ticket and your
risk limits all work unchanged.

## The pair is the collection

A collection's address is `/nft/{chain}/{contract}`. Pudgy Penguins on Ethereum
is
`/nft/ethereum/0xbd3531da5cf5857e7cfaa92426877b022e612cf8`.

Identity is the chain plus the contract, and nothing else. The same art
deployed to Ethereum and to Base is two collections with two floors, which is
why the chain is part of the address the way it is for an
[on-chain token](/docs/dex-trading). The marketplace is not part of it. OpenSea
and Blur are two tapes for one asset, and which one fills your order is a
routing decision made at order time, exactly as a swap picks a pool.

One token is not an instrument either. You buy token ids out of the ladder,
the way you take specific lots out of a book.

## Chains

Reads and orders do not cover the same set, and the terminal says so rather
than implying parity.

| Chain    | Read | Sign an order |
| -------- | ---- | ------------- |
| Ethereum | Yes  | Yes           |
| Base     | Yes  | Yes           |
| Polygon  | Yes  | No            |
| Arbitrum | Yes  | No            |
| Optimism | Yes  | No            |
| Solana   | Yes  | No            |

Signing is deliberately the narrower list. OpenSea validates the API key before
it validates the chain, so a route that answers 401 for a nonsense chain proves
nothing about which chains actually accept an order, and a ticket that cannot
fill is worse than one that says it will not try. Solana is refused by name at
order time: OpenSea indexes it, but its Solana orders do not settle through
Seaport, so there is no transaction this connector could build. Solana NFTs are
read-only here.

Floors are quoted in the chain's own settlement currency, never converted for
you: ETH on Ethereum, Base, Arbitrum and Optimism, POL on Polygon, SOL on
Solana. USD rides alongside wherever the provider published one, and an absent
USD figure means the provider did not say, not zero.

## Two providers, and what each one can answer

**OpenSea** is the primary. One plugin serves both halves of the asset class,
which is why it was chosen: it is the only NFT venue that answers market data
and accepts a signed order over an API a browser can call. It needs a free API
key that you provision yourself, and it works in the hosted web terminal, on
desktop, and behind the desktop CSP with no proxy anywhere in the path.

**CoinGecko NFT** is the keyless fallback, and it exists for exactly one
moment: a fresh install, nothing configured, someone opens a collection. It
answers floor price, 24h volume, market cap, supply and holder count for any
collection it indexes, on every chain including Solana, with no key at all.
That is enough to make a cold board real.

| Read                        | OpenSea | CoinGecko |
| --------------------------- | ------- | --------- |
| Collection floor and volume | Yes     | Yes       |
| Rankings across a chain     | Yes     | No        |
| Listings, offers, the book  | Yes     | No        |
| Sales tape                  | Yes     | No        |
| Items and traits            | Yes     | No        |
| Price history               | Yes     | No        |
| Orders                      | Yes     | No        |

CoinGecko publishes rankings and floor history behind its Analyst tier, so a
keyless call is a verified 401 rather than a slow answer. The rest it simply
does not have.

What it never does is answer with an empty list. Every read it cannot serve
throws with a message naming what to do about it, because null is an answer: it
would tell the board this collection has no listings, and the board would
faithfully draw an empty ladder over a collection with two hundred of them.

## Adding your OpenSea key

OpenSea issues API keys free and instantly, and the key is plugin config rather
than a trading credential. Paste it into the OpenSea plugin's settings, the
same way the [Helius Solana endpoint](/docs/dex-trading) takes one, and every
NFT pane in the terminal follows it.

The key authenticates reads and posts an order to OpenSea's book. It cannot
move an asset. The secret that can is your wallet key, and that is a separate
thing entirely.

## Adding a wallet

**Accounts → Connect Account → Crypto Wallet**, with an Ethereum key. It is the
same entry the [EVM DEX chains](/docs/dex-trading) and
[Polymarket](/docs/prediction-markets) use, because one EVM private key
controls the same address everywhere on EVM.

Buying an NFT is an on-chain transaction and listing one is an EIP-712
signature, so the key that signs is yours: it lives in the OS keychain on
desktop or in your encrypted vault in a browser, and never on a Pairlens
server. The connector is never handed the key, only an id-scoped accessor the
terminal refuses for any other wallet id.

Read panes do not need it. The holdings pane reads a public address, so it
works with the vault sealed. The ticket does not, and says so rather than
failing at submit.

## Finding a collection

The **NFT** tab on Discovery is chain first, then collection, the same shape
the [DEX and prediction boards](/docs/market-discovery) use so you are not
relearning the furniture between tabs.

**Chains** is the rail down the left, and it is not a filter over one result
set: NFT data is chain-scoped at the provider, so picking Base re-asks for
rankings, movers, mints and the tape. The rows come off the installed manifests
rather than a fetch, so the rail is complete on the first frame.

**NFT Market** is the strip across the top: 24h volume, market cap, sales and
traders, with a bar showing which marketplaces are carrying the flow. Volume
moving from OpenSea to Blur is the same market with different fee and royalty
economics behind every fill.

**Collections** is the rankings table, and its columns answer the question a
shopping grid cannot: is this floor real. Floor and its 24h move say where the
market is, volume and sales say whether anyone is trading there, and listed
percent says how much supply is queued to hit that floor. Two percent listed is
a floor with conviction behind it. Thirty percent is an exit queue wearing a
price tag, and on a wall of pictures the two look identical.

Sorting is split, and the split is the provider's. Five axes (volume, floor
change, sales, market cap, newest) are rankings OpenSea serves, so picking one
re-asks for a different set of fifty collections. Everything else re-orders the
fifty already on screen and never leaves your machine. The header says which
kind you just used, because sorting one page of the top fifty by floor and
calling it "the highest floors" is a wrong answer stated confidently.

The right rail carries **Floor Movers**, **New & Minting** for collections
deployed recently that are seeing volume, and **Whale Sales**, the market-wide
tape above a size threshold you set. The threshold is the whole point of that
pane: an unfiltered NFT tape is thousands of sub-hundred-dollar prints an hour
and reads as static, while the same feed above fifty thousand dollars is a
short list of decisions somebody thought about. The floor is sent to the
provider rather than applied locally, so you never page fifty dust prints to
show none of them.

**NFT Flow** is the second Discovery preset, the tape at full width with movers
and rankings beside it.

## The collection board

Opening a collection loads **NFT Desk**, the default pair layout for the class.
Middle column: the collection header, the chart, and a tabbed cell holding the
sales tape, the items grid, the trait breakdown and your holdings. Beside it, the
ladder over the ticket. On the right, listings over offers.

**Collection** is the identity line. The floor is the one large number, because
it is the only price on the board you can act on without reading anything else.
Seven stats follow it in the order they change a decision, listed share among
them.

**Ladder** is the book, both sides on one price axis with cumulative depth
behind the rows, exactly as the [CEX order book](/docs/order-book) draws it.
The two sides are not symmetric and the pane does not pretend they are. An ask
is one token, so every ask rung names the token id and its rarity rank:
aggregating four listings into "4 at 12.1 ETH" would hide which four you are
buying. A bid genuinely aggregates, because a collection offer for any 5 tokens
at 11.8 is five units of executable size at one price. That asymmetry is why an
NFT bid side is a real depth curve and the ask side is a queue.

Both sides arrive in one read and the pane prints when. Fetching them
separately lets a withdrawn bid and a stale ask render a crossed book that
never existed, and a crossed book reads as free money.

**Listings** is the same ask side flat, cheapest first, with thumbnails, ranks,
the marketplace and the expiry. A listing that lapses in twenty minutes is not
depth a sweep can count on.

**Offers** is the bid side with the column people miss: scope. Three offers at
one price mean different things depending on whether any token takes them, only
a Gold Fur does, or only #4821 does. Aggregating those into one depth number
would be arithmetic across three instruments, so the scope rides in the row.

**Sales** is the tape for this collection, newest first, in the settlement
currency with USD under it, and it names both counterparties. On a thin
collection the same two wallets printing back and forth is the volume, and a
tape that hides the counterparties hides the wash.

**Items** is the one pane allowed to look like a gallery, because picking a
specific token is a real job: a rank-40 and a rank-4000 at the same ask are not
the same trade. Unlisted tokens say "not for sale" rather than showing a blank,
because that is different from "we did not read a price".

**Traits** is where the pricing actually happens on any collection past its
first month. The collection floor is a headline; the spread between the cheapest
Gold Fur and the cheapest anything is the market. Right now the pane shows what
OpenSea publishes, which is every trait value with its count and its rarity
share. A floor per trait is one filtered listings read per value, and a
mid-size collection has hundreds of them, so it would cost more of the hourly
budget than the rest of the board put together. The field is in the data model
and the column appears the day a provider publishes it.

**My Items** marks your holdings against the best bid, not the floor. Every NFT
portfolio on the internet values a holding at the collection floor, which is a
price somebody is asking: on an illiquid collection it can sit two or three
times above the best standing offer for weeks. The mark here is a price you
could go and realise. Cost basis stays optional, and no basis means no P/L row
rather than a zero, because inventing one from the token's last sale attributes
somebody else's trade to your wallet.

**Collector** is the second preset for the same market, read the way someone
picking individual tokens reads it: the items grid at full width, the traits
in a column of their own, and the ticket still there because the point is still
to trade.

## What the chart is drawing

There is no bespoke NFT chart. A collection's price over time is a series like
any other, so the connector serves candles and the boards mount the ordinary
[chart panel](/docs/chart-panel), with its drawings, indicators and timeframe
control intact.

Two different numbers can fill that chart, and the series says which one it is.

**A floor series.** OpenSea publishes a tracked floor at collection level, down
to one-minute resolution, on a free key and over open CORS. That is rarer than
it sounds: it is the only browser-callable per-collection floor history there
is, and it is why the intraday steps (1m, 5m, 15m, 1h, 1d) exist for this asset
class at all.

**A bucketed sales series.** Where a floor is not tracked, candles are bucketed
from the sales tape by the connector, and an OHLC of fills is an average of what
cleared. It is not the floor. A collection can print at 14 ETH all afternoon
with the floor sitting at 12, and a chart that quietly swapped one number for
the other would be lying about what it drew.

Every series carries its basis so the chart can say which it is. Read the
timeframes off the provider that answered, not off the asset class: the
intraday steps are OpenSea's, and a board running on the keyless fallback has
no history at all rather than a coarse one.

Bucketing happens once, in the connector, so a stat and a chart reading the
same tape cannot disagree about the same day.

## The ticket

Four things people do on an NFT market, said in the terminal's own order
vocabulary. The ticket prints the mapping under the tabs, because someone who
knows what a market buy is should not have to guess what "sweep" does to their
money.

| Intent         | The order it really is | What it does                          |
| -------------- | ---------------------- | ------------------------------------- |
| **Sweep N**    | Market buy, size N     | Takes the N cheapest listings         |
| **Make offer** | Limit buy at P, size N | A collection offer for any N tokens   |
| **List item**  | Limit sell at P        | Lists one token you own               |
| **Accept bid** | Market sell            | Hits the best standing collection bid |

Sizes are item counts, and they are whole numbers. An NFT is indivisible, so a
fractional size is a bug rather than a rounding artefact.

A sweep is priced off the ladder, not off the floor. Buying five items when the
floor is one listing deep costs the sum of five asks, and quoting five times
the floor would understate the trade by whatever shape the book is in. The
summary shows the realised average next to the total for the same reason.

Royalties are paid by default. Creator fees come back from OpenSea in basis
points and are carried into the order, and the connector caps the total
marketplace-plus-creator fee an order will accept rather than signing whatever
a response asks for.

## Guardrails still apply

Every NFT order goes out through the same guarded `placeOrder` as a spot fill
or a swap. The vault gate, the terminal lock, the hold-to-confirm submit
gesture and your [risk guardrails](/docs/risk-guardrails) all live inside that
path, and a pane reaching a connector directly would be outside every one of
them. Position caps, trade caps and loss caps do not care that the thing being
bought is a picture.

Order placement is marked as having side effects, so a failed placement is
never retried against a fallback provider. A thrown error does not prove the
order was rejected, and a buy that in fact landed must not go out twice.

## Refresh rates and the request budget

NFT reads are snapshots on a timer rather than a stream, and the cadences are
set by what actually moves:

- The **ladder** and the **tape** refresh every 20 seconds.
- **Collection state** (floor, volume, supply) every minute.
- **Rankings** every 5 minutes.
- **Items** and **traits** every 10 minutes.

Every query is gated on the pane being open, so a tab you are not looking at
costs nothing. That matters because a free OpenSea key allows on the order of
600 reads an hour and one board can have eight panes on one collection. Requests
are paced through a shared sliding-window limiter sized under that ceiling, and
the budget is process-wide: two boards on two collections spend one budget, not
two.

A rate limit is reported as a rate limit, all the way to the pane. It is not an
empty collection, and it retries on the provider's own advice.

## On a phone

NFT routes are desktop only for now. Open `/nft/...` on a phone and the
[mobile terminal](/docs/mobile-terminal) redirects to your focused market with
a toast saying so.

That is a deliberate answer rather than an oversight. The class is the ladder,
the trait breakdown and the sweep ticket, and half of that on a 402px screen is
worse than an honest redirect. A desktop browser dragged under 768px keeps its
URL, so widening back restores the exact board.

## Turning the class off

NFTs ship as a plugin family: `pairlens-nfts` for the panes and workspaces,
`opensea-nft-connector` and `coingecko-nft-provider` for the data and the
orders. Uninstall those three from the Plugin Store and the asset class leaves
with them, including its Discovery tab, its two pair layouts and its Workspace
Store entries. A deployment that never wants to ship it excludes the `nfts`
family at build time. See [plugins for traders](/docs/plugins-for-traders).

## Next

- [Place an order](/docs/place-an-order) for the rest of the ticket
- [Risk guardrails](/docs/risk-guardrails) for the limits every order is checked against
- [DEX and wallets](/docs/dex-trading) for where the wallet key comes from
- [Panels](/docs/panels) for everything else you can put beside the chart
