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
commits grouped and standalone offers into one tree. Validate the tree before asking the maker or an
authorized signer to sign, or pass ratification inputs to validate the final payload shape after a
signature or Setter proof is available. Then encode the ratified items into a mempool payload and
submit the raw payload bytes onchain.

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

  // EcrecoverRatifierUtils derives the verifier from offer.ratifier and rejects mixed-ratifier trees.
  // The account may be the maker or an authorized signer for every maker in the tree.
  const signature = await EcrecoverRatifierUtils.sign({
    tree,
    client: params.walletClient,
    account: params.maker,
  });

  await tree.mempoolValidate({
    chainId,
    ratification: { type: "ecrecover", signature },
  });

  const items = await EcrecoverRatifierUtils.ratify({
    tree,
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
For a quote that spans several offers, execute the returned takes in order with `Midnight.take` and
clamp each take to the remaining target instead of submitting every returned cap blindly.

```ts
import { addresses } from "@morpho-org/morpho-ts";
import {
  MidnightApi,
  type MidnightApiTake,
} from "@morpho-org/midnight-sdk/api";
import { midnightAbi } from "@morpho-org/midnight-sdk";
import {
  parseUnits,
  zeroAddress,
  type Address,
  type Hash,
  type WalletClient,
} from "viem";

const chainId = 8453;
const midnight = addresses[chainId].midnight!;

async function buildAskQuoteTakes(marketId: Hash, targetUnits: bigint) {
  const quote = await MidnightApi.fetchBookQuote({
    marketId,
    side: "asks",
    units: targetUnits,
    slippage: "0.5",
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

export async function takeAskQuoteSequentially(params: {
  readonly walletClient: WalletClient;
  readonly taker: Address;
  readonly receiverIfTakerIsSeller: Address;
  readonly marketId: Hash;
}) {
  const targetUnits = parseUnits("50", 18);
  const quote = await buildAskQuoteTakes(params.marketId, targetUnits);
  const transactionHashes: Hash[] = [];
  let remainingUnits = targetUnits;

  for (const take of quote.takeableOffers) {
    if (remainingUnits === 0n) break;

    const units = take.units < remainingUnits ? take.units : remainingUnits;
    if (units === 0n) continue;

    transactionHashes.push(
      await takeOneOffer({
        walletClient: params.walletClient,
        taker: params.taker,
        receiverIfTakerIsSeller: params.receiverIfTakerIsSeller,
        take: { ...take, units },
      }),
    );
    remainingUnits -= units;
  }

  return { remainingUnits, transactionHashes };
}
```

## Midnight API

Instantiate `MidnightApi` when an integration makes more than one Midnight API call or needs shared
request options. The instance keeps `baseUrl`, `fetch`, headers, credentials, and abort signals in
one place, while the SDK still owns endpoint paths, HTTP methods, request bodies, and response
normalization. Caller inputs and successful JSON output shapes are trusted at runtime; returned
TypeScript types model the API contract.

Use `tree.mempoolValidate({ chainId })` in normal make-side flows before the maker signs or approves
the root, or pass `ratification` to validate final payload bytes with real ratifier data after the
signature or Setter proof is available. It throws `MidnightMempoolValidationError` with the API
issues when policy validation fails. Pass `apiUrl` to that method when using a custom Midnight API
URL. `MidnightApi` keeps the raw HTTP surface, including non-throwing `validateMempoolPayload`
results for already encoded payload bytes.

## Development

Contribute from the monorepo root. See [CONTRIBUTING.md](../../CONTRIBUTING.md) for setup, checks,
and package workflow.

## License

MIT. See [LICENSE](../../LICENSE).
