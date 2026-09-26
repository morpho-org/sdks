import {
  blueAbi,
  blueBundlesV1Abi,
  vaultExitBundlesV1Abi,
  vaultV2Abi,
} from "@morpho-org/morpho-sdk/abis";
import { getChainAddresses } from "@morpho-org/morpho-sdk/addresses";
import {
  type Address,
  encodeFunctionData,
  getAddress,
  type Hex,
  zeroAddress,
  zeroHash,
} from "viem";
import { describe, expect, test } from "vitest";
import {
  ProtocolBindingMismatchError,
  UnsupportedOperationError,
} from "../errors.js";
import type { SimulationTransaction } from "../types.js";
import { decodeOperations } from "./operations.js";

/**
 * Supported routes: BlueBundlesV1 write entrypoints, VaultBundlesV1 vault entrypoints,
 * VaultExitBundlesV1 exit entrypoints, bound VaultV2 `multicall` (forceDeallocate+redeem),
 * and direct Morpho `setAuthorization`. Everything else rejects typed.
 */
const chainId = 1;
const owner = getAddress("0x10000000000000000000000000000000000000aA");
const addresses = getChainAddresses(chainId);
const morpho = addresses.blue as Address;
const bundles = addresses.bundles;
if (bundles == null) {
  throw new Error("test registry requires bundles addresses");
}
const blueBundlesV1 = bundles.blueBundlesV1 as Address;
const vaultExitBundlesV1 = bundles.vaultExitBundlesV1 as Address;
const RANDOM = getAddress("0x5555555555555555555555555555555555555555");
const VAULT_V2 = getAddress("0x2222222222222222222222222222222222222222");
const ADAPTER = getAddress("0x3333333333333333333333333333333333333333");

const tx = (spec: {
  to: Address;
  data: Hex;
  value?: bigint;
}): SimulationTransaction => ({
  from: owner,
  to: spec.to,
  data: spec.data,
  value: spec.value ?? 0n,
});

const marketTuple = {
  loanToken: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as Address,
  collateralToken: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2" as Address,
  oracle: getAddress("0xD48AE1C530183bcebc59A25924F09829Fbd27Bb1"),
  irm: addresses.adaptiveCurveIrm,
  lltv: 860_000000000000000n,
};

const decode = (transactions: SimulationTransaction[]) =>
  decodeOperations({
    chainId,
    mode: "final",
    transactions,
    vaults: [
      { address: VAULT_V2, kind: "vaultV2", asset: marketTuple.loanToken },
    ],
  });

const emptyAuthorization = {
  signature: { v: 0, r: zeroHash, s: zeroHash },
  nonce: 0n,
  deadline: 0n,
};

describe("decodeOperations rejected routes", () => {
  test.each([
    [
      "unregistered random address",
      tx({ to: RANDOM, data: "0xdeadbeef" }),
      UnsupportedOperationError,
    ],
    [
      "empty calldata to BlueBundlesV1",
      tx({ to: blueBundlesV1, data: "0x" }),
      UnsupportedOperationError,
    ],
    [
      "onMorphoFlashLoan callback on VaultExitBundlesV1",
      tx({
        to: vaultExitBundlesV1,
        data: encodeFunctionData({
          abi: vaultExitBundlesV1Abi,
          functionName: "onMorphoFlashLoan",
          args: [0n, "0x"],
        }),
      }),
      UnsupportedOperationError,
    ],
    [
      "onMorphoSupply callback on VaultExitBundlesV1",
      tx({
        to: vaultExitBundlesV1,
        data: encodeFunctionData({
          abi: vaultExitBundlesV1Abi,
          functionName: "onMorphoSupply",
          args: [0n, "0x"],
        }),
      }),
      UnsupportedOperationError,
    ],
    [
      "direct Morpho supply is not a supported entrypoint",
      tx({
        to: morpho,
        data: encodeFunctionData({
          abi: blueAbi,
          functionName: "supply",
          args: [marketTuple, 0n, 0n, zeroAddress, "0x"],
        }),
      }),
      UnsupportedOperationError,
    ],
    [
      "blueBundlesV1Withdraw with both legs zero",
      tx({
        to: blueBundlesV1,
        data: encodeFunctionData({
          abi: blueBundlesV1Abi,
          functionName: "blueBundlesV1Withdraw",
          args: [
            marketTuple,
            0n,
            0n,
            emptyAuthorization,
            [],
            0n,
            zeroAddress,
            1n,
          ],
        }),
      }),
      UnsupportedOperationError,
    ],
    [
      "VaultV2 multicall whose last inner call is not redeem",
      tx({
        to: VAULT_V2,
        data: encodeFunctionData({
          abi: vaultV2Abi,
          functionName: "multicall",
          args: [
            [
              encodeFunctionData({
                abi: vaultV2Abi,
                functionName: "forceDeallocate",
                args: [ADAPTER, "0x", 1n, owner],
              }),
              encodeFunctionData({
                abi: vaultV2Abi,
                functionName: "forceDeallocate",
                args: [ADAPTER, "0x", 1n, owner],
              }),
            ],
          ],
        }),
      }),
      UnsupportedOperationError,
    ],
    [
      "VaultV2 multicall with foreign inner function",
      tx({
        to: VAULT_V2,
        data: encodeFunctionData({
          abi: vaultV2Abi,
          functionName: "multicall",
          args: [
            [
              encodeFunctionData({
                abi: vaultV2Abi,
                functionName: "deposit",
                args: [1n, owner],
              }),
              encodeFunctionData({
                abi: vaultV2Abi,
                functionName: "redeem",
                args: [1n, owner, owner],
              }),
            ],
          ],
        }),
      }),
      UnsupportedOperationError,
    ],
    [
      "bound vault non-multicall selector",
      tx({
        to: VAULT_V2,
        data: encodeFunctionData({
          abi: vaultV2Abi,
          functionName: "deposit",
          args: [1n, owner],
        }),
      }),
      UnsupportedOperationError,
    ],
    [
      "native value on direct Morpho call",
      tx({
        to: morpho,
        data: encodeFunctionData({
          abi: blueAbi,
          functionName: "setAuthorization",
          args: [blueBundlesV1, true],
        }),
        value: 1n,
      }),
      ProtocolBindingMismatchError,
    ],
    [
      "midnightBundles deployment when registered",
      tx({
        to:
          (addresses as { midnightBundles?: Address }).midnightBundles ??
          RANDOM,
        data: "0xdeadbeef",
      }),
      UnsupportedOperationError,
    ],
  ])("%s -> throws the expected typed error", (...row) => {
    const [, transaction, error] = row;
    expect(() => decode([transaction])).toThrow(error);
  });
});
