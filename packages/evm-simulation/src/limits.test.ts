import { expectTypeOf } from "vitest";
import {
  BLUE_MARKET_OPERATION_TYPES,
  type BlueMarketOperationType,
  OPERATION_TYPES,
  type OperationLimit,
  type OperationType,
  VAULT_OPERATION_TYPES,
  type VaultOperationType,
} from "./limits.js";

describe("OPERATION_TYPES", () => {
  test("behavior: operation groups partition OPERATION_TYPES", () => {
    expectTypeOf<OperationLimit["type"]>().toEqualTypeOf<
      | BlueMarketOperationType
      | VaultOperationType
      | "blueRefinance"
      | "vaultV1MigrateToV2"
    >();
    expectTypeOf<
      | BlueMarketOperationType
      | VaultOperationType
      | "blueRefinance"
      | "blueAuthorization"
      | "vaultV1MigrateToV2"
    >().toEqualTypeOf<OperationType>();
    expect(
      [
        ...BLUE_MARKET_OPERATION_TYPES,
        "blueRefinance",
        "blueAuthorization",
        ...VAULT_OPERATION_TYPES,
        "vaultV1MigrateToV2",
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
      "blueAuthorization",
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
    ]);
  });
});
