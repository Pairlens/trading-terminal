---
title: NFT collections
description: 'Floor price, listings, offers and traits explained, then how Pairlens turns a collection into a real order book: an ask ladder, a bid ladder, a sales tape and a ticket with four intents.'
group: traders
parent: trading
order: 10
eyebrow: For traders
updated: 22 AUG 2026
readTime: 11 min read
---

## NFTs as a market

An NFT is a token that proves ownership of one specific item. A **collection** is
a set of them minted together, usually ten thousand pictures that differ by
randomly assigned traits.

The reason a trader cares is that a collection behaves like a market with a
handful of terms worth knowing:

**The floor** is the cheapest one currently for sale. It is the headline number
everyone quotes, and it is an _asking_ price rather than a bid. Nobody has agreed
to pay it.

**Listings** are the items offered for sale, each at its own price. Sorted
cheapest first, they are exactly an ask ladder: floor, next cheapest, next.

**Offers** are standing bids. A **collection offer** says "I will pay 11.8 ETH
for any token in this set", which is a real bid anyone holding one can hit. That
is the number that tells you what you could actually sell for today.

**The gap between them is enormous compared to normal markets.** A collection can
have a 12 ETH floor and a 9 ETH best offer. On a stock that spread would be a
scandal; here it is Tuesday. This is the single most important fact about NFT
trading, and it is why valuing a holding at the floor flatters it.

**Traits** are the attributes that make one token rarer than another. Past a
collection's first month, the real market is not the collection floor at all, it
is the spread between the cheapest Gold Fur and the cheapest anything.

**Royalties** are a percentage that goes to the creator on each sale, on top of
the marketplace's own fee. They are real money and they come out of your return.

**Liquidity is thin.** Selling can take days at your price or minutes at somebody
else's. Size accordingly.

## What Pairlens does differently

Every NFT site draws a collection as a wall of pictures with a buy button under
each. That layout hides the two numbers a trader actually needs: how much is
offered above the floor, and how much is bid below it.

Pairlens draws it as a book. Listings are the ask ladder. Collection offers
aggregate into a bid ladder. Sales are the tape. From there an NFT trade is an
ordinary order, so the chart, the guarded ticket and your risk limits all work
unchanged.

## The pair is the collection

A collection's address is `/nft/{chain}/{contract}`, and its identity is the
chain plus the contract, nothing else. The same art deployed to Ethereum and to
Base is two collections with two floors.

The marketplace is not part of the identity. OpenSea and Blur are two venues for
one asset, and which fills your order is decided at order time.

One token is not an instrument either. You buy specific token ids out of the
ladder, the way you take specific lots out of a book.

## Chains

Reading and trading do not cover the same set, and the terminal says so rather
than implying parity.

| Chain    | Read | Sign an order |
| -------- | ---- | ------------- |
| Ethereum | Yes  | Yes           |
| Base     | Yes  | Yes           |
| Polygon  | Yes  | No            |
| Arbitrum | Yes  | No            |
| Optimism | Yes  | No            |
| Solana   | Yes  | No            |

Solana NFTs are read-only here: they are indexed, but their orders settle through
a different system entirely, so there is no transaction this connector could
build. A ticket that cannot fill is worse than one that says it will not try.

Floors are quoted in the chain's own currency, never converted for you: ETH,
POL on Polygon, SOL on Solana. A dollar figure rides alongside where the provider
published one, and an absent one means the provider did not say, not zero.

## Two data sources

**OpenSea** is the primary, and it is the only NFT venue that answers both market
data and signed orders over an API a browser can call. It needs a free API key
you provision yourself.

**CoinGecko NFT** is the keyless fallback, and it exists for exactly one moment: a
fresh install, nothing configured, someone opens a collection. It answers floor
price, volume, market cap, supply and holder count on every chain, with no key.
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

What the fallback never does is answer with an empty list. A read it cannot serve
says so, because returning nothing would tell the board this collection has no
listings, and the board would faithfully draw an empty ladder over a collection
with two hundred of them.

## Adding your OpenSea key

OpenSea issues API keys free and instantly. Paste one into the OpenSea plugin's
settings and every NFT panel follows it.

That key authenticates reads and posts orders to OpenSea's book. **It cannot move
an asset.** The secret that can is your wallet key, which is a separate thing
entirely.

## Adding a wallet

**Accounts → Connect Account → Crypto Wallet**, with an Ethereum key. Same entry
the [on-chain chains](/docs/dex-trading) use, because one key controls the same
address everywhere on EVM.

Buying is an on-chain transaction and listing is a signature, so the key that
signs is yours: OS keychain on desktop, encrypted vault in a browser, never a
Pairlens server.

Read panels do not need it. Your holdings panel reads a public address, so it
works with the vault locked. The ticket does not, and says so rather than failing
at submit.

## Finding a collection

The **NFT** Discovery tab goes chain first, then collection.

**Chains** is the rail down the left. Picking one genuinely re-asks for that
chain's rankings, movers, mints and tape, because NFT data is chain-scoped at the
source.

**NFT Market** is the strip across the top: 24-hour volume, market cap, sales and
traders, with a bar showing which marketplaces are carrying the flow. Volume
moving from OpenSea to Blur is the same market with different fee and royalty
economics behind every fill.

**Collections** is the rankings table, and its columns answer the question a
shopping grid cannot: **is this floor real?** Floor and its move say where the
market is, volume and sales say whether anyone is trading there, and **listed
percent** says how much supply is queued to hit that floor.

Two percent listed is a floor with conviction behind it. Thirty percent is an
exit queue wearing a price tag. On a wall of pictures those two look identical.

Sorting is split between two kinds, and the header tells you which you just used.
Five options genuinely re-ask the source for a different fifty collections;
everything else re-orders the fifty already on screen. Sorting one page of the
top fifty by floor and calling it "the highest floors" would be a wrong answer
stated confidently.

The right rail carries **Floor Movers**, **New & Minting**, and **Whale Sales**,
the market-wide tape above a size threshold you set. That threshold is the whole
point of the panel: an unfiltered NFT tape is thousands of sub-hundred-dollar
prints an hour and reads as static, while the same feed above $50,000 is a short
list of decisions somebody thought about.

## The collection board

Opening a collection loads **NFT Desk**.

**Collection** is the identity line. The floor is the one large number, because
it is the only price on the board you can act on without reading anything else.

**Ladder** is the book, both sides on one price axis, exactly as the
[order book](/docs/order-book) draws it.

The two sides are not symmetric and the panel does not pretend otherwise. An ask
is one specific token, so every ask names the token id and its rarity rank:
merging four listings into "4 at 12.1 ETH" would hide which four you are buying.
A bid genuinely aggregates, because a collection offer for any 5 tokens at 11.8
is five units of real size at one price.

That asymmetry is why an NFT bid side is a real depth curve and the ask side is a
queue.

**Listings** is the ask side flat, cheapest first, with thumbnails, ranks, the
marketplace and the expiry. A listing that lapses in twenty minutes is not depth
a sweep can count on.

**Offers** is the bid side with the column people miss: **scope**. Three offers at
one price mean different things depending on whether any token takes them, only a
Gold Fur does, or only #4821 does. Merging those into one depth number would be
adding up three different instruments.

**Sales** is the tape for this collection, newest first, and it names both
counterparties. On a thin collection the same two wallets printing back and forth
_is_ the volume, and a tape that hides the counterparties hides the wash trading.

**Items** is the one panel allowed to look like a gallery, because picking a
specific token is a real job: a rank-40 and a rank-4000 at the same asking price
are not the same trade. Unlisted tokens say "not for sale" rather than showing a
blank, because that is different from "we did not read a price".

**Traits** shows every trait value with its count and rarity share. A floor per
trait would need one query per value and a mid-size collection has hundreds, so
that column appears the day a source publishes it directly.

**My Items** marks your holdings **against the best bid, not the floor**. Every
NFT portfolio tracker on the internet values holdings at the floor, which is a
price somebody is asking; on an illiquid collection that sits two or three times
above the best real offer for weeks. The mark here is a price you could go and
realise today.

Cost basis stays optional, and no basis means no profit row rather than a zero,
because inventing one from the token's last sale attributes somebody else's trade
to your wallet.

**Collector** is a second layout for the same market, read the way somebody
picking individual tokens reads it: the items grid at full width with traits
beside it.

## What the chart is drawing

There is no bespoke NFT chart. A collection's price over time is a series like
any other, so the boards mount the ordinary [chart panel](/docs/chart-panel) with
its drawings and indicators intact.

Two different numbers can fill that chart, and the chart says which:

**A floor series**, where OpenSea tracks the floor down to the minute. This is
rarer than it sounds and it is why intraday timeframes exist for this asset class
at all.

**A bucketed sales series**, where a floor is not tracked. Candles built from
actual sales are an average of what cleared, which is **not** the floor. A
collection can print at 14 ETH all afternoon with the floor sitting at 12, and a
chart that quietly swapped one for the other would be lying about what it drew.

## The ticket

Four things people do on an NFT market, said in ordinary order language. The
ticket prints the mapping under the tabs, because somebody who knows what a
market buy is should not have to guess what "sweep" does to their money.

| Intent         | The order it really is | What it does                          |
| -------------- | ---------------------- | ------------------------------------- |
| **Sweep N**    | Market buy, size N     | Takes the N cheapest listings         |
| **Make offer** | Limit buy at P, size N | A collection offer for any N tokens   |
| **List item**  | Limit sell at P        | Lists one token you own               |
| **Accept bid** | Market sell            | Hits the best standing collection bid |

Sizes are whole numbers. An NFT is indivisible.

**A sweep is priced off the ladder, not off the floor.** Buying five items when
the floor is one listing deep costs the sum of five asks. Quoting five times the
floor would understate the trade by whatever shape the book is in, so the summary
shows the realised average next to the total.

**Every market order carries a price ceiling.** The listings you were quoted can
be taken and replaced between your quote and your confirm, so the order sends a
maximum per item and refuses anything worse. An order that reaches the connector
without one is refused rather than sent.

**A sweep reports what it filled**, not what you typed. The book can be thinner
than it looked, so the confirmation names how many items actually settled and why
the run stopped.

**Royalties are paid by default**, and the connector caps the total fee an order
will accept rather than signing whatever a response asks for.

## Guardrails still apply

Every NFT order goes out through the same guarded path as a spot fill. Your
[risk guardrails](/docs/risk-guardrails) do not care that the thing being bought
is a picture.

Order placement is marked as having side effects, so a failed placement is never
quietly retried elsewhere. An error does not prove the order was rejected, and a
buy that in fact landed must not go out twice.

## Refresh rates

NFT data arrives as snapshots on a timer rather than a live stream, at cadences
set by what actually moves:

- The **ladder** and the **tape**, every 20 seconds
- **Collection state** (floor, volume, supply), every minute
- **Rankings**, every 5 minutes
- **Items** and **traits**, every 10 minutes

Panels only fetch while they are open, so a tab you are not looking at costs
nothing. That matters because a free OpenSea key allows roughly 600 reads an hour
and one board can have eight panels on one collection. Pairlens paces itself
inside that, with room for a burst when you open a board cold so nothing waits on
the first paint.

A rate limit is reported as a rate limit, all the way to the panel. It is never
shown as an empty collection.

## On a phone

NFT routes are desktop-only for now. Open one on a phone and the
[mobile terminal](/docs/mobile-terminal) redirects with a message.

That is a deliberate answer rather than an oversight: the class is the ladder,
the traits and the sweep ticket, and half of that on a phone screen is worse than
an honest redirect.

## Turning the class off

NFTs ship as a plugin family. Uninstall the NFT plugins from the Plugin Store and
the asset class leaves with them, Discovery tab and layouts included. See
[plugins](/docs/plugins-for-traders).

## Next

- [Place an order](/docs/place-an-order) for the rest of the ticket
- [Risk guardrails](/docs/risk-guardrails) for the limits every order is checked
  against
- [DEX and wallets](/docs/dex-trading) for where the wallet key comes from
