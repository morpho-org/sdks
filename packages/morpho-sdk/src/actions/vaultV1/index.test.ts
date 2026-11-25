import { expect, test } from "vitest";
import * as sdk from "../../index.js";
import * as actions from "./index.js";

test("Vault V1 barrels expose only the established standalone builders", () => {
  expect(Object.keys(actions).sort()).toEqual([
    "vaultV1Deposit",
    "vaultV1InKindRedeem",
    "vaultV1MigrateToV2",
    "vaultV1Redeem",
    "vaultV1Withdraw",
  ]);
});

test.each([
  "parseBundlesCommon",
  "parseBundlesFundingMode",
  "parseBundlesFundingAssets",
  "parseBundlesFunding",
  "getParsedBundlesSharesPermit",
  "parseVaultV1MaxSharePrice",
  "parseVaultV1DepositInput",
  "buildVaultV1Deposit",
  "parseVaultV1Withdraw",
  "parseVaultV1WithdrawInput",
  "buildVaultV1Withdraw",
  "parseVaultV1Redeem",
  "parseVaultV1RedeemInput",
  "buildVaultV1Redeem",
  "parseVaultV1InKindRedeemAmount",
  "parseVaultV1InKindRedeem",
  "parseVaultV1InKindRedeemInput",
  "parseVaultV1InKindRedeemMarkets",
  "buildVaultV1InKindRedeem",
  "parseVaultV1MigrationAmount",
  "parseVaultV1MigrationBounds",
  "parseVaultV1MigrateToV2",
  "parseVaultV1MigrateToV2Input",
  "buildVaultV1MigrateToV2",
])("does not expose %s from the package root", (name) => {
  expect(sdk).not.toHaveProperty(name);
});
