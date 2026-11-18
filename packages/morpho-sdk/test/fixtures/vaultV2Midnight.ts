import {
  AccrualVaultV2,
  AccrualVaultV2MidnightAdapter,
  VaultV2MidnightAdapterUtils,
} from "@morpho-org/blue-sdk";
import { Time } from "@morpho-org/morpho-ts";
import { midnightMarketAbi } from "@morpho-org/morpho-ts/abis/midnight";
import {
  type Address,
  encodeAbiParameters,
  type Hash,
  type Hex,
  padHex,
  zeroAddress,
} from "viem";

/** Address of the Midnight adapter added by {@link withMidnightAdapter}. */
export const MIDNIGHT_ADAPTER = "0x0000000000000000000000000000000000001A01";

/**
 * Returns `vaultData` with an empty Midnight adapter snapshot added beside its adapters.
 *
 * @param vaultData - Vault V2 snapshot to extend.
 * @param params.liquidity - Routes the vault's liquidity through the Midnight adapter.
 * @param params.sole - Replaces the vault's adapters with the Midnight adapter.
 * @param params.credit - Credit the adapter holds in one Midnight market maturing in a year.
 * @param params.withdrawable - Withdrawable liquidity of that market. When set, the market is a real
 * Midnight market struct and, with `liquidity`, the vault's liquidity data encodes it.
 * @returns A new Vault V2 snapshot holding the Midnight adapter.
 */
export const withMidnightAdapter = (
  vaultData: AccrualVaultV2,
  params: {
    readonly liquidity?: boolean;
    readonly sole?: boolean;
    readonly credit?: bigint;
    readonly withdrawable?: bigint;
  } = {},
) => {
  const maturity = vaultData.lastUpdate + Time.s.from.y(1n);
  const liquidityMarket = {
    chainId: 1n,
    midnight: zeroAddress,
    loanToken: vaultData.asset,
    collateralParams: [],
    maturity,
    rcfThreshold: 0n,
    enterGate: zeroAddress,
    liquidatorGate: zeroAddress,
  } as const;
  const marketId: Hash =
    params.withdrawable == null
      ? padHex("0x1", { size: 32 })
      : VaultV2MidnightAdapterUtils.marketId(liquidityMarket);
  const liquidityData: Hex =
    params.withdrawable == null
      ? "0x"
      : encodeAbiParameters([midnightMarketAbi], [liquidityMarket]);
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
            market: { lossFactor: 0n, withdrawable: params.withdrawable },
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
            netRate: 0n,
            maturity,
            index: 0n,
            forceSellable: false,
            forceRemoved: false,
            minForceSellPrice: 0n,
          },
        ]),
      ),
      durations: [],
      durationAllocations: [],
      maxTtm: 0n,
      minNetBuyRate: 0n,
      maxNetSellRate: 0n,
      shortfallAllowance: 0n,
      enterGateFactory: "0x0000000000000000000000000000000000000000",
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
      liquidityData: params.liquidity ? liquidityData : vaultData.liquidityData,
    },
    params.liquidity ? midnight : vaultData.accrualLiquidityAdapter,
    params.sole ? [midnight] : [...vaultData.accrualAdapters, midnight],
    vaultData.assetBalance,
    vaultData.forceDeallocatePenalties,
  );
};
