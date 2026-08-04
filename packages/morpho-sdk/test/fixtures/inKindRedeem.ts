import {
  AccrualPosition,
  AccrualVault,
  AccrualVaultV2,
  AccrualVaultV2MorphoMarketV1Adapter,
  AccrualVaultV2MorphoMarketV1AdapterV2,
  Market,
  MarketParams,
  registerCustomAddresses,
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
export const IN_KIND_BUNDLER =
  "0x0000000000000000000000000000000000001005" as const;

export const inKindMarketParams = new MarketParams({
  loanToken: IN_KIND_ASSET,
  collateralToken: "0x0000000000000000000000000000000000001006",
  oracle: "0x0000000000000000000000000000000000001007",
  irm: "0x0000000000000000000000000000000000001008",
  lltv: 860_000_000_000_000_000n,
});

registerCustomAddresses({
  addresses: {
    [mainnet.id]: { bundles: { vaultExitBundlesV1: IN_KIND_BUNDLER } },
  },
});

const futureTimestamp = () => Time.timestamp() + Time.s.from.d(1n);

const inKindMarket = () =>
  new Market({
    params: inKindMarketParams,
    totalSupplyAssets: 1_000n,
    totalBorrowAssets: 900n,
    totalSupplyShares: 1_000_000_000n,
    totalBorrowShares: 900n,
    lastUpdate: futureTimestamp(),
    fee: 0n,
  });

export const inKindVaultV1Data = (params?: {
  readonly address?: Address;
  readonly supplyShares?: bigint;
  readonly enabled?: boolean;
}) => {
  const market = inKindMarket();
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
      fee: 0n,
      feeRecipient: IN_KIND_USER,
      skimRecipient: IN_KIND_USER,
      pendingTimelock: { value: 0n, validAt: 0n },
      pendingGuardian: { value: IN_KIND_USER, validAt: 0n },
      pendingOwner: IN_KIND_USER,
      timelock: 0n,
      supplyQueue: [market.id],
      totalSupply: 1_000n,
      lastTotalAssets: 1_000n,
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
    ],
  );
};

export const inKindVaultV2Data = (params?: {
  readonly address?: Address;
  readonly supplyShares?: bigint;
  readonly penalty?: bigint;
  readonly adapters?: "single" | "empty" | "legacy";
}) => {
  const address = params?.address ?? IN_KIND_VAULT;
  const market = inKindMarket();
  const adapter = new AccrualVaultV2MorphoMarketV1AdapterV2(
    {
      address: IN_KIND_ADAPTER,
      parentVault: address,
      skimRecipient: IN_KIND_USER,
      marketIds: [market.id],
      adaptiveCurveIrm: inKindMarketParams.irm,
      supplyShares: {
        [market.id]: params?.supplyShares ?? 1_000_000_000n,
      },
    },
    [market],
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

  return new AccrualVaultV2(
    {
      address,
      name: "In Kind V2",
      symbol: "ikV2",
      decimals: 18,
      asset: IN_KIND_ASSET,
      _totalAssets: 1_000n,
      totalSupply: 1_000n,
      virtualShares: 0n,
      maxRate: 0n,
      lastUpdate: futureTimestamp(),
      liquidityAdapter: ZERO_ADDRESS,
      liquidityData: "0x",
      liquidityAllocations: undefined,
      performanceFee: 0n,
      managementFee: 0n,
      performanceFeeRecipient: IN_KIND_USER,
      managementFeeRecipient: IN_KIND_USER,
    },
    undefined,
    adapters,
    0n,
    { [IN_KIND_ADAPTER]: params?.penalty ?? 0n },
  );
};

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
