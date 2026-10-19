import { UnknownTokenError as SdkUnknownTokenError } from "@morpho-org/blue-sdk";
import {
  MalformedTokenMetadataError as SdkMalformedTokenMetadataError,
  MissingPermitDomainNameError as SdkMissingPermitDomainNameError,
} from "@morpho-org/blue-sdk-viem";
import {
  ChainIdMismatchError as SdkChainIdMismatchError,
  MissingContractCodeError as SdkMissingContractCodeError,
} from "@morpho-org/morpho-sdk";
import { expect, test } from "vitest";
import {
  BlueBundlesV1DeadlineExceedsWindowError as SourceBlueBundlesV1DeadlineExceedsWindowError,
  InvalidTransactionHashError as SourceInvalidTransactionHashError,
  MissingWalletProviderError as SourceMissingWalletProviderError,
  UnconfirmedBroadcastError as SourceUnconfirmedBroadcastError,
} from "./errors.js";
import {
  BlueBundlesV1DeadlineExceedsWindowError,
  ChainIdMismatchError,
  InvalidTransactionHashError,
  MalformedTokenMetadataError,
  MissingContractCodeError,
  MissingPermitDomainNameError,
  MissingWalletProviderError,
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
