import { classifyError } from "@morpho-org/test/chaos";
import { ContractFunctionRevertedError } from "viem";
import { expect } from "vitest";
import {
  MalformedTokenMetadataError,
  type TokenMetadataField,
} from "../error.js";
import { isTransportError } from "../utils.js";

// Walks the `.cause` chain (plain causes and viem `BaseError` causes alike).
const errorChain = (error: unknown): unknown[] => {
  const chain: unknown[] = [];
  const seen = new Set<unknown>();
  let current = error;
  while (
    typeof current === "object" &&
    current !== null &&
    !seen.has(current)
  ) {
    seen.add(current);
    chain.push(current);
    current = (current as { cause?: unknown }).cause;
  }
  return chain;
};

/**
 * Asserts a rejection is a malformed-token-metadata failure and nothing else:
 * typed `MalformedTokenMetadataError`, classified `integrity`, no transport
 * error anywhere in the cause chain, and no `ContractFunctionRevertedError`
 * other than the deployless query's `MalformedReturnData` verdict in it.
 * @internal
 */
export const expectMalformedMetadataFailure = (
  error: unknown,
  field?: TokenMetadataField,
) => {
  expect(error).toBeInstanceOf(MalformedTokenMetadataError);
  expect(classifyError(error)).toBe("integrity");
  for (const link of errorChain(error)) {
    expect(isTransportError(link)).toBe(false);
    if (link instanceof ContractFunctionRevertedError)
      expect(link.data?.errorName).toBe("MalformedReturnData");
  }
  if (field != null && error instanceof MalformedTokenMetadataError)
    expect(error.field).toBe(field);
};
