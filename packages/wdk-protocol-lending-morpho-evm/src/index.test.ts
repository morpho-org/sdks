import { ChainIdMismatchError as SdkChainIdMismatchError } from "@morpho-org/morpho-sdk";
import { expect, test } from "vitest";
import {
  BlueBundlesV1DeadlineExceedsWindowError as SourceBlueBundlesV1DeadlineExceedsWindowError,
  MissingPaymasterFeeCapError as SourceMissingPaymasterFeeCapError,
  MissingWalletProviderError as SourceMissingWalletProviderError,
} from "./errors.js";
import {
  BlueBundlesV1DeadlineExceedsWindowError,
  ChainIdMismatchError,
  MissingPaymasterFeeCapError,
  MissingWalletProviderError,
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

test("re-exports MissingPaymasterFeeCapError by identity", () => {
  expect(MissingPaymasterFeeCapError).toBe(SourceMissingPaymasterFeeCapError);
});
