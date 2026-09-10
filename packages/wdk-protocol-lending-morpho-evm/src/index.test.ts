import { ChainIdMismatchError as SdkChainIdMismatchError } from "@morpho-org/morpho-sdk";
import { expect, test } from "vitest";
import { MissingWalletProviderError as SourceMissingWalletProviderError } from "./errors.js";
import { ChainIdMismatchError, MissingWalletProviderError } from "./index.js";

test("re-exports ChainIdMismatchError by identity", () => {
  expect(ChainIdMismatchError).toBe(SdkChainIdMismatchError);
});

test("re-exports MissingWalletProviderError by identity", () => {
  expect(MissingWalletProviderError).toBe(SourceMissingWalletProviderError);
});
