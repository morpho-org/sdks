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
commits grouped and standalone offers into one tree. Validate the tree before asking the maker to
sign or approve the root, then encode the ratified items into a mempool payload and submit the raw
payload bytes onchain.

```ts
import { addresses } from "@morpho-org/morpho-ts";
import { MidnightApi } from "@morpho-org/midnight-sdk/api";
import {
  EcrecoverRatifierUtils,
  Group,
  Offer,
  Payload,
  Tree,
} from "@morpho-org/midnight-sdk";
import { parseUnits, zeroAddress, type Address, type WalletClient } from "viem";

const chainId = 8453;
const usdc = addresses[chainId].usdc!;
const weth = addresses[chainId].wNative!;
const ecrecoverRatifier = addresses[chainId].ecrecoverRatifier!;
const midnightMempool = addresses[chainId].midnightMempool!;

export async function makeBaseUsdcWethOffers(params: {
  readonly walletClient: WalletClient;
  readonly maker: Address;
  readonly wethUsdcOracle: Address;
}) {
  const market = {
    loanToken: usdc,
    collateralParams: [
      {
        token: weth,
        lltv: 770_000000000000000000n,
        maxLif: 1_061007957559681697n,
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
  const groupedLendOffers = Group.create([lend250kUsdc, lend100kUsdc]);

  const standaloneBorrowOffer = Offer.create({
    ...commonOffer,
    buy: false,
    tick: 5_024n,
    maxUnits: parseUnits("50", 18),
  });

  const tree = Tree.create([groupedLendOffers, standaloneBorrowOffer]);

  const treeValidation = await MidnightApi.validateMempoolTree({
    chainId,
    tree,
  });
  if (!treeValidation.valid) {
    return { ok: false as const, issues: treeValidation.issues };
  }

  // EcrecoverRatifierUtils derives the verifier from offer.ratifier and rejects mixed-ratifier trees.
  const items = await EcrecoverRatifierUtils.ratify({
    tree,
    chainId,
    signTypedData: (typedData) =>
      params.walletClient.signTypedData({
        account: params.maker,
        ...typedData,
      }),
  });
  const payload = await Payload.encode(items);

  const payloadValidation = await MidnightApi.validateMempoolPayload({
    chainId,
    payload,
  });
  if (!payloadValidation.valid) {
    return { ok: false as const, issues: payloadValidation.issues };
  }

  const transactionHash = await params.walletClient.sendTransaction({
    account: params.maker,
    to: midnightMempool,
    data: payload,
  });

  return { ok: true as const, transactionHash };
}
```

Use `SetterRatifierUtils` instead when a contract maker approves the tree root onchain. In that
route, build the `Tree`, validate it, submit the root approval transaction, then call
`SetterRatifierUtils.ratify({ tree })` before `Payload.encode(...)`.

## Taking offers

The take-side starts from API book, quote, or maker takeable-offer responses. `MidnightApi` maps the
router response into ABI-ready take objects: each item has `offer`, `ratifierData`, and `units` for
`IMidnight.take`, plus `marketId` metadata from the API. Book `asks` are maker sell offers, while
book `bids` are maker buy offers.
For a quote that spans several offers, use `MidnightBundles`: it receives the returned take objects,
calls `take` internally in order, and fills toward the target in one transaction.
When executing offers one-by-one with `Midnight.take`, clamp each take to the remaining target instead
of submitting every returned cap blindly.
The no-permit bundle example assumes the taker has authorized `MidnightBundles` on Midnight and has
approved the bundle contract to pull the market loan token. Set `minUnits` or `maxUnits` from your
own price guard; the example uses `0n` to focus on the route mechanics.

```ts
import { addresses } from "@morpho-org/morpho-ts";
import {
  MidnightApi,
  type MidnightApiTake,
} from "@morpho-org/midnight-sdk/api";
import {
  midnightAbi,
  midnightBundlesAbi,
} from "@morpho-org/midnight-sdk";
import {
  parseUnits,
  zeroAddress,
  type Address,
  type Hash,
  type WalletClient,
} from "viem";

const chainId = 8453;
const midnight = addresses[chainId].midnight!;
const midnightBundles = addresses[chainId].midnightBundles!;
const tokenPermitNone = { kind: 0, data: "0x" } as const;

async function buildAskQuoteTakes(marketId: Hash, targetBuyerAssets: bigint) {
  const quote = await MidnightApi.fetchBookQuote({
    marketId,
    side: "asks",
    assets: targetBuyerAssets,
    slippage: "0.25",
  });

  return quote.data;
}

export async function takeOneOffer(params: {
  readonly walletClient: WalletClient;
  readonly taker: Address;
  readonly receiverIfTakerIsSeller: Address;
  readonly take: MidnightApiTake;
}) {
  return params.walletClient.writeContract({
    account: params.taker,
    address: midnight,
    abi: midnightAbi,
    functionName: "take",
    args: [
      params.take.offer,
      params.take.ratifierData,
      params.take.units,
      params.taker,
      params.receiverIfTakerIsSeller,
      zeroAddress,
      "0x",
    ],
  });
}

export async function takeAskQuoteWithBundle(params: {
  readonly walletClient: WalletClient;
  readonly taker: Address;
  readonly marketId: Hash;
}) {
  const targetBuyerAssets = parseUnits("10000", 6);
  const minUnits = 0n;
  const quote = await buildAskQuoteTakes(params.marketId, targetBuyerAssets);

  return params.walletClient.writeContract({
    account: params.taker,
    address: midnightBundles,
    abi: midnightBundlesAbi,
    functionName: "buyWithAssetsTargetAndWithdrawCollateral",
    args: [
      targetBuyerAssets,
      minUnits,
      params.taker,
      tokenPermitNone,
      quote.takeableOffers,
      [],
      params.taker,
      0n,
      zeroAddress,
    ],
  });
}
```

## Midnight API

Instantiate `MidnightApi` when an integration makes more than one Midnight API call or needs shared
request options. The instance keeps `baseUrl`, `fetch`, headers, credentials, and abort signals in
one place, while the SDK still owns endpoint paths, HTTP methods, request bodies, and response
normalization. Caller inputs and successful JSON output shapes are trusted at runtime; returned
TypeScript types model the API contract.

## Development

Contribute from the monorepo root. See [CONTRIBUTING.md](../../CONTRIBUTING.md) for setup, checks,
and package workflow.

## License

MIT. See [LICENSE](../../LICENSE).
