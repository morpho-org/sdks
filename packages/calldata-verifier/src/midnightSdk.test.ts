import { MarketUtils } from "@morpho-org/midnight-sdk";
import {
  midnightRedeem,
  midnightRepayWithdrawCollateral,
  midnightSupplyCollateral,
  midnightSupplyCollateralWithNative,
  midnightTakeBorrow,
  midnightTakeLend,
  midnightTakeRepayWithdrawCollateral,
  midnightTakeWithdraw,
  midnightWithdrawCollateral,
} from "@morpho-org/morpho-sdk";
import { midnightBundlesV2Abi } from "@morpho-org/morpho-sdk/abis";
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
  CalldataRecipientError,
  CalldataTargetError,
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

const base = {
  chain_id: chainId,
  account,
  market: MarketUtils.toId(market) as Hex,
  max_fee_bps: 0,
} as const;
const args = { chainId, market, deadline };
const assets = { unit: "assets", value: "10" } as const;
const units = { unit: "units", value: "10" } as const;
const funding = { type: "erc20" } as const;
const collateralTransfer = {
  collateral: { address: collateral },
  amount: assets,
} as const;
const buyTarget = { type: "units", units: 10n, maxBuyerAssets: 10n } as const;
const sellTarget = { type: "units", units: 10n, minSellerAssets: 1n } as const;
const maxAssets = { type: "max_assets", value: "10" } as const;
const minAssets = { type: "min_assets", value: "1" } as const;
const cases = [
  {
    intent: {
      ...base,
      action: "midnight.lend",
      amount: units,
      guard: maxAssets,
      funding,
    },
    tx: midnightTakeLend({
      ...args,
      target: buyTarget,
      maxContinuousFee: 0n,
      takeableOffers: [takeable(false)],
    }),
  },
  {
    intent: {
      ...base,
      action: "midnight.borrow",
      amount: units,
      guard: minAssets,
    },
    receiver: true,
    tx: midnightTakeBorrow({
      ...args,
      target: sellTarget,
      receiver: account,
      takeableOffers: [takeable(true)],
    }),
  },
  {
    intent: {
      ...base,
      action: "midnight.repay",
      type: "direct",
      amount: assets,
      funding,
    },
    tx: midnightRepayWithdrawCollateral({
      ...args,
      repay: { type: "assets", assets: 10n },
      collateralWithdrawals: [],
      collateralReceiver: account,
    }),
  },
  {
    intent: {
      ...base,
      action: "midnight.market_repay",
      type: "market",
      amount: units,
      guard: maxAssets,
      funding,
    },
    tx: midnightTakeRepayWithdrawCollateral({
      ...args,
      target: buyTarget,
      repayEnabled: false,
      maxContinuousFee: 0n,
      takeableOffers: [takeable(false)],
      collateralWithdrawals: [],
      collateralReceiver: account,
    }),
  },
  {
    intent: {
      ...base,
      action: "midnight.withdraw",
      amount: units,
      guard: minAssets,
    },
    receiver: true,
    tx: midnightTakeWithdraw({
      ...args,
      target: sellTarget,
      receiver: account,
      takeableOffers: [takeable(true)],
    }),
  },
  {
    intent: { ...base, action: "midnight.redeem", amount: units },
    receiver: true,
    tx: midnightRedeem({ ...args, units: 10n, onBehalf: account }),
  },
  {
    intent: {
      ...base,
      action: "midnight.supply_collateral",
      ...collateralTransfer,
    },
    receiver: true,
    tx: midnightSupplyCollateral({
      ...args,
      collateralIndex: 0n,
      assets: 10n,
      onBehalf: account,
    }),
  },
  {
    intent: {
      ...base,
      action: "midnight.withdraw_collateral",
      collateral_withdrawals: [collateralTransfer],
    },
    receiver: true,
    tx: midnightWithdrawCollateral({
      ...args,
      collateralIndex: 0n,
      assets: 10n,
      onBehalf: account,
      receiver: account,
    }),
  },
] as const satisfies readonly {
  intent: CalldataIntent;
  receiver?: true;
  tx: Parameters<typeof sdkCall>[0];
}[];

it("rejects a fill from a different market in an SDK-built Midnight borrow", () => {
  const { intent, tx } = cases[1];
  const call = sdkCall(tx);
  const abi = midnightBundlesV2Abi;
  const { functionName, args: decodedArgs } = decodeFunctionData({
    abi,
    data: call.data,
  });
  if (
    functionName !== "midnightBundlesV2SupplyCollateralAndSellWithUnitsTarget"
  ) {
    throw new Error(`Unexpected function: ${functionName}`);
  }
  const [
    bundleMarket,
    target,
    bound,
    reduceOnly,
    receiver,
    supplies,
    fills,
    ...rest
  ] = decodedArgs;
  expect(fills).toHaveLength(1);
  const data = encodeFunctionData({
    abi,
    functionName,
    args: [
      bundleMarket,
      target,
      bound,
      reduceOnly,
      receiver,
      supplies,
      fills.map((fill) => ({
        ...fill,
        offer: {
          ...fill.offer,
          market: {
            ...fill.offer.market,
            maturity: fill.offer.market.maturity + 1n,
          },
        },
      })),
      ...rest,
    ],
  });
  expect(() => verifyCalldata(intent, [{ ...call, data }])).toThrow(
    expect.objectContaining({
      constructor: CalldataTargetError,
      field: "market",
    }),
  );
});

it.each([
  { action: "midnight.withdraw", reduceOnly: false },
  { action: "midnight.borrow", reduceOnly: true },
])("rejects reduceOnly=$reduceOnly for $action", ({ action, reduceOnly }) => {
  const fixture = cases.find((row) => row.intent.action === action);
  if (fixture === undefined) throw new Error(`Missing fixture: ${action}`);
  const { intent, tx } = fixture;
  const call = sdkCall(tx);
  const abi = midnightBundlesV2Abi;
  const { functionName, args: decodedArgs } = decodeFunctionData({
    abi,
    data: call.data,
  });
  if (
    functionName !== "midnightBundlesV2SupplyCollateralAndSellWithUnitsTarget"
  ) {
    throw new Error(`Unexpected function: ${functionName}`);
  }
  const [bundleMarket, target, bound, originalReduceOnly, ...rest] =
    decodedArgs;
  expect(originalReduceOnly).toBe(!reduceOnly);
  const data = encodeFunctionData({
    abi,
    functionName,
    args: [bundleMarket, target, bound, reduceOnly, ...rest],
  });
  expect(() => verifyCalldata(intent, [{ ...call, data }])).toThrow(
    expect.objectContaining({
      constructor: CalldataCallError,
      field: "offers",
    }),
  );
});

it.each(cases)(
  "verifies SDK-built $intent.action and rejects modified parameters",
  (row) => {
    const { intent, tx } = row;
    const call = sdkCall(tx);
    expect(
      verifyCalldata(intent, [call]).map((decoded) => decoded.call),
    ).toEqual([call]);
    expect(() => verifyCalldata({ ...intent, chain_id: 0 }, [call])).toThrow(
      CalldataChainError,
    );
    expect(() =>
      verifyCalldata({ ...intent, market: zeroHash }, [call]),
    ).toThrow(CalldataTargetError);
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
    if (
      intent.action === "midnight.repay" ||
      intent.action === "midnight.supply_collateral"
    ) {
      expect(() =>
        verifyCalldata({ ...intent, amount: { unit: "assets", value: "9" } }, [
          call,
        ]),
      ).toThrow(CalldataAmountError);
    } else if ("amount" in intent) {
      expect(() =>
        verifyCalldata(
          {
            ...intent,
            amount: { ...intent.amount, value: "9" },
          },
          [call],
        ),
      ).toThrow(CalldataAmountError);
    } else {
      expect(() =>
        verifyCalldata(
          {
            ...intent,
            collateral_withdrawals: [
              { ...collateralTransfer, amount: { ...assets, value: "9" } },
            ],
          },
          [call],
        ),
      ).toThrow(CalldataAmountError);
    }
    if ("receiver" in row) {
      expect(() =>
        verifyCalldata({ ...intent, account: maker }, [call]),
      ).toThrow(CalldataRecipientError);
    }
  },
);

it("verifies SDK-built native midnight.supply_collateral and rejects modified parameters", () => {
  const intent = {
    ...base,
    action: "midnight.supply_collateral",
    ...collateralTransfer,
    funding: { type: "native", max_native_assets: "10" },
    expires_at: Number(deadline),
  } as const satisfies CalldataIntent;
  const call = sdkCall(
    midnightSupplyCollateralWithNative({
      ...args,
      collateralIndex: 0n,
      assets: 10n,
      accountAddress: account,
      nativeAmount: 10n,
    }),
  );
  expect(verifyCalldata(intent, [call]).map((decoded) => decoded.call)).toEqual(
    [call],
  );
  expect(
    verifyCalldata(
      { ...intent, funding: { type: "auto", max_native_assets: "10" } },
      [call],
    ).map((decoded) => decoded.call),
  ).toEqual([call]);
  expect(() => verifyCalldata({ ...intent, chain_id: 0 }, [call])).toThrow(
    CalldataChainError,
  );
  expect(() => verifyCalldata({ ...intent, market: zeroHash }, [call])).toThrow(
    CalldataTargetError,
  );
  expect(() => verifyCalldata(intent, [{ ...call, to: maker }])).toThrow(
    CalldataTargetError,
  );
  expect(() =>
    verifyCalldata(intent, [{ ...call, data: "0xdeadbeef" }]),
  ).toThrow(CalldataDecodeError);
  expect(() => verifyCalldata(intent, [{ ...call, value: "0" }])).toThrow(
    CalldataAmountError,
  );
  expect(() => verifyCalldata(intent, [{ ...call, value: "11" }])).toThrow(
    CalldataAmountError,
  );
  expect(() =>
    verifyCalldata({ ...intent, funding: { type: "erc20" } }, [call]),
  ).toThrow(CalldataAmountError);
  expect(() =>
    verifyCalldata({ ...intent, funding: undefined }, [call]),
  ).toThrow(CalldataAmountError);
  expect(() =>
    verifyCalldata({ ...intent, amount: { unit: "assets", value: "9" } }, [
      call,
    ]),
  ).toThrow(CalldataAmountError);
  expect(() => verifyCalldata(intent, [])).toThrow(CalldataCallError);
});
