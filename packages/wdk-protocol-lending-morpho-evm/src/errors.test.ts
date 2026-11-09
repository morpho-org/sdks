import { expect, test } from "vitest";
import * as errors from "./errors.js";
import * as publicApi from "./index.js";

const fixtures = {
  BlueBundlesV1DeadlineExceedsWindowError:
    new errors.BlueBundlesV1DeadlineExceedsWindowError(2n, 1n),
  MissingWalletProviderError: new errors.MissingWalletProviderError(),
  PaymasterApprovalSpenderMismatchError:
    new errors.PaymasterApprovalSpenderMismatchError(undefined, undefined),
  PaymasterApprovalGuardUnavailableError:
    new errors.PaymasterApprovalGuardUnavailableError("_getSmartAccount"),
  UnconfirmedBroadcastError: new errors.UnconfirmedBroadcastError(
    "0x01",
    "0x01",
    new Error("send failed"),
  ),
  InvalidTransactionMaxFeeError: new errors.InvalidTransactionMaxFeeError(-1n),
  InvalidTransactionHashError: new errors.InvalidTransactionHashError(
    undefined,
  ),
  InvalidAmountTypeError: new errors.InvalidAmountTypeError("amount"),
  UnsafeAmountError: new errors.UnsafeAmountError("amount"),
  InvalidAddressError: new errors.InvalidAddressError("token"),
  InvalidProtocolOptionError: new errors.InvalidProtocolOptionError(
    "Invalid chainId.",
  ),
  MissingMorphoTargetError: new errors.MissingMorphoTargetError(
    "Configure a target.",
  ),
  ReadOnlyAccountError: new errors.ReadOnlyAccountError(
    "Connect a writable wallet.",
  ),
  MarketTokenMismatchError: new errors.MarketTokenMismatchError({
    token: "0x01",
    expectedToken: "0x02",
    kind: "loan",
  }),
  InsufficientTokenBalanceError: new errors.InsufficientTokenBalanceError(),
} satisfies Record<keyof typeof errors, Error>;

test.each(Object.entries(fixtures))(
  "%s is named and publicly exported",
  (name, error) => {
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe(name);
    expect(Reflect.get(publicApi, name)).toBe(Reflect.get(errors, name));
    expect(error).toBeInstanceOf(Reflect.get(publicApi, name));
  },
);

test("errors declared alongside the adapter retain their names", () => {
  for (const error of [
    new publicApi.MixedBlueCollateralFundingError(),
    new publicApi.UnresolvedVaultWithdrawRequirementsError(1),
  ]) {
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe(error.constructor.name);
  }
  for (const error of [
    new publicApi.NonPositiveInputError("amount", 0n),
    new publicApi.AddressMismatchError("0x01", "0x02"),
  ]) {
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe(error.constructor.name);
  }
});
