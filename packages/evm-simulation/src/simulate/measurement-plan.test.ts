import { MarketParams } from "@morpho-org/blue-sdk";
import { zeroAddress } from "viem";
import { describe, expect, test } from "vitest";
import type { OperationLimit } from "../limits.js";
import { operationMeasurementPlan } from "./measurement-plan.js";

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

const market = (
  id: typeof marketId | typeof sourceMarketId | typeof targetMarketId,
  asset: "loan" | "collateral",
) => ({ type: "market", marketId: id, asset });
const position = (
  id: typeof marketId | typeof sourceMarketId | typeof targetMarketId,
  shares: "supplyShares" | "borrowShares",
) => ({ type: "position", marketId: id, shares });
const balance = (token: string) => ({ type: "balance", token });
const vaultSource = (address: string) => ({ type: "vault", vault: address });

const cases: {
  readonly type: OperationLimit["type"];
  readonly expected: {
    readonly subject: unknown;
    readonly assetsPaid: unknown;
    readonly assetsReceived: unknown;
    readonly sharesMinted?: unknown;
    readonly sharesBurned?: unknown;
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
  ...(["blueSupplyCollateral", "blueWithdrawCollateral"] as const).map(
    (type) => ({
      type,
      expected: {
        subject: { operation: type, marketId },
        assetsPaid: market(marketId, "collateral"),
        assetsReceived: market(marketId, "collateral"),
      },
    }),
  ),
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
];

const limitFor = (type: OperationLimit["type"]): OperationLimit =>
  ({
    type,
    marketId,
    sourceMarketId,
    targetMarketId,
    vault,
    sourceVault,
    targetVault,
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
