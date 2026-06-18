# @morpho-org/midnight-sdk

Viem-based package for Morpho Midnight that exports protocol utilities, fetch helpers, and Midnight API utilities.

## Installation

```bash
npm install @morpho-org/midnight-sdk @morpho-org/morpho-ts viem
```

```bash
yarn add @morpho-org/midnight-sdk @morpho-org/morpho-ts viem
```

## Making offers

The make-side starts with local offer construction, groups offers that should share consumption, and
commits grouped and standalone offers into one tree. Validate the tree before asking the maker to
sign or approve the root, then encode the ratified items into a mempool payload and submit the raw
payload bytes onchain.

```ts
import { addresses } from "@morpho-org/morpho-ts";
import {
  EcrecoverRatifierUtils,
  Group,
  MidnightApi,
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

  const tree = Tree.create(groupedLendOffers, standaloneBorrowOffer);

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

The take-side starts from API book, quote, or maker takeable-offer responses. Convert the API offer
shape back into SDK offer input, then use `TakeableOffer.createMany` or `TakeableOfferUtils.toStructs`
to validate side and market assumptions before passing each struct to `Midnight.take`. Book `asks`
are maker sell offers, while book `bids` are maker buy offers.
`IMidnight.take` accepts `offer`, `ratifierData`, `units`, `taker`, `receiverIfTakerIsSeller`,
`takerCallback`, and `takerCallbackData`; `TakeableOfferUtils.toStruct` supplies the first three.
For a quote that spans several offers, use `MidnightBundles`: it receives the same take structs,
calls `take` internally in order, and fills toward the target in one transaction.
The no-permit bundle example assumes the taker has authorized `MidnightBundles` on Midnight and has
approved the bundle contract to pull the market loan token.

```ts
import { addresses } from "@morpho-org/morpho-ts";
import {
  MidnightApi,
  TakeableOffer,
  TakeableOfferUtils,
  midnightAbi,
  midnightBundlesAbi,
  type IOffer,
  type MidnightApiTakeableOffer,
  type TakeableOfferStruct,
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

function offerFromApi(offer: MidnightApiTakeableOffer["offer"]): IOffer {
  return {
    market: {
      loanToken: offer.market.loanToken,
      collateralParams: offer.market.collaterals.map((collateral) => ({
        token: collateral.token,
        lltv: BigInt(collateral.lltv),
        maxLif: BigInt(collateral.maxLiquidationIncentiveFactor),
        oracle: collateral.oracle,
      })),
      maturity: BigInt(offer.market.maturity),
      rcfThreshold: BigInt(offer.market.rcfThreshold),
      enterGate: offer.market.enterGate,
      liquidatorGate: offer.market.liquidatorGate,
    },
    buy: offer.buy,
    maker: offer.maker,
    start: BigInt(offer.start),
    expiry: BigInt(offer.expiry),
    tick: BigInt(offer.tick),
    group: offer.group,
    callback: offer.callback,
    callbackData: offer.callbackData,
    receiverIfMakerIsSeller: offer.receiverIfMakerIsSeller,
    ratifier: offer.ratifier,
    reduceOnly: offer.reduceOnly,
    maxUnits: offer.maxUnits,
    maxAssets: offer.maxAssets,
  };
}

async function buildAskQuoteTakes(marketId: Hash, targetBuyerAssets: bigint) {
  const quote = await MidnightApi.fetchBookQuote({
    marketId,
    side: "asks",
    assets: targetBuyerAssets,
    slippage: "0.25",
  });

  const takeableOffers = TakeableOffer.createMany({
    entries: quote.data.takeableOffers.map((entry) => ({
      units: entry.units,
      offer: offerFromApi(entry.offer),
      ratifierData: entry.ratifierData,
    })),
    expectedOfferSide: "sell",
    enforceSameMarket: true,
  });

  const takeableOfferStructs = takeableOffers.map((takeableOffer) =>
    TakeableOfferUtils.toStruct(takeableOffer),
  );

  return { quote: quote.data, takeableOffers, takeableOfferStructs };
}

export async function takeOneOffer(params: {
  readonly walletClient: WalletClient;
  readonly taker: Address;
  readonly receiverIfTakerIsSeller: Address;
  readonly takeableOffer: TakeableOfferStruct;
}) {
  return params.walletClient.writeContract({
    account: params.taker,
    address: midnight,
    abi: midnightAbi,
    functionName: "take",
    args: [
      params.takeableOffer.offer,
      params.takeableOffer.ratifierData,
      params.takeableOffer.units,
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
  const { quote, takeableOfferStructs } = await buildAskQuoteTakes(
    params.marketId,
    targetBuyerAssets,
  );

  return params.walletClient.writeContract({
    account: params.taker,
    address: midnightBundles,
    abi: midnightBundlesAbi,
    functionName: "buyWithAssetsTargetAndWithdrawCollateral",
    args: [
      targetBuyerAssets,
      BigInt(quote.availableUnits),
      params.taker,
      tokenPermitNone,
      takeableOfferStructs,
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
