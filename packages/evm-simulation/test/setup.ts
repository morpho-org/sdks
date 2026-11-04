import type {
  AccrualVaultV2,
  Market,
  MarketId,
  MarketParams,
} from "@morpho-org/blue-sdk";
import {
  InsufficientDeadSharesError,
  validateVaultV2DeadShares,
} from "@morpho-org/morpho-sdk";
import { blueAbi } from "@morpho-org/morpho-sdk/abis";
import { getChainAddresses } from "@morpho-org/morpho-sdk/addresses";
import {
  DEAD_ADDRESS,
  MIN_DEAD_SHARES,
  MIN_VAULT_V2_DEAD_ASSETS,
} from "@morpho-org/morpho-sdk/constants";
import {
  fetchBlueMarket,
  fetchBlueMarketParams,
} from "@morpho-org/morpho-sdk/fetch";
import { type AnvilTestClient, getErpcForkUrl } from "@morpho-org/test";
import { createViemTest } from "@morpho-org/test/vitest";
import { erc4626Abi, isAddress, maxUint128, maxUint256 } from "viem";
import { mainnet } from "viem/chains";

/**
 * Fork-test fixture pinned to a known `mainnet` block.
 *
 * `ERPC_SECRET` is read without validation at module load: forking only happens
 * when a fork spec actually runs, so offline test collection can import this
 * module without a key. Without it, Anvil uses mainnet's public RPC.
 */
export const test = createViemTest(mainnet, {
  forkUrl: getErpcForkUrl(mainnet.id, process.env.ERPC_SECRET),
  chainId: mainnet.id,
  forkBlockNumber: 24_593_903n,
}).extend<{ client: AnvilTestClient<typeof mainnet> }>({
  client: async ({ client }, use) => {
    // The test account carries EIP-7702 delegation code at this block; wipe it
    // so it behaves as a plain EOA during simulation.
    await client.setCode({ address: client.account.address, bytecode: "0x" });
    await use(client);
  },
});

/**
 * Seeds a `MIN_DEAD_SHARES` dead supply into `marketParams` when the forked
 * market lacks one, then returns the market snapshot Blue `supply` requires.
 */
export async function seededMarketData(
  client: AnvilTestClient,
  target: MarketParams | { readonly getMarketData: () => Promise<Market> },
): Promise<Market> {
  const current =
    "getMarketData" in target
      ? await target.getMarketData()
      : await fetchBlueMarket(target.id, client);
  const marketParams = current.params;
  if ((current.deadSupplyShares ?? 0n) >= MIN_DEAD_SHARES) return current;
  const { blue } = getChainAddresses(client.chain.id);
  const balance = await client.balanceOf({ erc20: marketParams.loanToken });
  await client.deal({ erc20: marketParams.loanToken, amount: maxUint128 });
  await client.approve({
    address: marketParams.loanToken,
    args: [blue, maxUint256],
  });
  await client.writeContract({
    address: blue,
    abi: blueAbi,
    functionName: "supply",
    args: [marketParams, 0n, MIN_DEAD_SHARES, DEAD_ADDRESS, "0x"],
  });
  await client.deal({ erc20: marketParams.loanToken, amount: balance });
  return fetchBlueMarket(marketParams.id, client);
}

/**
 * Seeds the dead deposits a forked Vault V2, and every market or Vault V1 it
 * can allocate to, lacks to pass `validateVaultV2DeadShares`, then returns the
 * passing snapshot.
 */
export async function seededVaultData(
  client: AnvilTestClient,
  vault: { readonly getData: () => Promise<AccrualVaultV2> },
): Promise<AccrualVaultV2> {
  for (let attempt = 0; attempt < 32; attempt++) {
    const data = await vault.getData();
    try {
      // Throws to identify the next missing dead deposit.
      validateVaultV2DeadShares(data);
      return data;
    } catch (error) {
      if (!(error instanceof InsufficientDeadSharesError)) throw error;
      const failing = error.entity.at(-1)!;
      if (isAddress(failing)) {
        const asset = await client.readContract({
          address: failing,
          abi: erc4626Abi,
          functionName: "asset",
        });
        const balance = await client.balanceOf({ erc20: asset });
        await client.deal({ erc20: asset, amount: maxUint128 });
        await client.approve({ address: asset, args: [failing, maxUint256] });
        await client.writeContract({
          address: failing,
          abi: erc4626Abi,
          ...(error.reason === "deadShares"
            ? { functionName: "mint", args: [MIN_DEAD_SHARES, DEAD_ADDRESS] }
            : {
                functionName: "deposit",
                args: [MIN_VAULT_V2_DEAD_ASSETS, DEAD_ADDRESS],
              }),
        });
        await client.approve({ address: asset, args: [failing, 0n] });
        await client.deal({ erc20: asset, amount: balance });
      } else
        await seededMarketData(
          client,
          await fetchBlueMarketParams(failing as MarketId, client),
        );
    }
  }
  throw new InsufficientDeadSharesError({
    entity: [(await vault.getData()).address],
    reason: "deadShares",
    observed: 0n,
    required: MIN_DEAD_SHARES,
  });
}
