import {
  getChainAddresses,
  MarketParams,
  ORACLE_PRICE_SCALE,
} from "@morpho-org/blue-sdk";
import { blueAbi } from "@morpho-org/morpho-sdk/abis";
import {
  E2E_ASSET_BYTECODE,
  E2E_ASSET_STORAGE,
  type E2eScenario,
  type E2eTarget,
  getE2eAsset,
  getE2eRuns,
} from "@morpho-org/morpho-test";
import type { AnvilTestClient } from "@morpho-org/test";
import { createViemTest } from "@morpho-org/test/vitest";
import {
  type Address,
  type Chain,
  defineChain,
  erc20Abi,
  numberToHex,
  parseUnits,
} from "viem";
import * as viemChains from "viem/chains";
import { describe, expect, type TestAPI } from "vitest";

/** Test context of a registry-driven simulation scenario. */
export interface E2eTestContext {
  readonly client: AnvilTestClient<Chain>;
}

const chains: readonly Chain[] = Object.values(viemChains);

/**
 * Runs a scenario family on every chain the address registry makes eligible, each on an Anvil
 * fork pinned by `getE2eRuns` through the Morpho eRPC; eligible chains are skipped when
 * `ERPC_SECRET` is unset unless explicitly selected.
 */
export const describeE2e = (
  scenario: E2eScenario,
  body: (test: TestAPI<E2eTestContext>, target: E2eTarget) => void,
) =>
  describe(`e2e/${scenario.name}`, () => {
    for (const run of getE2eRuns({ scenario, env: process.env })) {
      const { chainId, chainName, forkBlockNumber, undatedDeployments } =
        run.target;
      const chain =
        chains.find(({ id }) => id === chainId) ??
        defineChain({
          id: chainId,
          name: chainName,
          nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
          rpcUrls: { default: { http: [] } },
        });
      const test = createViemTest(chain, {
        forkUrl: run.status === "run" ? run.forkUrl : undefined,
        forkBlockNumber,
        // HyperEVM small blocks cap gas at 3M.
        gasLimit: 60_000_000n,
        stepsTracing: false,
      }).extend<E2eTestContext>({
        client: async ({ client }, use) => {
          // Fork accounts may carry EIP-7702 code; simulate them as plain EOAs.
          await client.setCode({
            address: client.account.address,
            bytecode: "0x",
          });
          for (const { label, address } of undatedDeployments)
            expect(
              await client.getCode({ address }),
              `${label} has no code at block ${forkBlockNumber}; register its deployment block`,
            ).toBeDefined();
          await use(client);
        },
      });
      const title = `${chainName} (${chainId}) @ ${forkBlockNumber}`;

      if (run.status === "skip")
        describe.skip(`${title}: ${run.reason}`, () => body(test, run.target));
      else describe(title, () => body(test, run.target));
    }
  });

const E2E_ORACLE: Address = "0xE2E0000000000000000000000000000000000001";
const E2E_WALLET: Address = "0xE2e0000000000000000000000000000000000002";

/**
 * Installs the fallback ERC-20 code and constructor storage when a chain has no registered wNative.
 *
 * @param client - Anvil client for the fork.
 * @param chainId - Chain whose registered wNative is checked.
 * @returns A promise that resolves after the fallback token's `decimals()` is verified as 18.
 * @example
 * ```ts
 * import type { AnvilTestClient } from "@morpho-org/test";
 * import { ChainId } from "@morpho-org/morpho-ts";
 * import { installE2eAsset } from "./setup.js";
 * import type { Chain } from "viem";
 *
 * const install = (client: AnvilTestClient<Chain>) =>
 *   installE2eAsset(client, ChainId.ArcMainnet);
 * ```
 */
export const installE2eAsset = async (
  client: AnvilTestClient<Chain>,
  chainId: number,
): Promise<void> => {
  const asset = getE2eAsset(chainId);
  if (!asset.requiresInstall) return;
  await installE2eAssetAt(client, asset.address);
};

/** Installs the fallback ERC-20 code and constructor storage at an arbitrary address. */
const installE2eAssetAt = async (
  client: AnvilTestClient<Chain>,
  address: Address,
): Promise<void> => {
  await client.setCode({
    address,
    bytecode: E2E_ASSET_BYTECODE,
  });
  for (const { slot, value } of E2E_ASSET_STORAGE)
    await client.setStorageAt({
      address,
      index: slot,
      value,
    });
  expect(
    await client.readContract({
      address,
      abi: erc20Abi,
      functionName: "decimals",
    }),
  ).toBe(18);
};

/** Accounts every simulation case runs from: the plain test EOA, then the same key as a smart wallet. */
export const E2E_ACTORS = ["EOA", "EIP-7702 smart wallet"] as const;

/** Account kind a simulation case runs from. */
export type E2eActor = (typeof E2E_ACTORS)[number];

/**
 * Runs each test of `test` from `actor`. The smart wallet is the test account delegated through
 * EIP-7702 to a minimal ERC-1271 implementation: `isValidSignature(hash, signature)` returns the
 * magic value when the 65-byte signature recovers to the account itself, and every other call
 * succeeds without effect. Permit2 then verifies the account through ERC-1271, as for any contract
 * wallet, while ecrecover-only checks (Morpho authorizations, Vault V2 share permits) still accept
 * its key. The EOA keeps the code-free account `describeE2e` sets up.
 */
export const withE2eActor = (test: TestAPI<E2eTestContext>, actor: E2eActor) =>
  test.extend<E2eTestContext>({
    client: async ({ client }, use) => {
      if (actor === "EIP-7702 smart wallet") {
        // selector == isValidSignature ? (ecrecover(hash, v, r, s) == ADDRESS ? magic : 0) : STOP.
        await client.setCode({
          address: E2E_WALLET,
          bytecode:
            "0x60003560e01c631626ba7e14601057005b600435600052602435600401806020013560405280604001356060526060013560f81c602052602060806080600060015afa506080513014605157602060a0f35b631626ba7e60e01b60005260206000f3",
        });
        await client.setCode({
          address: client.account.address,
          bytecode: `0xef0100${E2E_WALLET.slice(2)}`,
        });
      }
      await use(client);
    },
  });

/**
 * Creates a fresh Blue market with the registered wNative or a fork-installed test asset and a
 * fixed 1:1 oracle price, so every chain simulates against the same empty market.
 */
export const createE2eMarket = async (
  client: AnvilTestClient<Chain>,
  options: { readonly chainId: number; readonly collateralToken?: Address },
) => {
  const { chainId } = options;
  const collateralAsset = options.collateralToken;
  const { blue, adaptiveCurveIrm } = getChainAddresses(chainId);
  const asset = getE2eAsset(chainId);
  await installE2eAsset(client, chainId);
  if (collateralAsset !== undefined)
    await installE2eAssetAt(client, collateralAsset);
  // PUSH15 price; PUSH1 0; MSTORE; PUSH1 32; PUSH1 0; RETURN: answers `price()` with 1e36.
  await client.setCode({
    address: E2E_ORACLE,
    bytecode: `0x6e${numberToHex(ORACLE_PRICE_SCALE, { size: 15 }).slice(2)}60005260206000f3`,
  });
  const market = new MarketParams({
    loanToken: asset.address,
    collateralToken: collateralAsset ?? asset.address,
    oracle: E2E_ORACLE,
    irm: adaptiveCurveIrm,
    lltv: parseUnits("0.86", 18),
  });
  await client.writeContract({
    address: blue,
    abi: blueAbi,
    functionName: "createMarket",
    args: [market],
  });

  return market;
};
