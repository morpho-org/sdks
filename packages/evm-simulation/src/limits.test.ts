import type { Hex } from "viem";
import { expectTypeOf } from "vitest";
import {
  BLUE_MARKET_OPERATION_TYPES,
  type BlueMarketOperationType,
  type BluePositionBounds,
  type CheckedOperationLimit,
  type FEELESS_INPUT_TYPES,
  type FeelessInputType,
  type MidnightDebtPositionBounds,
  type MidnightPositionBounds,
  type MidnightRedeemSubject,
  type MidnightRepayWithdrawCollateralSubject,
  type MidnightSellSubject,
  OPERATION_TYPES,
  type OperationLimit,
  type OperationType,
  type REALLOCATION_PENALTY_TYPES,
  type ReallocationPenaltyInputType,
  type SimulationInputLimits,
  type SimulationLimits,
  type SlippageLimits,
  type SlippageQuote,
  VAULT_OPERATION_TYPES,
  type VaultOperationType,
} from "./limits.js";
import type { SimulateInputParams, SimulateParams } from "./params.js";
import type {
  VerifiedSimulationInputResult,
  VerifiedSimulationResult,
} from "./result.js";
import { simulate } from "./simulate/simulate.js";
import type { SimulationConfig } from "./types.js";

test("fee and penalty input arrays cover their public unions", () => {
  expectTypeOf<
    (typeof REALLOCATION_PENALTY_TYPES)[number]
  >().toEqualTypeOf<ReallocationPenaltyInputType>();
  expectTypeOf<
    (typeof FEELESS_INPUT_TYPES)[number]
  >().toEqualTypeOf<FeelessInputType>();
});

type MidnightSellLimit = Extract<
  OperationLimit,
  { type: "midnightTakeBorrow" | "midnightTakeWithdraw" }
>;
type MidnightRedeemLimit = Extract<OperationLimit, { type: "midnightRedeem" }>;
type MidnightRepayWithdrawCollateralLimit = Extract<
  OperationLimit,
  { type: "midnightRepayWithdrawCollateral" }
>;

describe("OPERATION_TYPES", () => {
  test("minor release preserves quote-only exported limit readers", () => {
    expectTypeOf<
      Awaited<ReturnType<typeof simulate>>
    >().toEqualTypeOf<VerifiedSimulationResult>();
    expectTypeOf<
      Parameters<typeof simulate>[1]
    >().toEqualTypeOf<SimulateParams>();
    expectTypeOf<
      SimulationLimits["operations"][number]
    >().toEqualTypeOf<OperationLimit>();
    expectTypeOf<
      CheckedOperationLimit["quote"]
    >().toEqualTypeOf<SlippageQuote>();
    const limits: SimulationLimits = { operations: [] };
    expect(
      limits.operations.map((operation) => operation.quote.assetsPaid),
    ).toEqual([]);
    const quoted = (config: SimulationConfig, quoteLimits: SimulationLimits) =>
      simulate(config, { chainId: 1, transactions: [], limits: quoteLimits });
    const inputs = (
      config: SimulationConfig,
      inputLimits: SimulationInputLimits,
    ) =>
      simulate(config, { chainId: 1, transactions: [], limits: inputLimits });
    expectTypeOf<ReturnType<typeof quoted>>().toEqualTypeOf<
      Promise<VerifiedSimulationResult>
    >();
    expectTypeOf<ReturnType<typeof inputs>>().toEqualTypeOf<
      Promise<VerifiedSimulationInputResult>
    >();
    const quotedWrapper = (
      config: SimulationConfig,
      params: SimulateParams,
    ): Promise<VerifiedSimulationResult> => simulate(config, params);
    const inputWrapper = (
      config: SimulationConfig,
      params: SimulateInputParams,
    ) => simulate(config, params);
    expectTypeOf<ReturnType<typeof quotedWrapper>>().toEqualTypeOf<
      Promise<VerifiedSimulationResult>
    >();
    expectTypeOf<ReturnType<typeof inputWrapper>>().toEqualTypeOf<
      Promise<VerifiedSimulationInputResult>
    >();
    expectTypeOf<
      Exclude<SimulateParams["limits"], "none">["operations"][number]["quote"]
    >().toEqualTypeOf<SlippageQuote>();
  });
  test("behavior: operation groups partition OPERATION_TYPES", () => {
    expectTypeOf<SlippageLimits["position"]>().toEqualTypeOf<
      BluePositionBounds | undefined
    >();
    expectTypeOf<MidnightRedeemSubject["marketId"]>().toEqualTypeOf<Hex>();
    expectTypeOf<MidnightRedeemLimit["position"]>().toEqualTypeOf<
      (BluePositionBounds & MidnightPositionBounds) | undefined
    >();
    expectTypeOf<
      MidnightRepayWithdrawCollateralSubject["marketId"]
    >().toEqualTypeOf<Hex>();
    expectTypeOf<
      MidnightRepayWithdrawCollateralLimit["marketId"]
    >().toEqualTypeOf<Hex>();
    expectTypeOf<
      MidnightRepayWithdrawCollateralLimit["position"]
    >().toEqualTypeOf<
      (BluePositionBounds & MidnightDebtPositionBounds) | undefined
    >();
    expectTypeOf<MidnightSellSubject["marketId"]>().toEqualTypeOf<Hex>();
    expectTypeOf<MidnightSellLimit["marketId"]>().toEqualTypeOf<Hex>();
    expectTypeOf<MidnightSellLimit["account"]>().toEqualTypeOf<undefined>();
    expectTypeOf<MidnightSellLimit["position"]>().toEqualTypeOf<undefined>();
    expectTypeOf<
      MidnightRepayWithdrawCollateralLimit["account"]
    >().toEqualTypeOf<undefined>();
    expectTypeOf<
      MidnightRepayWithdrawCollateralLimit["assetPaid"]
    >().toEqualTypeOf<undefined>();
    expectTypeOf<
      MidnightRepayWithdrawCollateralLimit["assetReceived"]
    >().toEqualTypeOf<undefined>();
    expectTypeOf<OperationLimit["type"]>().toEqualTypeOf<
      | BlueMarketOperationType
      | VaultOperationType
      | "blueRefinance"
      | "vaultV1MigrateToV2"
      | "midnightSupplyCollateral"
      | "midnightSupplyBlueMakeLend"
      | "midnightRedeem"
      | "midnightTakeLend"
      | "midnightTakeBorrow"
      | "midnightTakeWithdraw"
      | "midnightSupplyCollateralTakeBorrow"
      | "midnightRepayWithdrawCollateral"
      | "midnightTakeRepayWithdrawCollateral"
    >();
    expectTypeOf<
      | BlueMarketOperationType
      | VaultOperationType
      | "blueRefinance"
      | "vaultV1MigrateToV2"
      | "midnightSupplyCollateral"
      | "midnightSupplyBlueMakeLend"
      | "midnightRedeem"
      | "midnightTakeLend"
      | "midnightTakeBorrow"
      | "midnightTakeWithdraw"
      | "midnightSupplyCollateralTakeBorrow"
      | "midnightRepayWithdrawCollateral"
      | "midnightTakeRepayWithdrawCollateral"
    >().toEqualTypeOf<OperationType>();
    expect(
      [
        ...BLUE_MARKET_OPERATION_TYPES,
        "blueRefinance",
        ...VAULT_OPERATION_TYPES,
        "vaultV1MigrateToV2",
        "midnightSupplyCollateral",
        "midnightSupplyBlueMakeLend",
        "midnightRedeem",
        "midnightTakeLend",
        "midnightTakeBorrow",
        "midnightTakeWithdraw",
        "midnightSupplyCollateralTakeBorrow",
        "midnightRepayWithdrawCollateral",
        "midnightTakeRepayWithdrawCollateral",
      ].sort(),
    ).toEqual([...OPERATION_TYPES].sort());
    expect([...OPERATION_TYPES]).toEqual([
      "blueSupply",
      "blueWithdraw",
      "blueSupplyCollateral",
      "blueBorrow",
      "blueSupplyCollateralBorrow",
      "blueRepay",
      "blueWithdrawCollateral",
      "blueRepayWithdrawCollateral",
      "blueRefinance",
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
      "vaultV1MigrateToV2",
      "midnightSupplyCollateral",
      "midnightSupplyBlueMakeLend",
      "midnightRedeem",
      "midnightTakeLend",
      "midnightTakeBorrow",
      "midnightTakeWithdraw",
      "midnightSupplyCollateralTakeBorrow",
      "midnightRepayWithdrawCollateral",
      "midnightTakeRepayWithdrawCollateral",
    ]);
  });
});
