import { gzipSync } from "node:zlib";
import {
  Group,
  MarketUtils,
  midnightAbi,
  midnightBundlesV2Abi,
  Offer,
  type OfferStruct,
  OfferUtils,
  Payload,
  PriceRatifierV1,
  RateRatifierV1,
  Tree,
} from "@morpho-org/midnight-sdk";
import {
  getMidnightBlueBuyCallbackAddress,
  midnightCancelAndMake,
} from "@morpho-org/morpho-sdk";
import { addressesRegistry, getChainAddress } from "@morpho-org/morpho-ts";
import { marketParamsAbi } from "@morpho-org/morpho-ts/abis";
import {
  type Address,
  bytesToHex,
  concat,
  decodeFunctionData,
  encodeAbiParameters,
  encodeFunctionData,
  erc20Abi,
  type Hex,
  keccak256,
  maxUint128,
  maxUint256,
  zeroAddress,
  zeroHash,
} from "viem";
import { describe, expect, test } from "vitest";
import {
  CalldataAmountError,
  type CalldataCall,
  CalldataCallError,
  CalldataDecodeError,
  type CalldataIntent,
  CalldataRecipientError,
  CalldataTargetError,
  CalldataUnsupportedError,
  verifyCalldata,
} from "./index.js";
import { midnightMakerCases } from "./test/midnightMakers.fixtures.js";
import { sdkCall } from "./test/sdkCall.js";

type Action =
  | "midnight.make_lend"
  | "midnight.make_borrow"
  | "midnight.make_repay"
  | "midnight.make_withdraw";

const chainId = 1;
const chain = {
  midnight: getChainAddress(chainId, "midnight"),
  midnightBundlesV2: getChainAddress(chainId, "midnightBundlesV2"),
  priceRatifierV1: getChainAddress(chainId, "priceRatifierV1"),
  rateRatifierV1: getChainAddress(chainId, "rateRatifierV1"),
  wNative: getChainAddress(chainId, "wNative"),
};
const account = "0x1000000000000000000000000000000000000001" as const;
const other = "0x3000000000000000000000000000000000000003" as const;
const otherHash =
  "0x0000000000000000000000000000000000000000000000000000000000000001" as const;
const cap = 1_000_000n;
const rate = 1_000_000_000n;
const expiry = 1_767_200_000n;
const deadline = 4_000_000_000n;
const collateralAssets = 5_000n;
const market = {
  chainId: BigInt(chainId),
  midnight: chain.midnight,
  loanToken: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  collateralParams: [
    {
      token: chain.wNative,
      lltv: 770_000_000_000_000_000n,
      liquidationCursor: 250_000_000_000_000_000n,
      oracle: "0x2000000000000000000000000000000000000002",
    },
  ],
  maturity: 1_767_279_600n,
  rcfThreshold: 0n,
  enterGate: zeroAddress,
  liquidatorGate: zeroAddress,
} as const;
const _marketId = MarketUtils.toId(market) as Hex;
const blueMarket = {
  loanToken: market.loanToken,
  collateralToken: market.collateralParams[0].token,
  oracle: market.collateralParams[0].oracle,
  irm: "0x870aC11D48B15DB9a138Cf899d20F13F79Ba00BC",
  lltv: 860_000_000_000_000_000n,
} as const;
const twoCollateralMarket = {
  ...market,
  collateralParams: [
    ...market.collateralParams,
    {
      ...market.collateralParams[0],
      token: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599" as Address,
    },
  ].sort(MarketUtils.compareCollateralTokens),
} as unknown as typeof market;
const sides = {
  "midnight.make_lend": { buy: true, reduceOnly: false, unit: "assets" },
  "midnight.make_borrow": { buy: false, reduceOnly: false, unit: "assets" },
  "midnight.make_repay": { buy: true, reduceOnly: true, unit: "units" },
  "midnight.make_withdraw": { buy: false, reduceOnly: true, unit: "units" },
} as const;

function approve({
  token,
  spender,
  amount,
}: {
  token: Address;
  spender: Address;
  amount: bigint;
}) {
  return {
    id: "approval",
    kind: "approval",
    to: token,
    value: "0",
    data: encodeFunctionData({
      abi: erc20Abi,
      functionName: "approve",
      args: [spender, amount],
    }),
  } satisfies CalldataCall;
}

/** Builds an SDK maker publication; `tamper` changes offers after the intent is fixed. */
async function publication({
  action = "midnight.make_lend",
  type = "price",
  tamper = (offer) => offer,
  extraOffers = 0,
  allowedTaker = zeroAddress,
  collateral = false,
  nativeAmount,
  payload = (encoded) => encoded,
  offerMarket = market,
  blueFunding = false,
  blue = blueMarket,
  collateralToken = chain.wNative,
  saltMaxAssets = cap,
}: {
  action?: Action;
  type?: "price" | "rate";
  tamper?: (offer: OfferStruct, index: number) => OfferStruct;
  extraOffers?: number;
  allowedTaker?: Address;
  collateral?: boolean;
  nativeAmount?: bigint;
  payload?: (encoded: Hex) => Hex;
  offerMarket?: typeof market;
  blueFunding?: boolean;
  blue?: Omit<typeof blueMarket, "loanToken"> & { loanToken: Address };
  collateralToken?: Address;
  saltMaxAssets?: bigint;
} = {}) {
  const { buy, reduceOnly, unit } = sides[action];
  const ratifier =
    type === "rate" ? chain.rateRatifierV1 : chain.priceRatifierV1;
  const callbackFree = Array.from({ length: 2 + extraOffers }, (_, index) =>
    Offer.create({
      market: offerMarket,
      buy,
      maker: account,
      tick: 5_000n + 4n * BigInt(index),
      start: 0n,
      expiry: expiry - BigInt(index),
      ratifier,
      reduceOnly,
      maxAssets: unit === "assets" ? cap : 0n,
      maxUnits: unit === "units" ? cap : 0n,
    }),
  );
  const callbackSalt = blueFunding
    ? Group.create(
        callbackFree.map((offer) =>
          Offer.create({ ...offer, maxAssets: saltMaxAssets }),
        ),
      ).id
    : zeroHash;
  const callback = blueFunding
    ? getMidnightBlueBuyCallbackAddress({
        chainId,
        owner: account,
        salt: callbackSalt,
      })
    : zeroAddress;
  const base = callbackFree.map((offer) =>
    blueFunding
      ? Offer.create({
          ...offer,
          maxAssets: maxUint128,
          callback,
          callbackData: encodeAbiParameters([marketParamsAbi], [blue]),
        })
      : offer,
  );
  const ungrouped = base.map((offer) => ({ offer, rate, allowedTaker }));
  const group =
    type === "rate"
      ? RateRatifierV1.groupId(ungrouped)
      : PriceRatifierV1.groupId(ungrouped);
  const entries = base.map((offer, index) => ({
    offer: tamper(OfferUtils.toStruct({ offer, group }), index),
    rate,
    allowedTaker,
  }));
  let root: Hex;
  let items: readonly Payload.Item[];
  if (type === "rate") {
    const tree = Tree.create({ type: "rateV1", entries });
    root = tree.root;
    items = RateRatifierV1.ratify({ tree });
  } else {
    const tree = Tree.create({ type: "priceV1", entries });
    root = tree.root;
    items = PriceRatifierV1.ratify({ tree });
  }
  const intent = {
    action,
    chain_id: chainId,
    account,
    max_fee_bps: 0,
    amount: { unit, value: cap.toString() },
    offers: {
      type,
      entries: base.slice(0, 2).map((offer) => ({
        market_id: MarketUtils.toId(offerMarket) as Hex,
        tick: offer.tick.toString(),
        starts_at: Number(offer.start),
        expires_at: Number(offer.expiry),
        ...(type === "rate" ? { rate_wad: rate.toString() } : {}),
      })),
    },
    ...(blueFunding
      ? {
          funding_source: {
            type: "variable_rate_market",
            market_id: keccak256(
              encodeAbiParameters([marketParamsAbi], [blue]),
            ),
          },
          ...(nativeAmount == null
            ? {}
            : { funding: { type: "native", max_native_assets: "10000" } }),
        }
      : {}),
    ...(collateral
      ? {
          collateral_supplies: [
            {
              collateral: { address: collateralToken },
              amount: { unit: "assets", value: collateralAssets.toString() },
            },
          ],
          funding: { type: "native", max_native_assets: "10000" },
        }
      : {}),
  } as CalldataIntent;
  const tx = midnightCancelAndMake({
    chainId,
    deadline,
    cancellations: [],
    nativeAmount,
    publication: {
      ratifier,
      root,
      groups: [group],
      payload: payload(await Payload.encode(items)),
      ...(blueFunding
        ? { blueSupply: { market: blue, assets: cap, callbackSalt } }
        : {}),
      ...(collateral
        ? {
            collateral: {
              market: offerMarket,
              supplies: [
                {
                  collateralIndex: BigInt(
                    offerMarket.collateralParams.findIndex(
                      ({ token }) => token === collateralToken,
                    ),
                  ),
                  assets: collateralAssets,
                },
              ],
            },
          }
        : {}),
    },
  });
  const calls: CalldataCall[] = [
    {
      id: "authorization",
      kind: "authorization",
      to: chain.midnight,
      value: "0",
      data: encodeFunctionData({
        abi: midnightAbi,
        functionName: "setIsAuthorized",
        args: [chain.midnightBundlesV2, true, account],
      }),
    },
  ];
  if (buy) {
    calls.push(
      approve({
        token: offerMarket.loanToken,
        spender: blueFunding ? chain.midnightBundlesV2 : chain.midnight,
        amount: maxUint256,
      }),
    );
  }
  if (collateral) {
    calls.push(
      approve({
        token: collateralToken,
        spender: chain.midnightBundlesV2,
        amount: collateralAssets,
      }),
    );
  }
  calls.push({ ...sdkCall(tx), id: "make" });
  return { intent, calls };
}

function withArg(
  calls: readonly CalldataCall[],
  { index, value }: { index: number; value: unknown },
) {
  const call = calls.at(-1) as CalldataCall;
  const { args } = decodeFunctionData({
    abi: midnightBundlesV2Abi,
    data: call.data,
  });
  return [
    ...calls.slice(0, -1),
    {
      ...call,
      data: encodeFunctionData({
        abi: midnightBundlesV2Abi,
        functionName: "midnightBundlesV2CancelAndMake",
        args: (args ?? []).map((arg, position) =>
          position === index ? value : arg,
        ) as never,
      }),
    },
  ];
}

describe("verifyCalldata Midnight maker actions", () => {
  test.each(Object.keys(midnightMakerCases))(
    "default: accepts the Actions API %s fixture",
    (name) => {
      const { intent, calls } = midnightMakerCases[
        name
      ] as (typeof midnightMakerCases)[string];
      const verified = verifyCalldata(intent, calls);
      expect(verified).toHaveLength(calls.length);
      expect(verified.at(-1)?.functionName).toBe(
        "midnightBundlesV2CancelAndMake",
      );
    },
  );

  test.each(
    (Object.keys(sides) as Action[]).flatMap((action) =>
      (["price", "rate"] as const).map((type) => ({ action, type })),
    ),
  )(
    "behavior: accepts an SDK-built $action $type publication",
    async ({ action, type }) => {
      const { intent, calls } = await publication({ action, type });
      expect(verifyCalldata(intent, calls)).toHaveLength(calls.length);
    },
  );

  test("behavior: accepts collateral supplied with native funding on make_borrow", async () => {
    const { intent, calls } = await publication({
      action: "midnight.make_borrow",
      collateral: true,
      nativeAmount: collateralAssets,
    });
    expect(verifyCalldata(intent, calls)).toHaveLength(calls.length);
  });

  test("behavior: verifies a variable-rate funded make_lend", async () => {
    for (const type of ["price", "rate"] as const) {
      const { intent, calls } = await publication({ type, blueFunding: true });
      expect(verifyCalldata(intent, calls)).toHaveLength(calls.length);
    }
  });

  test.each<{
    mutation: string;
    index: number;
    value: unknown;
    error: unknown;
  }>([
    {
      mutation: "another Blue market",
      index: 0,
      value: { ...blueMarket, lltv: 0n },
      error: CalldataTargetError,
    },
    {
      mutation: "fewer parked assets",
      index: 1,
      value: cap - 1n,
      error: CalldataAmountError,
    },
    {
      mutation: "another callback salt",
      index: 2,
      value: `0x${"11".repeat(32)}`,
      error: CalldataCallError,
    },
  ])(
    "error: variable-rate make_lend with $mutation",
    async ({ index, value, error }) => {
      const { intent, calls } = await publication({ blueFunding: true });
      expect(() =>
        verifyCalldata(intent, withArg(calls, { index, value })),
      ).toThrow(error as never);
    },
  );

  test("behavior: variable-rate make_lend offers carry an unbounded asset cap", async () => {
    const { intent, calls } = await publication({ blueFunding: true });
    const { args } = decodeFunctionData({
      abi: midnightBundlesV2Abi,
      data: (calls.at(-1) as CalldataCall).data,
    });
    const items = await Payload.decode(args?.[14] as Hex);
    expect(items.map(({ offer }) => offer.maxAssets)).toEqual(
      items.map(() => maxUint128),
    );
    expect(verifyCalldata(intent, calls)).toBeDefined();
  });

  test("error: rejects a callback salt hashed over the published asset caps", async () => {
    const { intent, calls } = await publication({
      blueFunding: true,
      saltMaxAssets: maxUint128,
    });
    expect(() => verifyCalldata(intent, calls)).toThrow(
      new CalldataCallError("callback_salt", (calls.at(-1) as CalldataCall).id),
    );
  });

  test.each([
    { mutation: "no amount", amount: undefined },
    { mutation: "a null amount", amount: null },
  ])(
    "error: rejects a variable-rate make_lend with $mutation",
    async ({ amount }) => {
      const { intent, calls } = await publication({ blueFunding: true });
      expect(() =>
        verifyCalldata(
          { ...intent, amount } as unknown as CalldataIntent,
          calls,
        ),
      ).toThrow(CalldataAmountError);
    },
  );

  test("error: rejects variable-rate offers capped at the funded amount", async () => {
    const { intent, calls } = await publication({
      blueFunding: true,
      tamper: (offer) => ({ ...offer, maxAssets: cap }),
    });
    expect(() => verifyCalldata(intent, calls)).toThrow(CalldataAmountError);
  });

  test("error: rejects variable-rate offers without the derived callback", async () => {
    const { intent, calls } = await publication({
      blueFunding: true,
      tamper: (offer, index) =>
        index === 0 ? { ...offer, callback: other } : offer,
    });
    expect(() => verifyCalldata(intent, calls)).toThrow(CalldataCallError);
  });

  test("error: rejects Blue parking without a variable-rate funding source", async () => {
    const { intent, calls } = await publication({ blueFunding: true });
    const { funding_source: _, ...walletIntent } = intent as {
      funding_source?: unknown;
    };
    expect(() => verifyCalldata(walletIntent as CalldataIntent, calls)).toThrow(
      CalldataCallError,
    );
  });

  test("error: rejects a wallet approval to Midnight on a variable-rate make_lend", async () => {
    const { intent, calls } = await publication({ blueFunding: true });
    expect(() =>
      verifyCalldata(intent, [
        calls[0] as CalldataCall,
        approve({
          token: market.loanToken,
          spender: chain.midnight,
          amount: maxUint256,
        }),
        calls.at(-1) as CalldataCall,
      ]),
    ).toThrow();
  });

  test.each<{
    mutation: string;
    tamper: (offer: OfferStruct, index: number) => OfferStruct;
    error: unknown;
  }>([
    {
      mutation: "another maker",
      tamper: (offer) => ({ ...offer, maker: other }),
      error: CalldataRecipientError,
    },
    {
      mutation: "another market",
      tamper: (offer) => ({
        ...offer,
        market: { ...offer.market, rcfThreshold: 1n },
      }),
      error: CalldataTargetError,
    },
    {
      mutation: "a higher cap",
      tamper: (offer) => ({ ...offer, maxAssets: cap + 1n }),
      error: CalldataAmountError,
    },
    {
      mutation: "a different tick",
      tamper: (offer, index) =>
        index === 1 ? { ...offer, tick: offer.tick + 4n } : offer,
      error: CalldataAmountError,
    },
    {
      mutation: "a later start",
      tamper: (offer) => ({ ...offer, start: 1n }),
      error: CalldataAmountError,
    },
    {
      mutation: "a reduce-only flag",
      tamper: (offer) => ({ ...offer, reduceOnly: true }),
      error: CalldataCallError,
    },
    {
      mutation: "a callback",
      tamper: (offer) => ({ ...offer, callback: other }),
      error: CalldataCallError,
    },
    {
      mutation: "a continuous fee cap",
      tamper: (offer) => ({ ...offer, continuousFeeCap: 1n }),
      error: CalldataCallError,
    },
    {
      mutation: "a different group",
      tamper: (offer) => ({ ...offer, group: otherHash }),
      error: CalldataCallError,
    },
    {
      mutation: "the rate ratifier",
      tamper: (offer) => ({ ...offer, ratifier: chain.rateRatifierV1 }),
      error: CalldataCallError,
    },
  ])("error: rejects an offer with $mutation", async ({ tamper, error }) => {
    const { intent, calls } = await publication({ tamper });
    expect(() => verifyCalldata(intent, calls)).toThrow(error as never);
  });

  test("error: rejects a sell offer paying another receiver", async () => {
    const { intent, calls } = await publication({
      action: "midnight.make_borrow",
      tamper: (offer) => ({ ...offer, receiverIfMakerIsSeller: other }),
    });
    expect(() => verifyCalldata(intent, calls)).toThrow(CalldataRecipientError);
  });

  test("error: rejects a rate leaf committing another rate", async () => {
    const { intent, calls } = await publication({ type: "rate" });
    const { offers } = intent as unknown as {
      offers: { type: "rate"; entries: { rate_wad: string }[] };
    };
    const lower = {
      ...intent,
      offers: {
        ...offers,
        entries: offers.entries.map((entry) => ({ ...entry, rate_wad: "1" })),
      },
    } as unknown as CalldataIntent;
    expect(() => verifyCalldata(lower, calls)).toThrow(CalldataAmountError);
  });

  test("error: rejects a restricted taker", async () => {
    const { intent, calls } = await publication({
      type: "rate",
      allowedTaker: other,
    });
    expect(() => verifyCalldata(intent, calls)).toThrow(CalldataCallError);
  });

  test("error: rejects a hidden extra offer before decoding it", async () => {
    const { intent, calls } = await publication({ extraOffers: 1 });
    expect(() => verifyCalldata(intent, calls)).toThrow(
      expect.objectContaining({
        constructor: CalldataDecodeError,
        field: "payload",
        cause: expect.objectContaining({ name: "PayloadDecodeError" }),
      }),
    );
  });

  test("error: rejects a payload with fewer offers than entries", async () => {
    const { intent, calls } = await publication();
    const { args } = decodeFunctionData({
      abi: midnightBundlesV2Abi,
      data: (calls.at(-1) as CalldataCall).data,
    });
    const items = await Payload.decode(args?.[14] as Hex);
    const fewer = await Payload.encode(items.slice(0, 1));
    expect(() =>
      verifyCalldata(intent, withArg(calls, { index: 14, value: fewer })),
    ).toThrow(
      expect.objectContaining({
        constructor: CalldataCallError,
        field: "offers.entries",
      }),
    );
  });

  test("error: CalldataUnsupportedError for an unknown funding source", async () => {
    const { intent, calls } = await publication();
    expect(() =>
      verifyCalldata(
        {
          ...intent,
          funding_source: { type: "vault" },
        } as unknown as CalldataIntent,
        calls,
      ),
    ).toThrow(
      expect.objectContaining({
        constructor: CalldataUnsupportedError,
        field: "funding_source",
      }),
    );
  });

  test("error: rejects a root that does not commit to the payload", async () => {
    const { intent, calls } = await publication();
    expect(() =>
      verifyCalldata(intent, withArg(calls, { index: 6, value: otherHash })),
    ).toThrow(
      expect.objectContaining({
        constructor: CalldataCallError,
        field: "root",
      }),
    );
  });

  test.each<{ mutation: string; payload: (encoded: Hex) => Hex }>([
    {
      mutation: "an attribution suffix",
      payload: (encoded) => concat([encoded, "0xff"]),
    },
    {
      mutation: "a corrupt gzip stream",
      payload: (encoded) =>
        concat([encoded.slice(0, 12) as Hex, "0x00", `0x${encoded.slice(14)}`]),
    },
    {
      mutation: "an unknown version",
      payload: (encoded) => concat(["0x02", `0x${encoded.slice(4)}`]),
    },
  ])("error: CalldataDecodeError on $mutation", async ({ payload }) => {
    const { intent, calls } = await publication({ payload });
    expect(() => verifyCalldata(intent, calls)).toThrow(CalldataDecodeError);
  });

  test.each<{
    mutation: string;
    index: number;
    value: unknown;
    error: unknown;
  }>([
    {
      mutation: "the rate ratifier on a price request",
      index: 5,
      value: chain.rateRatifierV1,
      error: CalldataTargetError,
    },
    {
      mutation: "a root signature",
      index: 7,
      value: 1n,
      error: CalldataCallError,
    },
    {
      mutation: "cancellations",
      index: 13,
      value: [{ group: zeroHash, maxConsumed: 0n }],
      error: CalldataCallError,
    },
    {
      mutation: "a zero deadline",
      index: 15,
      value: 0n,
      error: CalldataAmountError,
    },
    { mutation: "Blue parking", index: 1, value: 1n, error: CalldataCallError },
    {
      mutation: "a wrapped-native pull",
      index: 16,
      value: chain.wNative,
      error: CalldataCallError,
    },
  ])(
    "error: rejects a publication with $mutation",
    async ({ error, ...arg }) => {
      const { intent, calls } = await publication();
      expect(() => verifyCalldata(intent, withArg(calls, arg))).toThrow(
        error as never,
      );
    },
  );

  test("error: rejects a publication sent to Midnight directly", async () => {
    const { intent, calls } = await publication();
    const call = calls.at(-1) as CalldataCall;
    expect(() =>
      verifyCalldata(intent, [
        ...calls.slice(0, -1),
        { ...call, to: chain.midnight },
      ]),
    ).toThrow(CalldataTargetError);
  });

  test("error: rejects a mismatched amount unit", async () => {
    const { intent, calls } = await publication();
    expect(() =>
      verifyCalldata(
        {
          ...intent,
          amount: { unit: "units", value: cap.toString() },
        } as CalldataIntent,
        calls,
      ),
    ).toThrow(CalldataAmountError);
  });

  test.each<{ mutation: string; approval: CalldataCall; error: unknown }>([
    {
      mutation: "to the bundle",
      approval: approve({
        token: market.loanToken,
        spender: chain.midnightBundlesV2,
        amount: maxUint256,
      }),
      error: CalldataTargetError,
    },
    {
      mutation: "of another token",
      approval: approve({
        token: chain.wNative,
        spender: chain.midnight,
        amount: maxUint256,
      }),
      error: CalldataTargetError,
    },
    {
      mutation: "below the lend amount",
      approval: approve({
        token: market.loanToken,
        spender: chain.midnight,
        amount: cap - 1n,
      }),
      error: CalldataAmountError,
    },
  ])(
    "error: rejects a loan-token approval $mutation",
    async ({ approval, error }) => {
      const { intent, calls } = await publication();
      expect(() =>
        verifyCalldata(intent, [
          calls[0] as CalldataCall,
          approval,
          calls.at(-1) as CalldataCall,
        ]),
      ).toThrow(error as never);
    },
  );

  test("error: rejects a loan-token approval on make_borrow", async () => {
    const { intent, calls } = await publication({
      action: "midnight.make_borrow",
    });
    expect(() =>
      verifyCalldata(intent, [
        approve({
          token: market.loanToken,
          spender: chain.midnight,
          amount: maxUint256,
        }),
        ...calls,
      ]),
    ).toThrow(CalldataTargetError);
  });

  test("error: rejects collateral on a request without collateral_supplies", async () => {
    const { calls } = await publication({
      action: "midnight.make_borrow",
      collateral: true,
    });
    const { intent } = await publication({ action: "midnight.make_borrow" });
    expect(() =>
      verifyCalldata(intent, [
        calls[0] as CalldataCall,
        calls.at(-1) as CalldataCall,
      ]),
    ).toThrow(CalldataCallError);
  });

  test("error: rejects native value above the collateral amount", async () => {
    const { intent, calls } = await publication({
      action: "midnight.make_borrow",
      collateral: true,
      nativeAmount: collateralAssets,
    });
    const call = calls.at(-1) as CalldataCall;
    expect(() =>
      verifyCalldata(intent, [
        ...calls.slice(0, -1),
        { ...call, value: (collateralAssets + 1n).toString() },
      ]),
    ).toThrow(CalldataAmountError);
  });

  test("error: rejects a rate request entry without rate_wad", async () => {
    const { intent, calls } = await publication({ type: "rate" });
    const { offers } = intent as unknown as {
      offers: { type: "rate"; entries: { rate_wad?: string }[] };
    };
    const missing = {
      ...intent,
      offers: {
        ...offers,
        entries: offers.entries.map(({ rate_wad: _, ...entry }) => entry),
      },
    } as unknown as CalldataIntent;
    expect(() => verifyCalldata(missing, calls)).toThrow(
      expect.objectContaining({
        constructor: CalldataAmountError,
        field: "offers.rate_wad",
      }),
    );
  });

  test("error: CalldataDecodeError on a payload that inflates past the size cap", async () => {
    const bomb = gzipSync(
      new Uint8Array(Payload.MAX_DECOMPRESSED_ITEMS_BYTES + 1),
    );
    const header = new Uint8Array(5);
    header[0] = Payload.CURRENT_VERSION;
    new DataView(header.buffer).setUint32(1, bomb.length);
    const { intent, calls } = await publication({
      payload: () => bytesToHex(new Uint8Array([...header, ...bomb])),
    });
    let error: unknown;
    try {
      verifyCalldata(intent, calls);
    } catch (thrown) {
      error = thrown;
    }
    expect(error).toBeInstanceOf(CalldataDecodeError);
    const gunzipError = (error as Error).cause as Error;
    expect(gunzipError.cause).toBeInstanceOf(RangeError);
    expect((gunzipError.cause as Error).message).toBe(
      `gzip output exceeds ${Payload.MAX_DECOMPRESSED_ITEMS_BYTES} bytes`,
    );
  });

  test("error: rejects a non-object offer entry", async () => {
    const { intent, calls } = await publication();
    const malformed = {
      ...intent,
      offers: {
        ...(intent as unknown as { offers: { entries: unknown[] } }).offers,
        entries: [
          (intent as unknown as { offers: { entries: unknown[] } }).offers
            .entries[0],
          null,
        ],
      },
    } as unknown as CalldataIntent;
    expect(() => verifyCalldata(malformed, calls)).toThrow(
      expect.objectContaining({
        constructor: CalldataCallError,
        field: "offers.entries",
      }),
    );
  });

  test("error: rejects an unsorted collateral tuple on make_borrow", async () => {
    const { intent, calls } = await publication({
      action: "midnight.make_borrow",
      collateral: true,
      offerMarket: twoCollateralMarket,
    });
    expect(verifyCalldata(intent, calls)).toHaveLength(calls.length);
    expect(() =>
      verifyCalldata(
        intent,
        withArg(calls, {
          index: 3,
          value: {
            ...twoCollateralMarket,
            collateralParams: [
              ...twoCollateralMarket.collateralParams,
            ].reverse(),
          },
        }),
      ),
    ).toThrow(
      expect.objectContaining({
        constructor: CalldataTargetError,
        field: "market",
      }),
    );
  });

  test("behavior: every MidnightBundlesV2 chain can derive the BlueBuyCallback", () => {
    const chains = Object.values(addressesRegistry).filter(
      (addresses) => "midnightBundlesV2" in addresses,
    );
    expect(chains.length).toBeGreaterThan(0);
    for (const addresses of chains) {
      expect(addresses).toHaveProperty("midnightBlueBuyCallbackFactory");
      expect(addresses).toHaveProperty("midnight");
      expect(addresses).toHaveProperty("blue");
    }
  });

  test("behavior: accepts a rate entry without a tick", async () => {
    const { intent, calls } = await publication({ type: "rate" });
    const { offers } = intent as unknown as {
      offers: { type: "rate"; entries: { tick?: string }[] };
    };
    const tickless = {
      ...intent,
      offers: {
        ...offers,
        entries: offers.entries.map(({ tick: _, ...entry }) => entry),
      },
    } as unknown as CalldataIntent;
    expect(verifyCalldata(tickless, calls)).toHaveLength(calls.length);
  });

  test("error: rejects an unknown offers type", async () => {
    const { intent, calls } = await publication();
    const { offers } = intent as unknown as { offers: object };
    const unknown = {
      ...intent,
      offers: { ...offers, type: "dutch" },
    } as unknown as CalldataIntent;
    expect(() => verifyCalldata(unknown, calls)).toThrow(
      expect.objectContaining({
        constructor: CalldataTargetError,
        field: "ratifier",
      }),
    );
  });

  test("error: rejects a proof sibling that does not match the activated root", async () => {
    const { intent, calls } = await publication();
    const { args } = decodeFunctionData({
      abi: midnightBundlesV2Abi,
      data: (calls.at(-1) as CalldataCall).data,
    });
    const items = await Payload.decode(args?.[14] as Hex);
    const tampered = await Payload.encode(
      items.map((item, index) => {
        if (index !== 0) {
          return item;
        }
        const data = PriceRatifierV1.decodeRatifierData(item.ratifierData);
        return {
          ...item,
          ratifierData: PriceRatifierV1.encodeRatifierData({
            ...data,
            proof: [keccak256("0x01"), ...data.proof.slice(1)],
          }),
        };
      }),
    );
    expect(() =>
      verifyCalldata(intent, withArg(calls, { index: 14, value: tampered })),
    ).toThrow(new CalldataCallError("root", (calls.at(-1) as CalldataCall).id));
  });

  test.each([
    { mutation: "zero assets", assets: 0n },
    {
      mutation: "more assets than a uint128 offer cap",
      assets: maxUint128 + 1n,
    },
  ])(
    "error: rejects a variable-rate make_lend that parks $mutation",
    async ({ assets }) => {
      const { intent, calls } = await publication({ blueFunding: true });
      expect(() =>
        verifyCalldata(
          {
            ...intent,
            amount: { unit: "assets", value: assets.toString() },
          } as CalldataIntent,
          withArg(calls, { index: 1, value: assets }),
        ),
      ).toThrow(
        new CalldataAmountError("amount", (calls.at(-1) as CalldataCall).id),
      );
    },
  );

  test("error: rejects payload items whose ratifier data cannot rebuild the tree", async () => {
    const { intent, calls } = await publication();
    const { args } = decodeFunctionData({
      abi: midnightBundlesV2Abi,
      data: (calls.at(-1) as CalldataCall).data,
    });
    const items = await Payload.decode(args?.[14] as Hex);
    const broken = await Payload.encode(
      items.map((item) => ({ ...item, ratifierData: "0x01" as Hex })),
    );
    expect(() =>
      verifyCalldata(intent, withArg(calls, { index: 14, value: broken })),
    ).toThrow(
      expect.objectContaining({
        constructor: CalldataCallError,
        field: "payload",
        cause: expect.anything(),
      }),
    );
  });

  test("error: rejects a collateral market whose id cannot be computed", async () => {
    const { intent, calls } = await publication({
      action: "midnight.make_borrow",
      collateral: true,
    });
    expect(() =>
      verifyCalldata(
        intent,
        withArg(calls, {
          index: 3,
          value: { ...market, collateralParams: [] },
        }),
      ),
    ).toThrow(
      expect.objectContaining({
        constructor: CalldataTargetError,
        field: "market",
        cause: expect.anything(),
      }),
    );
  });

  test.each([
    { mutation: "another chain", value: { ...market, chainId: 2n } },
    { mutation: "another Midnight", value: { ...market, midnight: other } },
    {
      mutation: "another maturity",
      value: { ...market, maturity: market.maturity + 1n },
    },
  ])("error: rejects a collateral market on $mutation", async ({ value }) => {
    const { intent, calls } = await publication({
      action: "midnight.make_borrow",
      collateral: true,
    });
    expect(() =>
      verifyCalldata(intent, withArg(calls, { index: 3, value })),
    ).toThrow(
      expect.objectContaining({
        constructor: CalldataTargetError,
        field: "market",
      }),
    );
  });

  test("error: rejects native value without wrapped-native collateral", async () => {
    const { intent, calls } = await publication({
      action: "midnight.make_borrow",
      collateral: true,
      offerMarket: twoCollateralMarket,
      collateralToken: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",
    });
    expect(verifyCalldata(intent, calls)).toHaveLength(calls.length);
    const tampered = withArg(calls, { index: 16, value: chain.wNative });
    expect(() =>
      verifyCalldata(intent, [
        ...tampered.slice(0, -1),
        { ...(tampered.at(-1) as CalldataCall), value: "1" },
      ]),
    ).toThrow(
      expect.objectContaining({
        constructor: CalldataAmountError,
        field: "value",
      }),
    );
  });

  test("error: rejects a Blue market whose loan token differs from the offers'", async () => {
    const { intent, calls } = await publication({
      blueFunding: true,
      blue: { ...blueMarket, loanToken: chain.wNative },
    });
    expect(() => verifyCalldata(intent, calls)).toThrow(
      expect.objectContaining({
        constructor: CalldataTargetError,
        field: "funding_source.market_id",
      }),
    );
  });

  describe("native-funded variable-rate make_lend", () => {
    const wNativeMarket = {
      ...market,
      loanToken: chain.wNative,
    } as unknown as typeof market;
    const wNativeBlue = {
      ...blueMarket,
      loanToken: chain.wNative,
    } as unknown as typeof blueMarket;
    const nativePublication = () =>
      publication({
        blueFunding: true,
        offerMarket: wNativeMarket,
        blue: wNativeBlue,
        nativeAmount: 1_000n,
      });
    const withValue = (calls: readonly CalldataCall[], value: string) => [
      ...calls.slice(0, -1),
      { ...(calls.at(-1) as CalldataCall), value },
    ];

    test("default", async () => {
      const { intent, calls } = await nativePublication();
      expect(verifyCalldata(intent, calls)).toHaveLength(calls.length);
    });

    test.each([
      {
        mutation: "more value than parked assets",
        value: (cap + 1n).toString(),
        wrapped: chain.wNative,
      },
      {
        mutation: "a wrapped-native address without value",
        value: "0",
        wrapped: chain.wNative,
      },
      { mutation: "another wrapped native", value: "1000", wrapped: other },
    ])("error: rejects $mutation", async ({ value, wrapped }) => {
      const { intent, calls } = await nativePublication();
      expect(() =>
        verifyCalldata(
          intent,
          withValue(withArg(calls, { index: 16, value: wrapped }), value),
        ),
      ).toThrow(
        expect.objectContaining({
          constructor: CalldataAmountError,
          field: "value",
        }),
      );
    });

    test("error: rejects native value on a non-wrapped-native loan token", async () => {
      const { intent, calls } = await publication({ blueFunding: true });
      expect(() =>
        verifyCalldata(
          intent,
          withValue(withArg(calls, { index: 16, value: chain.wNative }), "1"),
        ),
      ).toThrow(
        expect.objectContaining({
          constructor: CalldataAmountError,
          field: "value",
        }),
      );
    });

    test("error: rejects native value above the funding budget", async () => {
      const { intent, calls } = await nativePublication();
      expect(() =>
        verifyCalldata(
          {
            ...intent,
            funding: { type: "native", max_native_assets: "999" },
          } as CalldataIntent,
          calls,
        ),
      ).toThrow(CalldataAmountError);
    });
  });

  test("error: rejects another MidnightBundlesV2 function", async () => {
    const { intent, calls } = await publication();
    const sell = encodeFunctionData({
      abi: midnightBundlesV2Abi,
      functionName: "midnightBundlesV2SupplyCollateralAndSellWithAssetsTarget",
      args: [
        market,
        1n,
        0n,
        false,
        account,
        [],
        [],
        0n,
        zeroAddress,
        deadline,
        zeroAddress,
      ],
    });
    expect(() =>
      verifyCalldata(intent, [
        ...calls.slice(0, -1),
        { ...(calls.at(-1) as CalldataCall), data: sell },
      ]),
    ).toThrow(
      expect.objectContaining({
        constructor: CalldataCallError,
        field: "function",
      }),
    );
  });

  test("error: rejects a price entry without a tick", async () => {
    const { intent, calls } = await publication();
    const { offers } = intent as unknown as {
      offers: { type: "price"; entries: { tick?: string }[] };
    };
    const tickless = {
      ...intent,
      offers: {
        ...offers,
        entries: offers.entries.map(({ tick: _, ...entry }) => entry),
      },
    } as unknown as CalldataIntent;
    expect(() => verifyCalldata(tickless, calls)).toThrow(
      expect.objectContaining({
        constructor: CalldataAmountError,
        field: "offers.tick",
      }),
    );
  });

  test("error: rejects grouped offers that mix loan tokens", async () => {
    const { intent, calls } = await publication();
    const { args } = decodeFunctionData({
      abi: midnightBundlesV2Abi,
      data: (calls.at(-1) as CalldataCall).data,
    });
    const items = await Payload.decode(args?.[14] as Hex);
    const mixed = items.map((item, index) => ({
      ...item,
      offer: {
        ...item.offer,
        market:
          index === 1
            ? { ...item.offer.market, loanToken: chain.wNative }
            : item.offer.market,
      },
    }));
    const group = PriceRatifierV1.groupId(
      mixed.map(({ offer, ratifierData }) => ({
        offer,
        ...PriceRatifierV1.decodeRatifierData(ratifierData),
      })),
    );
    const payload = await Payload.encode(
      mixed.map((item) => ({ ...item, offer: { ...item.offer, group } })),
    );
    expect(() =>
      verifyCalldata(intent, withArg(calls, { index: 14, value: payload })),
    ).toThrow(
      expect.objectContaining({
        constructor: CalldataCallError,
        field: "payload",
        cause: expect.objectContaining({ name: "InvalidOfferGroupError" }),
      }),
    );
  });

  test("error: rejects a sparse offer entry list", async () => {
    const { intent, calls } = await publication();
    const { offers } = intent as unknown as { offers: { entries: unknown[] } };
    const entries = [...offers.entries];
    delete entries[1];
    const sparse = {
      ...intent,
      offers: { ...offers, entries },
    } as unknown as CalldataIntent;
    expect(() => verifyCalldata(sparse, calls)).toThrow(
      expect.objectContaining({
        constructor: CalldataCallError,
        field: "offers.entries",
      }),
    );
  });

  test("error: rejects a native-funded variable-rate approval that covers only the ERC-20 part", async () => {
    const { intent, calls } = await publication({
      blueFunding: true,
      offerMarket: {
        ...market,
        loanToken: chain.wNative,
      } as unknown as typeof market,
      blue: { ...blueMarket, loanToken: chain.wNative },
      nativeAmount: 1_000n,
    });
    expect(() =>
      verifyCalldata(intent, [
        calls[0] as CalldataCall,
        approve({
          token: chain.wNative,
          spender: chain.midnightBundlesV2,
          amount: cap - 1_000n,
        }),
        calls.at(-1) as CalldataCall,
      ]),
    ).toThrow(CalldataAmountError);
  });
});
