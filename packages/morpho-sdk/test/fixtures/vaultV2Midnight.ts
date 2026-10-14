import {
  AccrualVaultV2,
  AccrualVaultV2MidnightAdapter,
} from "@morpho-org/blue-sdk";
import { Time } from "@morpho-org/morpho-ts";
import { type Address, type Hash, padHex, zeroAddress } from "viem";

/** Address of the Midnight adapter added by {@link withMidnightAdapter}. */
export const MIDNIGHT_ADAPTER = "0x0000000000000000000000000000000000001A01";

/**
 * Returns `vaultData` with an empty Midnight adapter snapshot added beside its adapters.
 *
 * @param vaultData - Vault V2 snapshot to extend.
 * @param params.liquidity - Routes the vault's liquidity through the Midnight adapter.
 * @param params.sole - Replaces the vault's adapters with the Midnight adapter.
 * @param params.credit - Credit the adapter holds in one Midnight market maturing in a year.
 * @returns A new Vault V2 snapshot holding the Midnight adapter.
 */
export const withMidnightAdapter = (
  vaultData: AccrualVaultV2,
  params: {
    readonly liquidity?: boolean;
    readonly sole?: boolean;
    readonly credit?: bigint;
  } = {},
) => {
  const marketId: Hash = padHex("0x1", { size: 32 });
  const markets =
    params.credit == null
      ? []
      : [
          {
            id: marketId,
            position: {
              credit: params.credit,
              pendingFee: 0n,
              lastLossFactor: 0n,
              lastAccrual: vaultData.lastUpdate,
            },
            market: { lossFactor: 0n },
          },
        ];
  const midnight = new AccrualVaultV2MidnightAdapter({
    adapter: {
      address: MIDNIGHT_ADAPTER,
      parentVault: vaultData.address,
      skimRecipient: zeroAddress,
      asset: vaultData.asset,
      midnight: zeroAddress,
      marketIds: markets.map(({ id }) => id),
      marketData: Object.fromEntries(
        markets.map(({ id, position }) => [
          id,
          {
            netCredit: position.credit,
            rate: 0n,
            maturity: vaultData.lastUpdate + Time.s.from.y(1n),
            index: 0n,
            forceSellable: false,
          },
        ]),
      ),
      durations: [],
      durationAllocations: [],
      maxTtm: 0n,
      minRate: 0n,
      noSalesWithShortfall: false,
      noSalesBelowFaceValue: false,
    },
    markets,
    lastUpdate: vaultData.lastUpdate,
  });
  const liquidityAdapter: Address = params.liquidity
    ? midnight.address
    : vaultData.liquidityAdapter;

  return new AccrualVaultV2(
    {
      ...vaultData,
      liquidityAdapter,
      liquidityData: params.liquidity ? "0x" : vaultData.liquidityData,
    },
    params.liquidity ? midnight : vaultData.accrualLiquidityAdapter,
    params.sole ? [midnight] : [...vaultData.accrualAdapters, midnight],
    vaultData.assetBalance,
    vaultData.forceDeallocatePenalties,
  );
};
