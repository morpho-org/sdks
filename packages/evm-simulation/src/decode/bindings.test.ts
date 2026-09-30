import {
  blueAbi,
  vaultBundlesV1Abi,
  vaultExitBundlesV1Abi,
} from "@morpho-org/morpho-sdk/abis";
import { getChainAddresses } from "@morpho-org/morpho-sdk/addresses";
import { type Address, encodeFunctionData, getAddress } from "viem";
import { UnsupportedChainError } from "../errors.js";
import { collectBindingCandidates } from "./bindings.js";

const addresses = getChainAddresses(1);
const VAULT_A: Address = getAddress(
  "0x1111111111111111111111111111111111111111",
);
const VAULT_B: Address = getAddress(
  "0x2222222222222222222222222222222222222222",
);
const OPERATOR: Address = getAddress(
  "0x3333333333333333333333333333333333333333",
);
const UNKNOWN: Address = getAddress(
  "0x4444444444444444444444444444444444444444",
);

const tx = (to: Address, data: `0x${string}`) => ({
  from: getAddress("0x5555555555555555555555555555555555555555"),
  to,
  data,
  value: 0n,
});

const permit = {
  kind: 0,
  data: "0x",
} as const;
const sharesPermit = {
  value: 0n,
  nonce: 0n,
  deadline: 0n,
  v: 0,
  r: `0x${"00".repeat(32)}` as `0x${string}`,
  s: `0x${"00".repeat(32)}` as `0x${string}`,
} as const;

describe("collectBindingCandidates", () => {
  test("default: collects vaults from VaultBundlesV1 calldata", () => {
    const candidates = collectBindingCandidates({
      chainId: 1,
      transactions: [
        tx(
          addresses.bundles!.vaultBundlesV1!,
          encodeFunctionData({
            abi: vaultBundlesV1Abi,
            functionName: "vaultBundlesV1Deposit",
            args: [VAULT_A, 1n, 0n, permit, 0n, VAULT_B, 1n],
          }),
        ),
        tx(
          addresses.bundles!.vaultBundlesV1!,
          encodeFunctionData({
            abi: vaultBundlesV1Abi,
            functionName: "vaultBundlesV1Migrate",
            args: [VAULT_A, VAULT_B, 0n, 1n, 0n, sharesPermit, 0n, VAULT_B, 1n],
          }),
        ),
      ],
    });
    expect(candidates.vaults).toEqual([VAULT_A, VAULT_B]);
    expect(candidates.preLiquidations).toEqual([]);
  });

  test("behavior: collects vaults from VaultExitBundlesV1 calldata", () => {
    const candidates = collectBindingCandidates({
      chainId: 1,
      transactions: [
        tx(
          addresses.bundles!.vaultExitBundlesV1,
          encodeFunctionData({
            abi: vaultExitBundlesV1Abi,
            functionName: "vaultExitBundlesV1InKindRedemptionVaultV1",
            args: [VAULT_A, [], 1n, sharesPermit, 1n],
          }),
        ),
      ],
    });
    expect(candidates.vaults).toEqual([VAULT_A]);
  });

  test("behavior: collects setAuthorization targets except BlueBundlesV1", () => {
    const candidates = collectBindingCandidates({
      chainId: 1,
      transactions: [
        tx(
          addresses.blue,
          encodeFunctionData({
            abi: blueAbi,
            functionName: "setAuthorization",
            args: [OPERATOR, true],
          }),
        ),
        tx(
          addresses.blue,
          encodeFunctionData({
            abi: blueAbi,
            functionName: "setAuthorization",
            args: [addresses.bundles!.blueBundlesV1!, true],
          }),
        ),
      ],
    });
    expect(candidates.preLiquidations).toEqual([OPERATOR]);
  });

  test("behavior: non-bundle non-morpho `to` is a vaultV2 multicall candidate", () => {
    const candidates = collectBindingCandidates({
      chainId: 1,
      transactions: [tx(UNKNOWN, "0xdeadbeef")],
    });
    expect(candidates.vaults).toEqual([UNKNOWN]);
  });

  test("behavior: undecodable calldata on a bundle is not an error", () => {
    const candidates = collectBindingCandidates({
      chainId: 1,
      transactions: [tx(addresses.bundles!.vaultBundlesV1!, "0xdeadbeef")],
    });
    expect(candidates.vaults).toEqual([]);
  });

  test("behavior: dedupes repeated vaults", () => {
    const data = encodeFunctionData({
      abi: vaultBundlesV1Abi,
      functionName: "vaultBundlesV1Deposit",
      args: [VAULT_A, 1n, 0n, permit, 0n, VAULT_B, 1n],
    });
    const candidates = collectBindingCandidates({
      chainId: 1,
      transactions: [
        tx(addresses.bundles!.vaultBundlesV1!, data),
        tx(addresses.bundles!.vaultBundlesV1!, data),
      ],
    });
    expect(candidates.vaults).toEqual([VAULT_A]);
  });

  test("error: UnsupportedChainError for an unregistered chain", () => {
    expect(() =>
      collectBindingCandidates({ chainId: 999_999_999, transactions: [] }),
    ).toThrow(UnsupportedChainError);
  });
});
