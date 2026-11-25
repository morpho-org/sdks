import { expect, test } from "vitest";
import * as sdk from "../../index.js";
import * as actions from "./index.js";

test("Vault V2 barrels expose only the established standalone builders", () => {
  expect(Object.keys(actions).sort()).toEqual([
    "vaultV2Deposit",
    "vaultV2ForceRedeem",
    "vaultV2ForceWithdraw",
    "vaultV2InKindRedeem",
    "vaultV2Redeem",
    "vaultV2Withdraw",
  ]);
});

test.each([
  "parseBundlesCommon",
  "parseBundlesFundingMode",
  "parseBundlesFundingAssets",
  "parseBundlesFunding",
  "getParsedBundlesSharesPermit",
  "parseVaultV2MaxSharePrice",
  "parseVaultV2DepositInput",
  "buildVaultV2Deposit",
  "parseVaultV2Withdraw",
  "parseVaultV2WithdrawInput",
  "buildVaultV2Withdraw",
  "parseVaultV2Redeem",
  "parseVaultV2RedeemInput",
  "buildVaultV2Redeem",
  "parseVaultV2ForceRedeem",
  "buildVaultV2ForceRedeem",
  "parseVaultV2ForceWithdrawAssets",
  "parseVaultV2ForceWithdraw",
  "parseVaultV2ForceWithdrawInput",
  "buildVaultV2ForceWithdraw",
  "parseVaultV2InKindRedeemAmount",
  "parseVaultV2InKindRedeem",
  "parseVaultV2InKindRedeemInput",
  "buildVaultV2InKindRedeem",
])("does not expose %s from the package root", (name) => {
  expect(sdk).not.toHaveProperty(name);
});
