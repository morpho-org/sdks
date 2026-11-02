import {
  type AccrualVault,
  type AccrualVaultV2,
  AccrualVaultV2MorphoMarketV1Adapter,
  AccrualVaultV2MorphoMarketV1AdapterV2,
  AccrualVaultV2MorphoVaultV1Adapter,
  type IMarket,
  MarketParams,
  VaultV2MorphoMarketV1Adapter,
  VaultV2MorphoMarketV1AdapterV2,
  VaultV2MorphoVaultV1Adapter,
} from "@morpho-org/blue-sdk";
import type { Address, Hash } from "viem";
import {
  InsufficientDeadSharesError,
  MissingDeadSharesDataError,
} from "../types/error.js";
import { MIN_DEAD_SHARES, MIN_VAULT_V2_DEAD_ASSETS } from "./constant.js";

type DeadSharesPath = readonly (Address | Hash)[];

/**
 * Checks that a Morpho Blue market holds at least `MIN_DEAD_SHARES` supply shares at `DEAD_ADDRESS`.
 *
 * @param market - Fetched market snapshot.
 * @param path - Vaults leading to this market, outermost first; empty for a direct market.
 * @returns Nothing; returns normally when the market passes.
 * @throws {MissingDeadSharesDataError} when `market.deadSupplyShares` was not fetched.
 * @throws {InsufficientDeadSharesError} when the market holds fewer than `MIN_DEAD_SHARES` dead supply shares.
 * @example
 * ```ts
 * import { validateBlueMarketDeadShares } from "@morpho-org/morpho-sdk";
 * import { fetchBlueMarket } from "@morpho-org/morpho-sdk/fetch";
 * import { markets } from "@morpho-org/morpho-test";
 * import { createPublicClient, http } from "viem";
 * import { mainnet } from "viem/chains";
 *
 * const client = createPublicClient({ chain: mainnet, transport: http() });
 * const market = await fetchBlueMarket(markets[mainnet.id].usdc_wbtc.id, client);
 * validateBlueMarketDeadShares(market);
 * // Returns void on success; throws if the snapshot fails the rule.
 * ```
 */
export function validateBlueMarketDeadShares(
  market: Pick<IMarket, "params" | "deadSupplyShares"> & { readonly id: Hash },
  path: DeadSharesPath = [],
): void {
  const entity = [...path, market.id];
  if (market.deadSupplyShares == null)
    throw new MissingDeadSharesDataError({ entity, field: "deadSupplyShares" });
  if (market.deadSupplyShares < MIN_DEAD_SHARES)
    throw new InsufficientDeadSharesError({
      entity,
      reason: "deadShares",
      observed: market.deadSupplyShares,
      required: MIN_DEAD_SHARES,
    });
}

/**
 * Checks that a Vault V1 holds at least `MIN_DEAD_SHARES` shares at `DEAD_ADDRESS` and that every
 * market in its withdraw queue passes `validateBlueMarketDeadShares`.
 *
 * @param vault - Fetched vault snapshot with its withdraw-queue allocations.
 * @param path - Vaults leading to this vault, outermost first; empty for a direct deposit.
 * @returns Nothing; returns normally when the vault and everything it can allocate to pass.
 * @throws {MissingDeadSharesDataError} when `vault.deadShares`, a withdraw-queue allocation or a
 * market's `deadSupplyShares` was not fetched.
 * @throws {InsufficientDeadSharesError} when the vault or one of its withdraw-queue markets holds
 * too few dead shares.
 * @example
 * ```ts
 * import { validateVaultV1DeadShares } from "@morpho-org/morpho-sdk";
 * import { fetchAccrualVault } from "@morpho-org/morpho-sdk/fetch";
 * import { vaults } from "@morpho-org/morpho-test";
 * import { createPublicClient, http } from "viem";
 * import { mainnet } from "viem/chains";
 *
 * const client = createPublicClient({ chain: mainnet, transport: http() });
 * const vault = await fetchAccrualVault(vaults[mainnet.id].steakUsdc.address, client);
 * validateVaultV1DeadShares(vault);
 * // Returns void on success; throws if the snapshot fails the rule.
 * ```
 */
export function validateVaultV1DeadShares(
  vault: AccrualVault,
  path: DeadSharesPath = [],
): void {
  const entity = [...path, vault.address];
  if (vault.deadShares == null)
    throw new MissingDeadSharesDataError({ entity, field: "deadShares" });
  if (vault.deadShares < MIN_DEAD_SHARES)
    throw new InsufficientDeadSharesError({
      entity,
      reason: "deadShares",
      observed: vault.deadShares,
      required: MIN_DEAD_SHARES,
    });
  for (const marketId of vault.withdrawQueue) {
    const allocation = vault.allocations.get(marketId);
    if (allocation == null)
      throw new MissingDeadSharesDataError({
        entity: [...entity, marketId],
        field: "allocation",
      });
    validateBlueMarketDeadShares(allocation.position.market, entity);
  }
}

/**
 * Checks a Vault V2 against the dead-deposit rule: at least `MIN_DEAD_SHARES` shares at
 * `DEAD_ADDRESS` worth at least `MIN_VAULT_V2_DEAD_ASSETS` assets, a share price above
 * `1 / (10 * virtualShares)`, and every Blue market or Vault V1 it can allocate to (non-zero
 * absolute cap) passing its own rule. Zero-cap entries are skipped.
 *
 * @param vault - Fetched vault snapshot with its adapters and `absoluteCaps`.
 * @param path - Vaults leading to this vault, outermost first; empty for a direct deposit.
 * @returns Nothing; returns normally when the vault and everything it can allocate to pass.
 * @throws {MissingDeadSharesDataError} when a dead-share field, an adapter cap, or the data of an
 * adapter the SDK cannot hydrate is missing.
 * @throws {InsufficientDeadSharesError} when the vault or an allocatable market or Vault V1 fails the rule.
 * @example
 * ```ts
 * import { validateVaultV2DeadShares } from "@morpho-org/morpho-sdk";
 * import { fetchAccrualVaultV2 } from "@morpho-org/morpho-sdk/fetch";
 * import { createPublicClient, http } from "viem";
 * import { mainnet } from "viem/chains";
 *
 * const client = createPublicClient({ chain: mainnet, transport: http() });
 * const keyrockUsdcVaultV2 = "0x04422053aDDbc9bB2759b248B574e3FCA76Bc145";
 * const vault = await fetchAccrualVaultV2(keyrockUsdcVaultV2, client);
 * validateVaultV2DeadShares(vault);
 * // Returns void on success; throws if the snapshot fails the rule.
 * ```
 */
export function validateVaultV2DeadShares(
  vault: AccrualVaultV2,
  path: DeadSharesPath = [],
): void {
  const entity = [...path, vault.address];
  const { deadShares, deadAssets, absoluteCaps } = vault;
  if (deadShares == null)
    throw new MissingDeadSharesDataError({ entity, field: "deadShares" });
  if (deadAssets == null)
    throw new MissingDeadSharesDataError({ entity, field: "deadAssets" });
  if (absoluteCaps == null)
    throw new MissingDeadSharesDataError({ entity, field: "absoluteCaps" });
  if (deadShares < MIN_DEAD_SHARES)
    throw new InsufficientDeadSharesError({
      entity,
      reason: "deadShares",
      observed: deadShares,
      required: MIN_DEAD_SHARES,
    });
  if (deadAssets < MIN_VAULT_V2_DEAD_ASSETS)
    throw new InsufficientDeadSharesError({
      entity,
      reason: "deadAssets",
      observed: deadAssets,
      required: MIN_VAULT_V2_DEAD_ASSETS,
    });
  // Share price (totalAssets + 1) / (totalSupply + virtualShares) must exceed 1 / (10 * virtualShares).
  const priceNumerator = (vault._totalAssets + 1n) * 10n * vault.virtualShares;
  const priceDenominator = vault.totalSupply + vault.virtualShares;
  if (priceNumerator <= priceDenominator)
    throw new InsufficientDeadSharesError({
      entity,
      reason: "sharePrice",
      observed: priceNumerator,
      required: priceDenominator + 1n,
    });

  const capOf = (id: Hash, adapter: Address) => {
    const cap = absoluteCaps[id];
    if (cap == null)
      throw new MissingDeadSharesDataError({
        entity: [...entity, adapter],
        field: "absoluteCaps",
      });
    return cap;
  };
  for (const adapter of vault.accrualAdapters) {
    if (adapter instanceof AccrualVaultV2MorphoVaultV1Adapter) {
      const id = VaultV2MorphoVaultV1Adapter.adapterCapId(adapter.address);
      if (capOf(id, adapter.address) > 0n)
        validateVaultV1DeadShares(adapter.accrualVaultV1, entity);
    } else if (adapter instanceof AccrualVaultV2MorphoMarketV1Adapter) {
      for (const { market } of adapter.positions) {
        const id = VaultV2MorphoMarketV1Adapter.adapterMarketCapId(
          adapter.address,
          market.params,
        );
        if (capOf(id, adapter.address) > 0n)
          validateBlueMarketDeadShares(market, entity);
      }
    } else if (adapter instanceof AccrualVaultV2MorphoMarketV1AdapterV2) {
      for (const market of adapter.markets) {
        const id = VaultV2MorphoMarketV1AdapterV2.adapterMarketCapId(
          adapter.address,
          market.params,
        );
        if (capOf(id, adapter.address) > 0n)
          validateBlueMarketDeadShares(market, entity);
      }
    } else {
      throw new MissingDeadSharesDataError({
        entity: [...entity, adapter.address],
        field: "adapter",
      });
    }
  }

  // Deposits are allocated to the liquidity market, so the snapshot must hold it even when it
  // has no allocation yet (the adapters only list markets they currently supply to).
  const liquidityAdapter = vault.accrualLiquidityAdapter;
  if (
    vault.liquidityData === "0x" ||
    !(
      liquidityAdapter instanceof AccrualVaultV2MorphoMarketV1Adapter ||
      liquidityAdapter instanceof AccrualVaultV2MorphoMarketV1AdapterV2
    )
  )
    return;
  const liquidityMarketId = MarketParams.fromHex(vault.liquidityData).id;
  const markets =
    liquidityAdapter instanceof AccrualVaultV2MorphoMarketV1Adapter
      ? liquidityAdapter.positions.map(({ market }) => market)
      : liquidityAdapter.markets;
  if (!markets.some(({ id }) => id === liquidityMarketId))
    throw new MissingDeadSharesDataError({
      entity: [...entity, liquidityAdapter.address, liquidityMarketId],
      field: "liquidityMarket",
    });
}
