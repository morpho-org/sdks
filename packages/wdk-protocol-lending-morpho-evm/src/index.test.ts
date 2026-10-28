import { UnknownTokenError as SdkUnknownTokenError } from "@morpho-org/blue-sdk";
import {
  MalformedTokenMetadataError as SdkMalformedTokenMetadataError,
  MissingPermitDomainNameError as SdkMissingPermitDomainNameError,
} from "@morpho-org/blue-sdk-viem";
import {
  ChainIdMismatchError as SdkChainIdMismatchError,
  MissingContractCodeError as SdkMissingContractCodeError,
} from "@morpho-org/morpho-sdk";
import { MaximumFeeExceededError as WdkMaximumFeeExceededError } from "@tetherto/wdk-wallet";
import { expect, test } from "vitest";
import {
  BlueBundlesV1DeadlineExceedsWindowError as SourceBlueBundlesV1DeadlineExceedsWindowError,
  InvalidTransactionHashError as SourceInvalidTransactionHashError,
  InvalidTransactionMaxFeeError as SourceInvalidTransactionMaxFeeError,
  MissingWalletProviderError as SourceMissingWalletProviderError,
  PaymasterApprovalGuardUnavailableError as SourcePaymasterApprovalGuardUnavailableError,
  PaymasterApprovalSpenderMismatchError as SourcePaymasterApprovalSpenderMismatchError,
  UnconfirmedBroadcastError as SourceUnconfirmedBroadcastError,
} from "./errors.js";
import {
  BlueBundlesV1DeadlineExceedsWindowError,
  ChainIdMismatchError,
  InvalidTransactionHashError,
  InvalidTransactionMaxFeeError,
  MalformedTokenMetadataError,
  MaximumFeeExceededError,
  MissingContractCodeError,
  MissingPermitDomainNameError,
  MissingWalletProviderError,
  PaymasterApprovalGuardUnavailableError,
  PaymasterApprovalSpenderMismatchError,
  UnconfirmedBroadcastError,
  UnknownTokenError,
} from "./index.js";

test("re-exports ChainIdMismatchError by identity", () => {
  expect(ChainIdMismatchError).toBe(SdkChainIdMismatchError);
});

test("re-exports MissingContractCodeError by identity", () => {
  expect(MissingContractCodeError).toBe(SdkMissingContractCodeError);
});

test("re-exports UnknownTokenError by identity", () => {
  expect(UnknownTokenError).toBeDefined();
  expect(UnknownTokenError).toBe(SdkUnknownTokenError);
});

test("re-exports MissingPermitDomainNameError by identity", () => {
  expect(MissingPermitDomainNameError).toBeDefined();
  expect(MissingPermitDomainNameError).toBe(SdkMissingPermitDomainNameError);
});

test("re-exports MalformedTokenMetadataError by identity", () => {
  expect(MalformedTokenMetadataError).toBeDefined();
  expect(MalformedTokenMetadataError).toBe(SdkMalformedTokenMetadataError);
});

test("re-exports MissingWalletProviderError by identity", () => {
  expect(MissingWalletProviderError).toBe(SourceMissingWalletProviderError);
});

test("re-exports BlueBundlesV1DeadlineExceedsWindowError by identity", () => {
  expect(BlueBundlesV1DeadlineExceedsWindowError).toBe(
    SourceBlueBundlesV1DeadlineExceedsWindowError,
  );
});

test("re-exports UnconfirmedBroadcastError by identity", () => {
  expect(UnconfirmedBroadcastError).toBe(SourceUnconfirmedBroadcastError);
});

test("re-exports InvalidTransactionHashError by identity", () => {
  expect(InvalidTransactionHashError).toBe(SourceInvalidTransactionHashError);
});

test("re-exports InvalidTransactionMaxFeeError by identity", () => {
  expect(InvalidTransactionMaxFeeError).toBe(
    SourceInvalidTransactionMaxFeeError,
  );
});

test("re-exports MaximumFeeExceededError by identity", () => {
  expect(MaximumFeeExceededError).toBe(WdkMaximumFeeExceededError);
});

test("re-exports PaymasterApprovalSpenderMismatchError by identity", () => {
  expect(PaymasterApprovalSpenderMismatchError).toBe(
    SourcePaymasterApprovalSpenderMismatchError,
  );
});

test("re-exports PaymasterApprovalGuardUnavailableError by identity", () => {
  expect(PaymasterApprovalGuardUnavailableError).toBe(
    SourcePaymasterApprovalGuardUnavailableError,
  );
});
