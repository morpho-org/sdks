import {
  AccrualPosition,
  AccrualVault,
  AccrualVaultV2,
  AccrualVaultV2MorphoMarketV1Adapter,
  AccrualVaultV2MorphoMarketV1AdapterV2,
  getChainAddress,
  Market,
  MarketParams,
  marketParamsAbi,
} from "@morpho-org/blue-sdk";
import { Time, ZERO_ADDRESS } from "@morpho-org/morpho-ts";
import { type MockClientHandle, mockRead } from "@morpho-org/test/mock";
import {
  type Abi,
  type AbiStateMutability,
  type Address,
  type ContractFunctionName,
  type ContractFunctionReturnType,
  type EncodeFunctionResultParameters,
  encodeAbiParameters,
  encodeFunctionResult,
  type Hex,
  multicall3Abi,
} from "viem";
import { mainnet } from "viem/chains";

export const IN_KIND_VAULT =
  "0x0000000000000000000000000000000000001001" as const;
export const IN_KIND_ADAPTER =
  "0x0000000000000000000000000000000000001002" as const;
export const IN_KIND_ASSET =
  "0x0000000000000000000000000000000000001003" as const;
export const IN_KIND_USER =
  "0x0000000000000000000000000000000000001004" as const;
export const IN_KIND_BUNDLER = getChainAddress(
  mainnet.id,
  "bundles.vaultExitBundlesV1",
);

export const inKindMarketParams = new MarketParams({
  loanToken: IN_KIND_ASSET,
  collateralToken: "0x0000000000000000000000000000000000001006",
  oracle: "0x0000000000000000000000000000000000001007",
  irm: "0x0000000000000000000000000000000000001008",
  lltv: 860_000_000_000_000_000n,
});

export const secondInKindMarketParams = new MarketParams({
  loanToken: IN_KIND_ASSET,
  collateralToken: "0x0000000000000000000000000000000000001009",
  oracle: "0x0000000000000000000000000000000000001010",
  irm: "0x0000000000000000000000000000000000001011",
  lltv: 860_000_000_000_000_000n,
});

const snapshotTimestamp = () => Time.timestamp();

/** ABI-encodes market params the way Vault V2 stores `liquidityData`. */
const encodeMarketParams = (marketParams: MarketParams): Hex =>
  encodeAbiParameters([marketParamsAbi], [marketParams]);

export const inKindVaultV1Data = (params?: {
  readonly address?: Address;
  readonly supplyShares?: bigint;
  readonly enabled?: boolean;
  readonly additionalMarket?: boolean;
  readonly fee?: bigint;
  readonly lastTotalAssets?: bigint;
}) => {
  const market = new Market({
    params: inKindMarketParams,
    totalSupplyAssets: 1_000n,
    totalBorrowAssets: 900n,
    totalSupplyShares: 1_000_000_000n,
    totalBorrowShares: 900n,
    lastUpdate: snapshotTimestamp(),
    fee: 0n,
  });
  const secondMarket = new Market({
    params: secondInKindMarketParams,
    totalSupplyAssets: 500n,
    totalBorrowAssets: 450n,
    totalSupplyShares: 500_000_000n,
    totalBorrowShares: 450n,
    lastUpdate: snapshotTimestamp(),
    fee: 0n,
  });
  const markets = params?.additionalMarket ? [market, secondMarket] : [market];
  const totalAssets = params?.additionalMarket ? 1_500n : 1_000n;
  return new AccrualVault(
    {
      address: params?.address ?? IN_KIND_VAULT,
      name: "In Kind V1",
      symbol: "ikV1",
      asset: IN_KIND_ASSET,
      decimalsOffset: 0n,
      curator: IN_KIND_USER,
      owner: IN_KIND_USER,
      guardian: IN_KIND_USER,
      fee: params?.fee ?? 0n,
      feeRecipient: IN_KIND_USER,
      skimRecipient: IN_KIND_USER,
      pendingTimelock: { value: 0n, validAt: 0n },
      pendingGuardian: { value: IN_KIND_USER, validAt: 0n },
      pendingOwner: IN_KIND_USER,
      timelock: 0n,
      supplyQueue: markets.map(({ id }) => id),
      totalSupply: totalAssets,
      lastTotalAssets: params?.lastTotalAssets ?? totalAssets,
    },
    [
      {
        config: {
          vault: params?.address ?? IN_KIND_VAULT,
          marketId: market.id,
          cap: 2_000n,
          pendingCap: { value: 0n, validAt: 0n },
          removableAt: 0n,
          enabled: params?.enabled ?? true,
        },
        position: new AccrualPosition(
          {
            user: params?.address ?? IN_KIND_VAULT,
            supplyShares: params?.supplyShares ?? 1_000_000_000n,
            borrowShares: 0n,
            collateral: 0n,
          },
          market,
        ),
      },
      ...(params?.additionalMarket
        ? [
            {
              config: {
                vault: params?.address ?? IN_KIND_VAULT,
                marketId: secondMarket.id,
                cap: 2_000n,
                pendingCap: { value: 0n, validAt: 0n },
                removableAt: 0n,
                enabled: true,
              },
              position: new AccrualPosition(
                {
                  user: params?.address ?? IN_KIND_VAULT,
                  supplyShares: 500_000_000n,
                  borrowShares: 0n,
                  collateral: 0n,
                },
                secondMarket,
              ),
            },
          ]
        : []),
    ],
  );
};

/** Foreign liquidity adapter used to exercise the unresolvable-liquidity-adapter rejection. */
export const IN_KIND_FOREIGN_ADAPTER =
  "0x0000000000000000000000000000000000001005" as const;

export const inKindVaultV2Data = (params?: {
  readonly address?: Address;
  readonly supplyShares?: bigint;
  readonly penalty?: bigint;
  readonly assetBalance?: bigint;
  readonly totalAssets?: bigint;
  readonly marketTotalAssets?: bigint;
  readonly marketTotalBorrowAssets?: bigint;
  readonly marketTotalSupplyShares?: bigint;
  readonly secondMarketTotalAssets?: bigint;
  readonly secondMarketTotalBorrowAssets?: bigint;
  readonly secondMarketSupplyShares?: bigint;
  readonly rateAtTarget?: bigint;
  readonly maxRate?: bigint;
  readonly managementFee?: bigint;
  readonly adapters?: "single" | "empty" | "legacy";
  readonly additionalMarket?: boolean;
  /**
   * Liquidity routing: `"none"` leaves it unset, `"sole"` routes through the vault's own adapter
   * and first market, `"foreign"` points at an unrelated adapter, `"undecodable"` keeps the sole
   * adapter but stores `liquidityData` the contract cannot ABI-decode as `MarketParams`.
   */
  readonly liquidityAdapter?: "none" | "sole" | "foreign" | "undecodable";
  /** Market the `"sole"` liquidity adapter routes through. Defaults to the first market. */
  readonly liquidityMarket?: "first" | "second";
}) => {
  const address = params?.address ?? IN_KIND_VAULT;
  const marketTotalAssets = params?.marketTotalAssets ?? 1_000n;
  const marketTotalSupplyShares =
    params?.marketTotalSupplyShares ?? 1_000_000_000n;
  const market = new Market({
    params: inKindMarketParams,
    totalSupplyAssets: marketTotalAssets,
    totalBorrowAssets:
      params?.marketTotalBorrowAssets ?? (marketTotalAssets * 9n) / 10n,
    totalSupplyShares: marketTotalSupplyShares,
    totalBorrowShares: 900n,
    lastUpdate: snapshotTimestamp(),
    fee: 0n,
    rateAtTarget: params?.rateAtTarget,
  });
  const secondMarketTotalAssets = params?.secondMarketTotalAssets ?? 500n;
  const secondMarket = new Market({
    params: secondInKindMarketParams,
    totalSupplyAssets: secondMarketTotalAssets,
    totalBorrowAssets:
      params?.secondMarketTotalBorrowAssets ??
      (secondMarketTotalAssets * 9n) / 10n,
    totalSupplyShares: secondMarketTotalAssets * 1_000_000n,
    totalBorrowShares: 450n,
    lastUpdate: snapshotTimestamp(),
    fee: 0n,
  });
  const markets = params?.additionalMarket ? [market, secondMarket] : [market];
  const totalAssets =
    params?.totalAssets ??
    (params?.additionalMarket ? 1_500n : marketTotalAssets);
  const adapter = new AccrualVaultV2MorphoMarketV1AdapterV2(
    {
      address: IN_KIND_ADAPTER,
      parentVault: address,
      skimRecipient: IN_KIND_USER,
      marketIds: markets.map(({ id }) => id),
      adaptiveCurveIrm: inKindMarketParams.irm,
      supplyShares: {
        [market.id]: params?.supplyShares ?? 1_000_000_000n,
        ...(params?.additionalMarket
          ? {
              [secondMarket.id]:
                params?.secondMarketSupplyShares ?? 500_000_000n,
            }
          : {}),
      },
    },
    markets,
  );
  const legacyAdapter = new AccrualVaultV2MorphoMarketV1Adapter(
    {
      address: IN_KIND_ADAPTER,
      parentVault: address,
      skimRecipient: IN_KIND_USER,
      marketParamsList: [market.params],
    },
    [
      new AccrualPosition(
        {
          user: IN_KIND_ADAPTER,
          supplyShares: params?.supplyShares ?? 1_000_000_000n,
          borrowShares: 0n,
          collateral: 0n,
        },
        market,
      ),
    ],
  );
  const adapters =
    params?.adapters === "empty"
      ? []
      : [params?.adapters === "legacy" ? legacyAdapter : adapter];

  const liquidityMarketParams =
    params?.liquidityMarket === "second"
      ? secondInKindMarketParams
      : inKindMarketParams;
  const [liquidityAdapter, liquidityData] = ((): [Address, Hex] => {
    switch (params?.liquidityAdapter) {
      case "sole":
        return [IN_KIND_ADAPTER, encodeMarketParams(liquidityMarketParams)];
      case "foreign":
        return [
          IN_KIND_FOREIGN_ADAPTER,
          encodeMarketParams(liquidityMarketParams),
        ];
      case "undecodable":
        return [IN_KIND_ADAPTER, "0xdead"];
      default:
        return [ZERO_ADDRESS, "0x"];
    }
  })();

  return new AccrualVaultV2(
    {
      address,
      name: "In Kind V2",
      symbol: "ikV2",
      decimals: 18,
      asset: IN_KIND_ASSET,
      _totalAssets: totalAssets,
      totalSupply: totalAssets,
      virtualShares: 0n,
      maxRate: params?.maxRate ?? 0n,
      lastUpdate: snapshotTimestamp(),
      liquidityAdapter,
      liquidityData,
      liquidityAllocations: undefined,
      performanceFee: 0n,
      managementFee: params?.managementFee ?? 0n,
      performanceFeeRecipient: IN_KIND_USER,
      managementFeeRecipient: IN_KIND_USER,
    },
    params?.liquidityAdapter === "sole" ? adapter : undefined,
    adapters,
    params?.assetBalance ?? 0n,
    { [IN_KIND_ADAPTER]: params?.penalty ?? 0n },
  );
};

/**
 * Vault V2 snapshot fixture for VaultExitBundlesV1 exits.
 *
 * Same shape for in-kind redemption and force withdrawal; the force-withdraw tests use this name
 * because the fixture is not in-kind-specific.
 */
export const vaultV2ExitData = inKindVaultV2Data;

export const encodeReadResult = <
  const abi extends Abi,
  functionName extends ContractFunctionName<abi, "view" | "pure">,
>(params: {
  readonly abi: abi;
  readonly functionName: functionName;
  readonly result: ContractFunctionReturnType<
    abi,
    AbiStateMutability,
    functionName
  >;
}): Hex =>
  encodeFunctionResult({
    abi: params.abi,
    functionName: params.functionName,
    result: params.result,
  } as EncodeFunctionResultParameters<abi, functionName>);

export const mockMulticallResults = (
  handle: MockClientHandle,
  returnData: readonly Hex[],
) => {
  const multicallAddress = mainnet.contracts.multicall3.address;
  mockRead(handle, {
    address: multicallAddress,
    abi: multicall3Abi,
    functionName: "aggregate3",
    result: returnData.map((data) => ({ success: true, returnData: data })),
  });
};
