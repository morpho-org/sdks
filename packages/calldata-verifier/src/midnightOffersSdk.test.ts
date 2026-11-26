import { MarketUtils, midnightBundlesV2Abi } from "@morpho-org/midnight-sdk";
import {
  blueWithdrawBuyCallback,
  midnightCancelOffers,
  midnightSupplyCollateralTakeBorrow,
  midnightTakeBorrow,
  midnightTakeLend,
} from "@morpho-org/morpho-sdk";
import { MarketParams } from "@morpho-org/morpho-sdk/blue/entities";
import {
  decodeFunctionData,
  encodeFunctionData,
  type Hex,
  zeroHash,
} from "viem";
import { expect, it } from "vitest";
import {
  CalldataAmountError,
  CalldataCallError,
  CalldataChainError,
  CalldataDecodeError,
  CalldataFeeError,
  CalldataRecipientError,
  CalldataTargetError,
  CalldataUnsupportedError,
  verifyCalldata,
} from "./index.js";
import {
  account,
  chainId,
  collateral,
  deadline,
  maker,
  market,
  takeable,
} from "./test/midnightSdk.js";
import { sdkCall } from "./test/sdkCall.js";
import type { CalldataIntent } from "./types.js";

const common = { chain_id: chainId, account, max_fee_bps: 0 } as const;
const borrowOffer = takeable(true);
const group = borrowOffer.offer.group;
const take = {
  ...common,
  market_id: MarketUtils.toId(market) as Hex,
  group,
  maker,
  amount: { unit: "units", value: "10" },
} as const;
const borrow = {
  chainId,
  market,
  deadline,
  target: { type: "units", units: 10n, minSellerAssets: 1n },
  receiver: account,
  takeableOffers: [borrowOffer],
} as const;
const sellGuard = { type: "min_assets", value: "1" } as const;

it("rejects a group value that cannot be converted to a regex input", () => {
  const call = sdkCall(midnightTakeBorrow(borrow));
  const intent = {
    ...take,
    action: "midnight.take_borrow",
    guard: sellGuard,
  } as const;
  expect(() =>
    // @ts-expect-error Test an unvalidated group.
    verifyCalldata({ ...intent, group: Symbol("group") }, [call]),
  ).toThrow(
    expect.objectContaining({
      constructor: CalldataTargetError,
      field: "group",
      callId: call.id,
    }),
  );
});

it.each([
  { field: "group", errorField: "group", error: CalldataTargetError },
  {
    field: "reduceOnly",
    errorField: "offer.reduce_only",
    error: CalldataUnsupportedError,
  },
  { field: "maker", errorField: "offer_fills", error: CalldataCallError },
])(
  "rejects a single take fill with a different $field",
  ({ field, errorField, error }) => {
    const call = sdkCall(midnightTakeBorrow(borrow));
    const intent = {
      ...take,
      action: "midnight.take_borrow",
      guard: sellGuard,
    } as const;
    const abi = midnightBundlesV2Abi;
    const decoded = decodeFunctionData({ abi, data: call.data });
    if (
      decoded.functionName !==
      "midnightBundlesV2SupplyCollateralAndSellWithUnitsTarget"
    )
      throw new Error("Expected units-target sell");
    const [
      marketParams,
      target,
      bound,
      reduce,
      receiver,
      supplies,
      [fill],
      ...rest
    ] = decoded.args;
    if (!fill) throw new Error("Expected offer fill");
    const offer = {
      ...fill.offer,
      ...(field === "group"
        ? { group: zeroHash }
        : field === "reduceOnly"
          ? { reduceOnly: true }
          : { maker: market.loanToken }),
    };
    const data = encodeFunctionData({
      abi,
      functionName: decoded.functionName,
      args: [
        marketParams,
        target,
        bound,
        reduce,
        receiver,
        supplies,
        [{ ...fill, offer }],
        ...rest,
      ],
    });
    expect(verifyCalldata(intent, [call])).toHaveLength(1);
    expect(() => verifyCalldata(intent, [{ ...call, data }])).toThrow(
      expect.objectContaining({
        constructor: error,
        field: errorField,
        callId: call.id,
      }),
    );
  },
);

it("rejects the collateral take action without collateral supplies", () => {
  const call = sdkCall(midnightTakeBorrow(borrow));
  const intent = { ...take, guard: sellGuard };
  expect(
    verifyCalldata({ ...intent, action: "midnight.take_borrow" }, [call]),
  ).toHaveLength(1);
  expect(() =>
    verifyCalldata(
      {
        ...intent,
        action: "midnight.supply_collateral_take_borrow",
        collateral_supplies: [],
      },
      [call],
    ),
  ).toThrow(
    expect.objectContaining({
      constructor: CalldataCallError,
      field: "collateral_supplies",
      callId: call.id,
    }),
  );
});

it.each([
  {
    intent: {
      ...take,
      action: "midnight.take_lend",
      guard: { type: "max_assets", value: "20" },
      funding: { type: "erc20" },
    },
    tx: midnightTakeLend({
      chainId,
      market,
      deadline,
      takeableOffers: [takeable(false)],
      target: { type: "units", units: 10n, maxBuyerAssets: 20n },
      maxContinuousFee: 0n,
      referralFeePct: 10n ** 16n,
      referralFeeRecipient: maker,
    }),
  },
  {
    intent: { ...take, action: "midnight.take_borrow", guard: sellGuard },
    tx: midnightTakeBorrow({
      ...borrow,
      referralFeePct: 10n ** 16n,
      referralFeeRecipient: maker,
    }),
  },
] as const)(
  "verifies a paid $intent.action and rejects a changed fee or recipient",
  ({ intent, tx }) => {
    const paid = {
      ...intent,
      max_fee_bps: 100,
      referral_fee: { bps: 100, recipient: maker },
    } as const;
    const call = sdkCall(tx);
    expect(verifyCalldata(paid, [call])).toHaveLength(1);
    const abi = midnightBundlesV2Abi;
    const decoded = decodeFunctionData({ abi, data: call.data });
    const args: readonly unknown[] = decoded.args;
    const index = args.findIndex(
      (arg, i) => arg === 10n ** 16n && args[i + 1] === maker,
    );
    expect(index).toBeGreaterThan(0);
    const reencode = (pct: bigint, recipient: Hex) => ({
      ...call,
      data: encodeFunctionData({
        abi,
        functionName: decoded.functionName,
        args: args.map((arg, i) =>
          i === index ? pct : i === index + 1 ? recipient : arg,
        ),
      } as Parameters<typeof encodeFunctionData>[0]),
    });
    expect(() =>
      verifyCalldata(paid, [reencode(2n * 10n ** 16n, maker)]),
    ).toThrow(
      expect.objectContaining({
        constructor: CalldataFeeError,
        callId: call.id,
      }),
    );
    expect(() => verifyCalldata(paid, [reencode(10n ** 16n, account)])).toThrow(
      expect.objectContaining({
        constructor: CalldataFeeError,
        field: "referral_fee.recipient",
        callId: call.id,
      }),
    );
  },
);

const blue = new MarketParams({
  loanToken: market.loanToken,
  collateralToken: collateral,
  oracle: maker,
  irm: maker,
  lltv: 770000000000000000n,
});
const cases = [
  {
    intent: { ...take, action: "midnight.take_borrow", guard: sellGuard },
    tx: midnightTakeBorrow(borrow),
  },
  {
    intent: {
      ...take,
      action: "midnight.supply_collateral_take_borrow",
      guard: sellGuard,
      collateral_supplies: [
        {
          collateral: { address: collateral },
          amount: { unit: "assets", value: "5" },
        },
      ],
    },
    tx: midnightSupplyCollateralTakeBorrow({
      ...borrow,
      collateralSupplies: [{ collateralIndex: 0n, assets: 5n }],
    }),
  },
  {
    intent: {
      ...take,
      action: "midnight.take_lend",
      guard: { type: "max_assets", value: "10" },
      funding: { type: "erc20" },
    },
    tx: midnightTakeLend({
      chainId,
      market,
      deadline,
      takeableOffers: [takeable(false)],
      target: { type: "units", units: 10n, maxBuyerAssets: 10n },
      maxContinuousFee: 0n,
    }),
  },
  {
    intent: {
      ...common,
      action: "midnight.cancel_offers",
      groups: [group, zeroHash],
    },
    tx: midnightCancelOffers({
      chainId,
      groups: [group, zeroHash],
      onBehalf: account,
    }),
  },
  {
    intent: {
      ...common,
      action: "midnight.withdraw_funding",
      funding_market: blue.id as Hex,
      funding_address: maker,
    },
    tx: blueWithdrawBuyCallback({
      market: { chainId, marketParams: blue },
      args: { callbackAddress: maker, userAddress: account, shares: 10n },
    }),
  },
] as const satisfies readonly {
  intent: CalldataIntent;
  tx: Parameters<typeof sdkCall>[0];
}[];

it.each(cases)(
  "verifies SDK-built $intent.action and rejects modified parameters",
  ({ intent, tx }) => {
    const call = sdkCall(tx);
    expect(
      verifyCalldata(intent, [call]).map((decoded) => decoded.call),
    ).toEqual([call]);
    expect(() => verifyCalldata({ ...intent, chain_id: 0 }, [call])).toThrow(
      CalldataChainError,
    );
    expect(() => verifyCalldata(intent, [{ ...call, to: maker }])).toThrow(
      CalldataTargetError,
    );
    expect(() =>
      verifyCalldata(intent, [{ ...call, data: "0xdeadbeef" }]),
    ).toThrow(CalldataDecodeError);
    expect(() => verifyCalldata(intent, [{ ...call, value: "1" }])).toThrow(
      CalldataAmountError,
    );
    expect(() => verifyCalldata(intent, [])).toThrow(CalldataCallError);
    if ("group" in intent) {
      expect(() =>
        verifyCalldata({ ...intent, group: zeroHash }, [call]),
      ).toThrow(CalldataTargetError);
      expect(() =>
        verifyCalldata({ ...intent, market_id: zeroHash }, [call]),
      ).toThrow(CalldataTargetError);
      expect(() =>
        verifyCalldata(
          { ...intent, amount: { ...intent.amount, value: "9" } },
          [call],
        ),
      ).toThrow(CalldataAmountError);
    } else {
      expect(() =>
        verifyCalldata({ ...intent, account: maker }, [call]),
      ).toThrow(CalldataRecipientError);
      if (intent.action === "midnight.withdraw_funding") {
        expect(() =>
          verifyCalldata({ ...intent, funding_market: zeroHash }, [call]),
        ).toThrow(CalldataTargetError);
        expect(() =>
          verifyCalldata({ ...intent, funding_address: account }, [call]),
        ).toThrow(CalldataRecipientError);
      } else {
        expect(() =>
          verifyCalldata({ ...intent, groups: [group] }, [call]),
        ).toThrow(CalldataCallError);
      }
    }
  },
);
