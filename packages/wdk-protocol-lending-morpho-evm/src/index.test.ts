import { ChainIdMismatchError as SdkChainIdMismatchError } from "@morpho-org/morpho-sdk";
import { expect, test } from "vitest";
import {
  BlueBundlesV1DeadlineExceedsWindowError as SourceBlueBundlesV1DeadlineExceedsWindowError,
  MissingWalletProviderError as SourceMissingWalletProviderError,
  RawTransactionHashMismatchError as SourceRawTransactionHashMismatchError,
} from "./errors.js";
import {
  BlueBundlesV1DeadlineExceedsWindowError,
  ChainIdMismatchError,
  MissingWalletProviderError,
  RawTransactionHashMismatchError,
} from "./index.js";

test("re-exports ChainIdMismatchError by identity", () => {
  expect(ChainIdMismatchError).toBe(SdkChainIdMismatchError);
});

test("re-exports MissingWalletProviderError by identity", () => {
  expect(MissingWalletProviderError).toBe(SourceMissingWalletProviderError);
});

test("re-exports BlueBundlesV1DeadlineExceedsWindowError by identity", () => {
  expect(BlueBundlesV1DeadlineExceedsWindowError).toBe(
    SourceBlueBundlesV1DeadlineExceedsWindowError,
  );
});

test("re-exports RawTransactionHashMismatchError by identity", () => {
  expect(RawTransactionHashMismatchError).toBe(
    SourceRawTransactionHashMismatchError,
  );
});
