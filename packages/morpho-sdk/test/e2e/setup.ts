import {
  getChainAddresses,
  MarketParams,
  ORACLE_PRICE_SCALE,
} from "@morpho-org/blue-sdk";
import { blueAbi } from "@morpho-org/blue-sdk-viem";
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
  encodeFunctionData,
  erc20Abi,
  numberToHex,
  parseEther,
  parseUnits,
} from "viem";
import * as viemChains from "viem/chains";
import { describe, expect, type TestAPI } from "vitest";

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

/** Address of the fixed-price oracle `createE2eMarket` installs on every fork. */
const E2E_ORACLE: Address = "0xE2E0000000000000000000000000000000000001";

/** LLTV of the market `createE2eMarket` creates. It is enabled on every registered Blue deployment. */
const E2E_LLTV = parseUnits("0.86", 18);

/**
 * Installs the E2E test asset code and storage at `address`.
 *
 * @param client - Anvil client used to install the asset.
 * @param address - Address where the E2E asset should be installed.
 */
export const installE2eAsset = async (
  client: AnvilTestClient<Chain>,
  address: Address,
) => {
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
};

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
  // PUSH15 price; PUSH1 0; MSTORE; PUSH1 32; PUSH1 0; RETURN: answers `price()` with 1e36.
  await client.setCode({
    address: E2E_ORACLE,
    bytecode: `0x6e${numberToHex(ORACLE_PRICE_SCALE, { size: 15 }).slice(2)}60005260206000f3`,
  });
  const market = new MarketParams({
    loanToken: asset.address,
    collateralToken: asset.address,
    oracle: E2E_ORACLE,
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

const wNativeDepositAbi = [
  {
    type: "function",
    name: "deposit",
    stateMutability: "payable",
    inputs: [],
    outputs: [],
  },
] as const;

/**
 * Funds the test account with `amount` wNative. Fork-installed assets use `client.deal` because
 * chains like Tempo reject native value transfers; real wNative is funded by wrapping native
 * tokens. A second ERC-20 `client.deal` after `setUpVault` fails on Robinhood with "cannot find
 * valid balanceOf storage slot", so wrapping remains for real wNative.
 */
export const wrapE2eNative = async (
  client: AnvilTestClient<Chain>,
  params: { readonly wNative: Address; readonly amount: bigint },
) => {
  if (getE2eAsset(client.chain.id).requiresInstall) {
    await client.deal({
      erc20: params.wNative,
      amount:
        (await client.balanceOf({ erc20: params.wNative })) + params.amount,
    });
    return;
  }

  await client.deal({ amount: params.amount + parseEther("1") });
  await client.writeContract({
    address: params.wNative,
    abi: wNativeDepositAbi,
    functionName: "deposit",
    value: params.amount,
  });
};
