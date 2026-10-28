import { MarketParams } from "@morpho-org/blue-sdk";
import { type Hex, zeroAddress } from "viem";
import { describe, expect, test } from "vitest";
import { OPERATION_TYPES, type OperationLimit } from "../limits.js";
import {
  operationMeasurementPlan,
  positionBoundsMarketField,
  sharePriceMeasurement,
} from "./measurement-plan.js";

const loan = "0x0000000000000000000000000000000000000001";
const collateral = "0x0000000000000000000000000000000000000002";
const vault = "0x0000000000000000000000000000000000000003";
const sourceVault = "0x0000000000000000000000000000000000000004";
const targetVault = "0x0000000000000000000000000000000000000005";
const marketId = new MarketParams({
  loanToken: loan,
  collateralToken: collateral,
  oracle: zeroAddress,
  irm: zeroAddress,
  lltv: 0n,
}).id;
const sourceMarketId = new MarketParams({
  loanToken: loan,
  collateralToken: vault,
  oracle: zeroAddress,
  irm: zeroAddress,
  lltv: 0n,
}).id;
const targetMarketId = new MarketParams({
  loanToken: vault,
  collateralToken: loan,
  oracle: zeroAddress,
  irm: zeroAddress,
  lltv: 0n,
}).id;
const midnightMarketId: Hex = `0x${"11".repeat(32)}`;

const market = (
  id: typeof marketId | typeof sourceMarketId | typeof targetMarketId,
  asset: "loan" | "collateral",
) => ({ type: "market", marketId: id, asset });
const position = (
  id: typeof marketId | typeof sourceMarketId | typeof targetMarketId,
  shares: "supplyShares" | "borrowShares" | "collateral",
) => ({ type: "position", marketId: id, shares });
const balance = (token: string) => ({ type: "balance", token });
const vaultSource = (address: string) => ({ type: "vault", vault: address });
const midnightCollateral = {
  type: "midnightCollateral",
  marketId: midnightMarketId,
  collateralIndex: 1n,
};
const directToken = { type: "token", token: loan };

const cases: {
  readonly type: OperationLimit["type"];
  readonly expected: {
    readonly subject: unknown;
    readonly assetsPaid: unknown;
    readonly assetsReceived?: unknown;
    readonly sharesMinted?: unknown;
    readonly sharesBurned?: unknown;
    readonly collateralSupplied?: unknown;
    readonly collateralWithdrawn?: unknown;
    readonly creditRedeemed?: unknown;
    readonly debtRepaid?: unknown;
    readonly unitsSold?: unknown;
    readonly unitsBought?: unknown;
  };
}[] = [
  ...(["blueSupply", "blueWithdraw"] as const).map((type) => ({
    type,
    expected: {
      subject: { operation: type, marketId },
      assetsPaid: market(marketId, "loan"),
      assetsReceived: market(marketId, "loan"),
      sharesMinted: position(marketId, "supplyShares"),
      sharesBurned: position(marketId, "supplyShares"),
    },
  })),
  {
    type: "blueSupplyCollateral",
    expected: {
      subject: { operation: "blueSupplyCollateral", marketId },
      assetsPaid: market(marketId, "collateral"),
      assetsReceived: market(marketId, "collateral"),
      collateralSupplied: position(marketId, "collateral"),
    },
  },
  {
    type: "blueWithdrawCollateral",
    expected: {
      subject: { operation: "blueWithdrawCollateral", marketId },
      assetsPaid: market(marketId, "collateral"),
      assetsReceived: market(marketId, "collateral"),
      collateralWithdrawn: position(marketId, "collateral"),
    },
  },
  ...(["blueBorrow", "blueRepay"] as const).map((type) => ({
    type,
    expected: {
      subject: { operation: type, marketId },
      assetsPaid: market(marketId, "loan"),
      assetsReceived: market(marketId, "loan"),
      sharesMinted: position(marketId, "borrowShares"),
      sharesBurned: position(marketId, "borrowShares"),
    },
  })),
  {
    type: "blueSupplyCollateralBorrow",
    expected: {
      subject: { operation: "blueSupplyCollateralBorrow", marketId },
      assetsPaid: market(marketId, "collateral"),
      assetsReceived: market(marketId, "loan"),
      sharesMinted: position(marketId, "borrowShares"),
      sharesBurned: position(marketId, "borrowShares"),
      collateralSupplied: position(marketId, "collateral"),
    },
  },
  {
    type: "blueRepayWithdrawCollateral",
    expected: {
      subject: { operation: "blueRepayWithdrawCollateral", marketId },
      assetsPaid: market(marketId, "loan"),
      assetsReceived: market(marketId, "collateral"),
      sharesMinted: position(marketId, "borrowShares"),
      sharesBurned: position(marketId, "borrowShares"),
      collateralWithdrawn: position(marketId, "collateral"),
    },
  },
  {
    type: "blueRefinance",
    expected: {
      subject: {
        operation: "blueRefinance",
        sourceMarketId,
        targetMarketId,
      },
      assetsPaid: market(sourceMarketId, "loan"),
      assetsReceived: market(sourceMarketId, "loan"),
      sharesMinted: position(targetMarketId, "borrowShares"),
      sharesBurned: position(sourceMarketId, "borrowShares"),
    },
  },
  ...(
    [
      "vaultV1Deposit",
      "vaultV2Deposit",
      "vaultV1Withdraw",
      "vaultV2Withdraw",
      "vaultV1Redeem",
      "vaultV2Redeem",
      "vaultV2ForceWithdraw",
      "vaultV2ForceRedeem",
      "vaultV1InKindRedeem",
      "vaultV2InKindRedeem",
    ] as const
  ).map((type) => ({
    type,
    expected: {
      subject: { operation: type, vault },
      assetsPaid: vaultSource(vault),
      assetsReceived: vaultSource(vault),
      sharesMinted: balance(vault),
      sharesBurned: balance(vault),
    },
  })),
  {
    type: "vaultV1MigrateToV2",
    expected: {
      subject: {
        operation: "vaultV1MigrateToV2",
        sourceVault,
        targetVault,
      },
      assetsPaid: vaultSource(sourceVault),
      assetsReceived: vaultSource(sourceVault),
      sharesMinted: balance(targetVault),
      sharesBurned: balance(sourceVault),
    },
  },
  {
    type: "midnightSupplyCollateral",
    expected: {
      subject: {
        operation: "midnightSupplyCollateral",
        marketId: midnightMarketId,
        collateralIndex: 1n,
      },
      assetsPaid: midnightCollateral,
      assetsReceived: midnightCollateral,
      collateralSupplied: midnightCollateral,
    },
  },
  {
    type: "midnightSupplyBlueMakeLend",
    expected: {
      subject: {
        operation: "midnightSupplyBlueMakeLend",
        loanToken: loan,
        marketId,
        callbackSalt: midnightMarketId,
      },
      assetsPaid: directToken,
      assetsReceived: directToken,
      sharesMinted: position(marketId, "supplyShares"),
    },
  },
  {
    type: "midnightRedeem",
    expected: {
      subject: { operation: "midnightRedeem", marketId: midnightMarketId },
      assetsPaid: { type: "midnightLoan", marketId: midnightMarketId },
      assetsReceived: { type: "midnightLoan", marketId: midnightMarketId },
      creditRedeemed: { type: "midnightCredit", marketId: midnightMarketId },
    },
  },
  {
    type: "midnightTakeLend",
    expected: {
      subject: { operation: "midnightTakeLend", marketId },
      assetsPaid: { type: "midnightLoan", marketId },
      unitsBought: { type: "midnightNet", marketId },
    },
  },
  {
    type: "midnightTakeBorrow",
    expected: {
      subject: { operation: "midnightTakeBorrow", marketId: midnightMarketId },
      assetsPaid: { type: "midnightLoan", marketId: midnightMarketId },
      assetsReceived: { type: "midnightLoan", marketId: midnightMarketId },
      unitsSold: { type: "midnightNet", marketId: midnightMarketId },
    },
  },
  {
    type: "midnightTakeWithdraw",
    expected: {
      subject: {
        operation: "midnightTakeWithdraw",
        marketId: midnightMarketId,
      },
      assetsPaid: { type: "midnightLoan", marketId: midnightMarketId },
      assetsReceived: { type: "midnightLoan", marketId: midnightMarketId },
      creditRedeemed: { type: "midnightCredit", marketId: midnightMarketId },
    },
  },
  {
    type: "midnightSupplyCollateralTakeBorrow",
    expected: {
      subject: { operation: "midnightSupplyCollateralTakeBorrow", marketId },
      assetsPaid: undefined,
      assetsReceived: { type: "midnightLoan", marketId },
      unitsSold: { type: "midnightNet", marketId },
    },
  },
  {
    type: "midnightRepayWithdrawCollateral",
    expected: {
      subject: {
        operation: "midnightRepayWithdrawCollateral",
        marketId: midnightMarketId,
      },
      assetsPaid: { type: "midnightLoan", marketId: midnightMarketId },
      debtRepaid: { type: "midnightDebt", marketId: midnightMarketId },
    },
  },
  {
    type: "midnightTakeRepayWithdrawCollateral",
    expected: {
      subject: {
        operation: "midnightTakeRepayWithdrawCollateral",
        marketId,
      },
      assetsPaid: { type: "midnightLoan", marketId },
      debtRepaid: { type: "midnightDebt", marketId },
    },
  },
];

const limitFor = (type: OperationLimit["type"]): OperationLimit =>
  ({
    type,
    marketId:
      type === "midnightSupplyCollateral" ||
      type === "midnightRedeem" ||
      type === "midnightTakeBorrow" ||
      type === "midnightTakeWithdraw" ||
      type === "midnightRepayWithdrawCollateral"
        ? midnightMarketId
        : marketId,
    sourceMarketId,
    targetMarketId,
    vault,
    sourceVault,
    targetVault,
    collateralIndex: 1n,
    loanToken: loan,
    callbackSalt: midnightMarketId,
    quote: { assetsPaid: 1n },
    slippageTolerance: 0n,
  }) as OperationLimit;

describe("operationMeasurementPlan", () => {
  test.each(cases)(
    "behavior: %s plans the expected sources",
    ({ type, expected }) => {
      expect(operationMeasurementPlan(limitFor(type))).toEqual(expected);
    },
  );
});
describe("positionBoundsMarketField", () => {
  test.each([
    ["blueSupply", "marketId"],
    ["blueRefinance", "targetMarketId"],
    ["vaultV1Deposit", undefined],
    ["vaultV1MigrateToV2", undefined],
    ["midnightSupplyCollateral", undefined],
    ["midnightRedeem", undefined],
    ["midnightRepayWithdrawCollateral", undefined],
    ["midnightTakeRepayWithdrawCollateral", undefined],
  ] as const)(
    "behavior: position bounds for %s use %s",
    (type, expectedField) => {
      expect(positionBoundsMarketField(type)).toBe(expectedField);
    },
  );
});

describe("sharePriceMeasurement", () => {
  const payPerMinted = {
    assets: "assetsPaid",
    shares: "sharesMinted",
    higherIsAdverse: true,
  };
  const receivePerBurned = {
    assets: "assetsReceived",
    shares: "sharesBurned",
    higherIsAdverse: false,
  };
  const receivePerMinted = {
    assets: "assetsReceived",
    shares: "sharesMinted",
    higherIsAdverse: false,
  };
  const payPerBurned = {
    assets: "assetsPaid",
    shares: "sharesBurned",
    higherIsAdverse: true,
  };
  const sharePriceCases = [
    { type: "blueSupply", expected: payPerMinted },
    { type: "blueWithdraw", expected: receivePerBurned },
    { type: "blueSupplyCollateral", expected: undefined },
    { type: "blueBorrow", expected: receivePerMinted },
    { type: "blueSupplyCollateralBorrow", expected: receivePerMinted },
    { type: "blueRepay", expected: payPerBurned },
    { type: "blueWithdrawCollateral", expected: undefined },
    { type: "blueRepayWithdrawCollateral", expected: payPerBurned },
    { type: "blueRefinance", expected: undefined },
    { type: "vaultV1Deposit", expected: payPerMinted },
    { type: "vaultV2Deposit", expected: payPerMinted },
    { type: "vaultV1Withdraw", expected: receivePerBurned },
    { type: "vaultV2Withdraw", expected: receivePerBurned },
    { type: "vaultV1Redeem", expected: receivePerBurned },
    { type: "vaultV2Redeem", expected: receivePerBurned },
    { type: "vaultV2ForceWithdraw", expected: receivePerBurned },
    { type: "vaultV2ForceRedeem", expected: receivePerBurned },
    { type: "vaultV1InKindRedeem", expected: undefined },
    { type: "vaultV2InKindRedeem", expected: undefined },
    { type: "vaultV1MigrateToV2", expected: undefined },
    { type: "midnightSupplyCollateral", expected: undefined },
    { type: "midnightSupplyBlueMakeLend", expected: undefined },
    { type: "midnightRedeem", expected: undefined },
    { type: "midnightTakeLend", expected: undefined },
    { type: "midnightTakeBorrow", expected: undefined },
    { type: "midnightTakeWithdraw", expected: undefined },
    { type: "midnightSupplyCollateralTakeBorrow", expected: undefined },
    { type: "midnightRepayWithdrawCollateral", expected: undefined },
    { type: "midnightTakeRepayWithdrawCollateral", expected: undefined },
  ] as const;
  test.each(sharePriceCases)(
    "behavior: %s prices $expected",
    ({ type, expected }) => {
      expect(sharePriceMeasurement(type)).toEqual(expected);
    },
  );
  test("coverage: every OperationType is listed", () => {
    expect(sharePriceCases.map(({ type }) => type).sort()).toEqual(
      [...OPERATION_TYPES].sort(),
    );
  });
});
