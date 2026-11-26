import { blueAbi } from "@morpho-org/blue-sdk-viem";
import {
  MarketUtils,
  midnightAbi,
  midnightBundlesV2Abi,
  Payload,
  PriceRatifierV1,
  Tree,
} from "@morpho-org/midnight-sdk";
import { midnightCancelAndMake } from "@morpho-org/morpho-sdk";
import { getChainAddress, getChainAddresses } from "@morpho-org/morpho-ts";
import { marketParamsAbi } from "@morpho-org/morpho-ts/abis";
import {
  decodeFunctionData,
  encodeAbiParameters,
  encodeFunctionData,
  type Hex,
  keccak256,
  maxUint128,
  zeroAddress,
  zeroHash,
} from "viem";
import { describe, expect, it } from "vitest";
import {
  CalldataAmountError,
  CalldataCallError,
  CalldataDecodeError,
  type CalldataIntent,
  CalldataRecipientError,
  CalldataTargetError,
  CalldataUnsupportedError,
  verifyCalldata,
} from "./index.js";
import { midnightOfferCases } from "./test/midnightOffers.fixtures.js";
import {
  deadline,
  market as makerMarket,
  takeable,
} from "./test/midnightSdk.js";
import { sdkCall } from "./test/sdkCall.js";

const { chain_id, account } = midnightOfferCases.exactAssets.intent;
const fundingAddress = "0x2000000000000000000000000000000000000002" as const;
const fundingParams = {
  loanToken: "0x3000000000000000000000000000000000000003",
  collateralToken: "0x4000000000000000000000000000000000000004",
  oracle: "0x5000000000000000000000000000000000000005",
  irm: "0x6000000000000000000000000000000000000006",
  lltv: 860_000_000_000_000_000n,
} as const;
const fundingIntent = {
  action: "midnight.withdraw_funding",
  chain_id,
  account,
  funding_address: fundingAddress,
  funding_market: keccak256(
    encodeAbiParameters([marketParamsAbi], [fundingParams]),
  ),
  max_fee_bps: 0,
} as const satisfies CalldataIntent;

function fundingCall({
  assets = 0n,
  shares = 1_000n,
  owner = fundingAddress,
  receiver = account,
}: {
  assets?: bigint;
  shares?: bigint;
  owner?: `0x${string}`;
  receiver?: `0x${string}`;
} = {}) {
  return {
    id: "call_0",
    kind: "blueWithdrawBuyCallback",
    to: getChainAddresses(chain_id).blue,
    value: "0",
    data: encodeFunctionData({
      abi: blueAbi,
      functionName: "withdraw",
      args: [fundingParams, assets, shares, owner, receiver],
    }),
  };
}

describe("Midnight offers", () => {
  it.each(Object.entries(midnightOfferCases))(
    "verifies %s",
    (_, { intent, calls }) => {
      expect(verifyCalldata(intent, calls)).toHaveLength(calls.length);
    },
  );

  it("checks the group, market, amount and optional maker against the request", () => {
    const { intent, calls } = midnightOfferCases.exactAssets;
    expect(() => verifyCalldata({ ...intent, group: zeroHash }, calls)).toThrow(
      CalldataTargetError,
    );
    expect(() =>
      verifyCalldata(
        { ...intent, group: undefined } as unknown as CalldataIntent,
        calls,
      ),
    ).toThrow(CalldataTargetError);
    expect(() =>
      verifyCalldata({ ...intent, market_id: zeroHash }, calls),
    ).toThrow(CalldataTargetError);
    expect(() => verifyCalldata({ ...intent, maker: account }, calls)).toThrow(
      CalldataCallError,
    );
    expect(() =>
      verifyCalldata(
        { ...intent, amount: { unit: "assets", value: "1" } },
        calls,
      ),
    ).toThrow(CalldataAmountError);
    expect(() =>
      verifyCalldata({ ...intent, market_id: undefined }, calls),
    ).toThrow(CalldataUnsupportedError);
  });

  it("rejects lowering the encoded min_assets floor on a borrow take", () => {
    const { intent, calls } = midnightOfferCases.borrowWithCollateral;
    const call = calls.at(-1);
    if (!call) throw new Error("Expected borrow");
    const abi = midnightBundlesV2Abi;
    const { functionName, args } = decodeFunctionData({ abi, data: call.data });
    if (
      functionName !== "midnightBundlesV2SupplyCollateralAndSellWithUnitsTarget"
    ) {
      throw new Error("Expected a units-target borrow");
    }
    const [market, target, minAssets, ...rest] = args;
    const request = {
      ...intent,
      guard: { type: "min_assets", value: minAssets.toString() },
    } as const;
    expect(() => verifyCalldata(request, calls)).not.toThrow();
    const data = encodeFunctionData({
      abi,
      functionName,
      args: [market, target, minAssets - 1n, ...rest],
    });
    expect(() =>
      verifyCalldata(request, [...calls.slice(0, -1), { ...call, data }]),
    ).toThrow(CalldataAmountError);
  });

  it("rejects raising the encoded max_assets cap on a lend take", () => {
    const {
      intent,
      calls: [call],
    } = midnightOfferCases.lend;
    const abi = midnightBundlesV2Abi;
    const decoded = decodeFunctionData({ abi, data: call.data });
    if (
      decoded.functionName !==
      "midnightBundlesV2BuyWithAssetsTargetAndWithdrawCollateral"
    ) {
      throw new Error("Expected an assets-target lend");
    }
    const [market, maxAssets, target, ...rest] = decoded.args;
    const request = {
      ...intent,
      amount: { unit: "units", value: target.toString() },
      guard: { type: "max_assets", value: maxAssets.toString() },
    } as const;
    const verify = (cap: bigint) =>
      verifyCalldata(request, [
        {
          ...call,
          data: encodeFunctionData({
            abi,
            functionName:
              "midnightBundlesV2BuyWithUnitsTargetAndWithdrawCollateral",
            args: [market, target, cap, ...rest],
          }),
        },
      ]);
    expect(() => verify(maxAssets)).not.toThrow();
    expect(() => verify(maxAssets + 1n)).toThrow(CalldataAmountError);
  });

  it("checks the group inside every fill", () => {
    const {
      intent,
      calls: [authorization, call],
    } = midnightOfferCases.exactAssets;
    const abi = midnightBundlesV2Abi;
    const decoded = decodeFunctionData({ abi, data: call.data });
    if (
      decoded.functionName !==
      "midnightBundlesV2SupplyCollateralAndSellWithAssetsTarget"
    ) {
      throw new Error("Expected an asset-target borrow");
    }
    const args = [...decoded.args] as [...typeof decoded.args];
    const [fill] = args[6];
    if (fill == null) throw new Error("Expected an offer fill");
    args[6] = [
      ...args[6],
      { ...fill, offer: { ...fill.offer, group: zeroHash } },
    ];
    const data = encodeFunctionData({
      abi,
      functionName: decoded.functionName,
      args,
    });
    expect(() =>
      verifyCalldata(intent, [authorization, { ...call, data }]),
    ).toThrow(CalldataTargetError);
  });

  it.each([
    { mutation: "a different maker", error: CalldataCallError },
    { mutation: "a reduce-only maker offer", error: CalldataUnsupportedError },
  ])(
    "rejects $mutation in the same group with maker omitted",
    ({ mutation, error }) => {
      const {
        intent,
        calls: [authorization, call],
      } = midnightOfferCases.exactAssets;
      const abi = midnightBundlesV2Abi;
      const { functionName, args } = decodeFunctionData({
        abi,
        data: call.data,
      });
      if (
        functionName !==
        "midnightBundlesV2SupplyCollateralAndSellWithAssetsTarget"
      ) {
        throw new Error("Expected an asset-target take");
      }
      const [
        market,
        target,
        bound,
        reduceOnly,
        receiver,
        supplies,
        fills,
        ...rest
      ] = args;
      const [fill] = fills;
      if (fill == null) throw new Error("Expected a fill");
      const offer =
        mutation === "a different maker"
          ? { ...fill.offer, maker: fundingAddress }
          : { ...fill.offer, reduceOnly: true };
      expect(offer.maker === fill.offer.maker).toBe(
        mutation !== "a different maker",
      );
      const data = encodeFunctionData({
        abi,
        functionName,
        args: [
          market,
          target,
          bound,
          reduceOnly,
          receiver,
          supplies,
          [...fills, { ...fill, offer }],
          ...rest,
        ],
      });
      expect(() =>
        verifyCalldata({ ...intent, maker: undefined }, [
          authorization,
          { ...call, data },
        ]),
      ).toThrow(error);
    },
  );

  it("rejects a take with a rate guard that cannot be verified locally", () => {
    const { intent, calls } = midnightOfferCases.exactAssets;
    expect(() =>
      verifyCalldata(
        { ...intent, guard: { type: "max_rate", value: "1" } },
        calls,
      ),
    ).toThrow(CalldataUnsupportedError);
  });

  it.each([
    [midnightOfferCases.exactAssets, "min_units"],
    [midnightOfferCases.borrowWithCollateral, "max_assets"],
    [midnightOfferCases.lend, "min_assets"],
  ] as const)(
    "rejects wrong-side and unknown guards on $0.intent.action",
    ({ intent, calls }, wrongSide) => {
      for (const type of [wrongSide, "unknown"] as const) {
        expect(() =>
          verifyCalldata(
            // @ts-expect-error Test an unvalidated intent.
            { ...intent, guard: { type, value: "1" } },
            calls,
          ),
        ).toThrow(CalldataUnsupportedError);
      }
    },
  );

  it("checks the cancel group, owner, amount and nested calldata", () => {
    const {
      intent,
      calls: [call],
    } = midnightOfferCases.batchCancellation;
    const [group, otherGroup] = intent.groups;
    const setConsumed = (
      args: readonly [typeof group | typeof otherGroup, bigint, `0x${string}`],
    ) =>
      encodeFunctionData({
        abi: midnightAbi,
        functionName: "setConsumed",
        args,
      });
    const direct = { ...intent, groups: [group] };
    expect(
      verifyCalldata(direct, [
        { ...call, data: setConsumed([group, maxUint128, account]) },
      ])[0]?.functionName,
    ).toBe("setConsumed");
    expect(() =>
      verifyCalldata(direct, [
        { ...call, data: setConsumed([otherGroup, maxUint128, account]) },
      ]),
    ).toThrow(CalldataTargetError);
    expect(() =>
      verifyCalldata(direct, [
        { ...call, data: setConsumed([group, 1n, account]) },
      ]),
    ).toThrow(CalldataAmountError);
    expect(() =>
      verifyCalldata(direct, [
        { ...call, data: setConsumed([group, maxUint128, fundingAddress]) },
      ]),
    ).toThrow(CalldataRecipientError);
    const data = encodeFunctionData({
      abi: midnightAbi,
      functionName: "multicall",
      args: [[setConsumed([group, maxUint128, account]), "0x1234"]],
    });
    expect(() => verifyCalldata(intent, [{ ...call, data }])).toThrow(
      CalldataDecodeError,
    );
  });

  it.each([
    { group: undefined, error: CalldataTargetError },
    { group: 1, error: CalldataTargetError },
    { group: "0x1234", error: CalldataTargetError },
    { group: "duplicate", error: CalldataCallError },
    { group: "additional", error: CalldataCallError },
  ])("rejects invalid cancellation groups ($group)", ({ group, error }) => {
    const {
      intent,
      calls: [call],
    } = midnightOfferCases.batchCancellation;
    const [first, second] = intent.groups;
    const data = encodeFunctionData({
      abi: midnightAbi,
      functionName: "setConsumed",
      args: [first, maxUint128, account],
    });
    expect(
      verifyCalldata({ ...intent, groups: [first] }, [{ ...call, data }]),
    ).toHaveLength(1);
    const groups =
      group === "duplicate"
        ? [first, first]
        : group === "additional"
          ? [first, second]
          : group === undefined
            ? undefined
            : [group];
    expect(() =>
      verifyCalldata({ ...intent, groups } as CalldataIntent, [
        { ...call, data },
      ]),
    ).toThrow(
      expect.objectContaining({
        constructor: error,
        field: "groups",
        callId: call.id,
      }),
    );
  });

  it("rejects an empty batch of cancellations", () => {
    const {
      intent,
      calls: [call],
    } = midnightOfferCases.batchCancellation;
    const data = encodeFunctionData({
      abi: midnightAbi,
      functionName: "multicall",
      args: [[]],
    });
    expect(() =>
      verifyCalldata({ ...intent, groups: [] }, [{ ...call, data }]),
    ).toThrow(
      expect.objectContaining({
        constructor: CalldataCallError,
        field: "groups",
        callId: call.id,
      }),
    );
  });

  it("rejects a non-cancellation call on the Midnight contract", () => {
    const {
      intent,
      calls: [call],
    } = midnightOfferCases.batchCancellation;
    const [group] = intent.groups;
    const data = encodeFunctionData({
      abi: midnightAbi,
      functionName: "setIsAuthorized",
      args: [fundingAddress, true, account],
    });
    expect(() =>
      verifyCalldata({ ...intent, groups: [group] }, [{ ...call, data }]),
    ).toThrow(
      expect.objectContaining({
        constructor: CalldataCallError,
        field: "function",
        callId: call.id,
      }),
    );
  });

  it("checks a funding withdrawal against the backend's direct Blue withdrawal shape", () => {
    const call = fundingCall();
    expect(verifyCalldata(fundingIntent, [call])[0]?.functionName).toBe(
      "withdraw",
    );
    expect(() =>
      verifyCalldata(fundingIntent, [fundingCall({ owner: account })]),
    ).toThrow(CalldataRecipientError);
    expect(() =>
      verifyCalldata(fundingIntent, [
        fundingCall({ receiver: fundingAddress }),
      ]),
    ).toThrow(CalldataRecipientError);
    expect(() =>
      verifyCalldata(fundingIntent, [fundingCall({ assets: 1n })]),
    ).toThrow(CalldataAmountError);
    expect(() =>
      verifyCalldata(fundingIntent, [fundingCall({ shares: 0n })]),
    ).toThrow(CalldataAmountError);
    expect(() =>
      verifyCalldata({ ...fundingIntent, funding_market: zeroHash }, [call]),
    ).toThrow(CalldataTargetError);
    expect(() =>
      verifyCalldata(fundingIntent, [{ ...call, to: fundingAddress }]),
    ).toThrow(CalldataTargetError);
    expect(() => verifyCalldata(fundingIntent, [call, call])).toThrow(
      CalldataCallError,
    );
  });

  it("rejects a different Blue selector for withdrawing funding", () => {
    const call = fundingCall();
    const data = encodeFunctionData({
      abi: blueAbi,
      functionName: "borrow",
      args: [fundingParams, 0n, 1_000n, fundingAddress, account],
    });
    expect(() => verifyCalldata(fundingIntent, [{ ...call, data }])).toThrow(
      expect.objectContaining({
        constructor: CalldataCallError,
        field: "function",
        callId: call.id,
      }),
    );
  });

  it.each(["not an address", zeroAddress])(
    "rejects invalid funding address %s",
    (funding_address) => {
      const call = fundingCall(
        funding_address === zeroAddress ? { owner: zeroAddress } : {},
      );
      expect(() =>
        verifyCalldata(
          { ...fundingIntent, funding_address } as CalldataIntent,
          [call],
        ),
      ).toThrow(
        expect.objectContaining({
          constructor: CalldataTargetError,
          field: "funding_address",
          callId: call.id,
        }),
      );
    },
  );

  it.each([
    ["midnight.make_borrow", "assets"],
    ["midnight.make_lend", "assets"],
    ["midnight.make_repay", "units"],
    ["midnight.make_withdraw", "units"],
  ] as const)(
    "rejects a publication for %s with a typed unsupported error",
    async (action, unit) => {
      const buy =
        action === "midnight.make_lend" || action === "midnight.make_repay";
      const ratifier = getChainAddress(chain_id, "priceRatifierV1");
      const publicationMarket = { ...makerMarket, maturity: 54_000n };
      const offer = {
        ...takeable(buy).offer,
        market: publicationMarket,
        maker: account,
        receiverIfMakerIsSeller: buy ? zeroAddress : account,
        ratifier,
        reduceOnly: unit === "units",
        maxUnits: unit === "units" ? 1n : 0n,
        maxAssets: unit === "assets" ? 1n : 0n,
      };
      const tree = Tree.create({ type: "priceV1", entries: [{ offer }] });
      const tx = midnightCancelAndMake({
        chainId: chain_id,
        deadline,
        cancellations: [],
        publication: {
          ratifier,
          root: tree.root,
          groups: [offer.group],
          payload: await Payload.encode(PriceRatifierV1.ratify({ tree })),
        },
      });
      const decoded = decodeFunctionData({
        abi: midnightBundlesV2Abi,
        data: tx.data,
      });
      if (decoded.functionName !== "midnightBundlesV2CancelAndMake") {
        throw new Error("Expected a maker publication");
      }
      expect(decoded.args[6]).toBe(tree.root);
      expect(decoded.args[6]).not.toBe(zeroHash);
      const intent = {
        action,
        chain_id,
        account,
        max_fee_bps: 0,
        amount: { unit, value: "1" },
        offers: {
          type: "price",
          entries: [
            {
              market_id: MarketUtils.toId(publicationMarket) as Hex,
              tick: offer.tick.toString(),
              starts_at: Number(offer.start),
              expires_at: Number(offer.expiry),
            },
          ],
        },
      } as const;
      expect(() =>
        verifyCalldata(intent as CalldataIntent, [sdkCall(tx)]),
      ).toThrow(CalldataUnsupportedError);
    },
  );
});
