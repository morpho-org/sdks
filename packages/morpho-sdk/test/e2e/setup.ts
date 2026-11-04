import { getChainAddresses, MarketParams } from "@morpho-org/blue-sdk";
import { blueAbi } from "@morpho-org/blue-sdk-viem";
import {
  type E2eScenario,
  type E2eTarget,
  getE2eAsset,
  getE2eRuns,
  installE2eAsset,
  installE2eOracle,
} from "@morpho-org/morpho-test";
import type { AnvilTestClient } from "@morpho-org/test";
import { createViemTest } from "@morpho-org/test/vitest";
import {
  type Address,
  type Chain,
  defineChain,
  encodeFunctionData,
  erc20Abi,
  erc4626Abi,
  maxUint128,
  maxUint256,
  parseUnits,
} from "viem";
import * as viemChains from "viem/chains";
import { describe, expect, type TestAPI } from "vitest";
import {
  DEAD_ADDRESS,
  MIN_DEAD_SHARES,
  MIN_VAULT_V2_DEAD_ASSETS,
} from "../../src/constants.js";
import { seedDeadSupply } from "../helpers/blue.js";

/** Test context of a registry-driven E2E scenario. */
export interface E2eTestContext {
  readonly client: AnvilTestClient<Chain>;
}

const chains: readonly Chain[] = Object.values(viemChains);

/**
 * Declares a scenario family once and runs its body on every chain the address registry makes
 * eligible, each on an Anvil fork pinned by `getE2eRuns`. Chains are skipped when `ERPC_SECRET` is
 * unset. Required deployments without a registered block must have code at the fork block.
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
        // HyperEVM small blocks cap gas at 3M, below a Vault V2 deployment.
        gasLimit: 60_000_000n,
        stepsTracing: false,
      }).extend<E2eTestContext>({
        client: async ({ client }, use) => {
          // Fork accounts may carry EIP-7702 code that turns ecrecover permits into EIP-1271 checks.
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

/** LLTV of the market `createE2eMarket` creates. It is enabled on every registered Blue deployment. */
const E2E_LLTV = parseUnits("0.86", 18);

/**
 * Creates a fresh Blue market with the registered wNative or a fork-installed test asset and a
 * fixed 1:1 oracle price, so every chain starts from the same empty market regardless of live state.
 */
export const createE2eMarket = async (
  client: AnvilTestClient<Chain>,
  chainId: number,
) => {
  const { blue, adaptiveCurveIrm } = getChainAddresses(chainId);
  const asset = getE2eAsset(chainId);
  if (asset.requiresInstall) {
    await installE2eAsset(client, asset.address);
    expect(
      await client.readContract({
        address: asset.address,
        abi: erc20Abi,
        functionName: "decimals",
      }),
    ).toBe(18);
  }
  const oracle = await installE2eOracle(client);
  const market = new MarketParams({
    loanToken: asset.address,
    collateralToken: asset.address,
    oracle,
    irm: adaptiveCurveIrm,
    lltv: E2E_LLTV,
  });
  await client.sendTransaction({
    to: blue,
    data: encodeFunctionData({
      abi: blueAbi,
      functionName: "createMarket",
      args: [market],
    }),
  });

  return market;
};

/**
 * Gives a fresh E2E market, and optionally a vault over it, the `MIN_DEAD_SHARES` dead deposit
 * the SDK requires before a supply or deposit. The account's loan-token balance is unchanged.
 */
export const seedE2eDeadDeposits = async (
  client: AnvilTestClient<Chain>,
  params: {
    readonly chainId: number;
    readonly market: MarketParams;
    readonly vault?: Address;
  },
) => {
  await seedDeadSupply({
    client,
    chainId: params.chainId,
    market: params.market,
  });
  if (params.vault == null) return;
  const { loanToken } = params.market;
  const balance = await client.balanceOf({ erc20: loanToken });
  await client.deal({ erc20: loanToken, amount: maxUint128 });
  await client.approve({
    address: loanToken,
    args: [params.vault, maxUint256],
  });
  await client.writeContract({
    address: params.vault,
    abi: erc4626Abi,
    functionName: "mint",
    args: [MIN_DEAD_SHARES, DEAD_ADDRESS],
  });
  // Vault V2 also requires the dead shares to be worth `MIN_VAULT_V2_DEAD_ASSETS`.
  await client.writeContract({
    address: params.vault,
    abi: erc4626Abi,
    functionName: "deposit",
    args: [MIN_VAULT_V2_DEAD_ASSETS, DEAD_ADDRESS],
  });
  await client.approve({ address: loanToken, args: [params.vault, 0n] });
  await client.deal({ erc20: loanToken, amount: balance });
};
