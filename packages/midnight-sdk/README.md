# @morpho-org/midnight-sdk

Viem-based package for Morpho Midnight that exports protocol utilities, fetch helpers, and Midnight API utilities.

## Installation

```bash
npm install @morpho-org/midnight-sdk @morpho-org/morpho-ts viem
```

```bash
yarn add @morpho-org/midnight-sdk @morpho-org/morpho-ts viem
```

## API Import Stability

Midnight HTTP API helpers are exported from `@morpho-org/midnight-sdk/api`. This import path is not stable and may not respect semver versioning.

## Making offers

The make-side starts with local offer construction, groups offers that should share consumption, and
commits grouped and standalone offers into one tree. Ratification inputs are optional for validation,
so validate the tree before asking the maker or an authorized signer to sign. After signing, pass
ratification inputs only when you also want to validate the final payload shape. Then encode the
ratified items into a mempool payload and submit the raw payload bytes onchain.

```ts
import { addresses } from "@morpho-org/morpho-ts";
import {
  EcrecoverRatifierUtils,
  Offer,
  Payload,
  Tree,
} from "@morpho-org/midnight-sdk";
import {
  parseUnits,
  zeroAddress,
  type Address,
  type Chain,
  type Transport,
  type WalletClient,
} from "viem";

const chainId = 8453;
const usdc = addresses[chainId].usdc!;
const weth = addresses[chainId].wNative!;
const midnight = addresses[chainId].midnight!;
const ecrecoverRatifier = addresses[chainId].ecrecoverRatifier!;
const midnightMempool = addresses[chainId].midnightMempool!;

export async function makeBaseUsdcWethOffers(params: {
  readonly walletClient: WalletClient<Transport, Chain>;
  readonly maker: Address;
  readonly wethUsdcOracle: Address;
}) {
  const market = {
    chainId,
    midnight,
    loanToken: usdc,
    collateralParams: [
      {
        token: weth,
        lltv: 770_000000000000000000n,
        liquidationCursor: 250_000000000000000000n,
        oracle: params.wethUsdcOracle,
      },
    ],
    maturity: 1_789_743_600n, // 2026-09-18 15:00:00 UTC.
    rcfThreshold: 0n,
    enterGate: zeroAddress,
    liquidatorGate: zeroAddress,
  };

  const commonOffer = {
    market,
    maker: params.maker,
    expiry: 1_789_741_800n,
    ratifier: ecrecoverRatifier,
  };

  const lend250kUsdc = Offer.create({
    ...commonOffer,
    buy: true,
    tick: 5_000n,
    maxAssets: parseUnits("250000", 6),
  });
  const lend100kUsdc = Offer.create({
    ...commonOffer,
    buy: true,
    tick: 5_012n,
    maxAssets: parseUnits("100000", 6),
  });

  const standaloneBorrowOffer = Offer.create({
    ...commonOffer,
    buy: false,
    tick: 5_024n,
    maxUnits: parseUnits("50", 18),
  });

  const tree = Tree.create([
    lend250kUsdc,
    lend100kUsdc,
    standaloneBorrowOffer,
  ]);

  // Ratification data is optional here. Omitting it catches API policy issues before asking the maker to sign.
  await tree.mempoolValidate({
    chainId,
  });

  // EcrecoverRatifierUtils derives the verifier from offer.ratifier and rejects mixed-ratifier trees.
  // The account may be the maker or an authorized signer for every maker in the tree.
  const signature = await EcrecoverRatifierUtils.sign({
    tree,
    client: params.walletClient,
    account: params.maker,
  });

  // Optional final-payload validation: include ratification data when validating post-signature bytes.
  await tree.mempoolValidate({
    chainId,
    ratification: { type: "ecrecover", account: params.maker, signature },
  });

  const items = await EcrecoverRatifierUtils.ratify({
    tree,
    account: params.maker,
    signature,
  });
  const payload = await Payload.encode(items);

  const transactionHash = await params.walletClient.sendTransaction({
    account: params.maker,
    to: midnightMempool,
    data: payload,
  });

  return { ok: true as const, transactionHash };
}
```

Use `SetterRatifierUtils` instead when a contract maker approves the tree root onchain. In that
route, build the `Tree`, validate it, submit the root approval transaction for every maker in the
tree, then call `SetterRatifierUtils.ratify({ tree })` before `Payload.encode(...)`.

## Taking offers

The take-side starts from API book, quote, or maker takeable-offer responses. `MidnightApi` maps the
router response into ABI-ready take objects: each item has `offer`, `ratifierData`, and `units` for
`IMidnight.take`, plus `marketId` metadata from the API. Book `asks` are maker sell offers, while
book `bids` are maker buy offers.
The quote's `averageWorstPrice` is an **aggregate** guard over the requested target: a favorable
offer can compensate for a worse one, and the worse offer does not satisfy the guard on its own.
That guard only holds if every returned offer settles together, so execute a quote through
`MidnightBundlesV1` in a single transaction. The bundle skips offers that became stale since the
quote, reverts unless the exact target is reached, and enforces one aggregate consideration bound
(`maxBuyerAssets` for asks, `minSellerAssets` for bids). Never split a quote into independent
`Midnight.take` transactions: a stale first leg reverts but still consumes its nonce, so the
remaining legs settle at a price the quote never authorized. The high-level
`@morpho-org/morpho-sdk` `client.morpho.midnight(chainId)` flows already route through the bundle
and resolve approvals for you; the recipe below shows the same route with this package's raw ABI.

```ts
import { getChainAddress } from "@morpho-org/morpho-ts";
import { MidnightApi } from "@morpho-org/midnight-sdk/api";
import { midnightBundlesAbi } from "@morpho-org/midnight-sdk";
import {
  maxUint256,
  parseUnits,
  zeroAddress,
  type Address,
  type Hash,
  type WalletClient,
} from "viem";
import { base } from "viem/chains";

const chainId = base.id;
const midnightBundles = getChainAddress(chainId, "midnightBundles");
const WAD = 10n ** 18n;

export async function takeAskQuoteAtomically(params: {
  readonly walletClient: WalletClient;
  readonly taker: Address;
  readonly marketId: Hash;
  readonly deadline: bigint;
}) {
  const targetUnits = parseUnits("50", 18);
  const quote = await MidnightApi.fetchBookQuote({
    marketId: params.marketId,
    side: "asks",
    units: targetUnits,
    slippage: "0.5",
  });

  // Keep the caller's target and the quote's aggregate guard as two independent inputs.
  // Do not substitute `quote.data.availableUnits` for the target: it is fallback capacity,
  // not what the caller asked for.
  const maxBuyerAssets =
    (targetUnits * BigInt(quote.data.averageWorstPrice) + WAD - 1n) / WAD;

  // Two confirmed prerequisites before this call: the taker has approved `midnightBundles`
  // to spend `maxBuyerAssets` of the loan token (or passes an ERC-2612/Permit2 payload as
  // `loanTokenPermit`), and has authorized the bundle on Midnight via
  // `Midnight.setIsAuthorized(midnightBundles, true, taker)` so it can act on the taker's
  // behalf (`@morpho-org/morpho-sdk`'s `getMidnightAuthorizationRequirement` resolves this
  // for you).
  return params.walletClient.writeContract({
    account: params.taker,
    chain: base,
    address: midnightBundles,
    abi: midnightBundlesAbi,
    functionName: "midnightBundlesV1BuyWithUnitsTargetAndWithdrawCollateral",
    args: [
      targetUnits,
      maxBuyerAssets,
      params.taker,
      false, // reduceOnly
      { kind: 0, data: "0x" }, // loanTokenPermit: none
      quote.data.takeableOffers, // { offer, units, ratifierData }[] straight from the quote
      [], // collateralWithdrawals
      zeroAddress, // collateralReceiver
      0n, // referralFeePct
      zeroAddress, // referralFeeRecipient
      maxUint256, // maxContinuousFee: bound this to the fee the caller accepts
      params.deadline,
    ],
  });
}
```

Bids mirror this with `midnightBundlesV1SupplyCollateralAndSellWithUnitsTarget` and a
`minSellerAssets` floor derived from the same `averageWorstPrice`. Prefer the `*WithAssetsTarget*`
variants when the caller fixes the asset amount instead of the unit amount.

If you must submit `Midnight.take` directly (for example from a contract that performs its own
atomic price check), treat each transaction as an independent fill: await and validate its receipt
before reducing the remaining target, stop on any revert, refresh offer consumption, and re-quote
the remaining target so a fresh aggregate guard covers what is left. An aggregate guard for the
full quote does not apply to any subset of it.

## Midnight API

Instantiate `MidnightApi` when an integration makes more than one Midnight API call or needs shared
request options. The instance keeps `baseUrl`, `fetch`, headers, credentials, and abort signals in
one place, while the SDK still owns endpoint paths, HTTP methods, request bodies, and response
normalization. Caller inputs and successful JSON output shapes are trusted at runtime; returned
TypeScript types model the API contract.

Use `tree.mempoolValidate({ chainId })` in normal make-side flows before the maker signs or approves
the root. Ratification data is optional for validation; pass `ratification` only when validating
final payload bytes with real ratifier data after the signature or Setter proof is available. It
throws `MidnightMempoolValidationError` with the API issues when policy validation fails. Pass
`apiUrl` to that method when using a custom Midnight API URL. `MidnightApi` keeps the raw HTTP
surface, including non-throwing `validateMempoolPayload` results for already encoded payload bytes.

## Development

Contribute from the monorepo root. See [CONTRIBUTING.md](../../CONTRIBUTING.md) for setup, checks,
and package workflow.

## License

MIT. See [LICENSE](../../LICENSE).
