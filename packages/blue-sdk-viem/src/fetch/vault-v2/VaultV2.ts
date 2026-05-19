import {
  AccrualVaultV2,
  getChainAddresses,
  type IVaultV2Allocation,
  MarketParams,
  UnknownFactory,
  UnknownOfFactory,
  UnsupportedVaultV2AdapterError,
  VaultV2,
  VaultV2MorphoMarketV1AdapterV2,
  VaultV2MorphoVaultV1Adapter,
} from "@morpho-org/blue-sdk";
import {
  type Address,
  type Client,
  erc20Abi,
  type Hash,
  zeroAddress,
} from "viem";
import { getChainId, readContract } from "viem/actions";
import {
  morphoMarketV1AdapterV2FactoryAbi,
  morphoVaultV1AdapterFactoryAbi,
  vaultV2Abi,
  vaultV2FactoryAbi,
} from "../../abis.js";
import {
  getUnsupportedVaultV2Adapter,
  isUnknownOfFactoryError,
} from "../../error.js";
import { abi, code } from "../../queries/vault-v2/GetVaultV2.js";
import type { DeploylessFetchParameters } from "../../types.js";
import { fetchToken } from "../Token.js";
import { fetchAccrualVaultV2Adapter } from "./VaultV2Adapter.js";

/**
 * Fetches VaultV2 state and liquidity-cap data.
 *
 * Reads token metadata, vault accounting, fee configuration, adapter addresses, the configured
 * liquidity adapter, liquidity data, and cap allocations for supported liquidity adapters. Uses the
 * deployless `GetVaultV2` query by default and falls back to multicall when allowed.
 *
 * `MorphoMarketV1Adapter` has zero support as a VaultV2 liquidity adapter. This fetcher only loads
 * liquidity allocations for `MorphoVaultV1Adapter` and `MorphoMarketV1AdapterV2`; when a vault
 * configures the non-V2 market adapter as `liquidityAdapter`, the returned `VaultV2` preserves the
 * adapter address and liquidity data but leaves `liquidityAllocations` undefined. Fetch
 * `MorphoMarketV1Adapter` through `fetchVaultV2Adapter` when it is used as a regular adapter.
 *
 * @param address - Address of the VaultV2 to fetch.
 * @param client - Viem client used for deployless reads or multicalls.
 * @param parameters.account - Optional account passed to viem calls.
 * @param parameters.blockNumber - Optional block number for historical reads.
 * @param parameters.blockTag - Optional block tag for historical reads.
 * @param parameters.stateOverride - Optional viem state override.
 * @param parameters.chainId - Optional chain id; defaults to `getChainId(client)`.
 * @param parameters.deployless - Optional deployless read mode; defaults to `true`.
 * @returns The hydrated `VaultV2` entity. `liquidityAllocations` is undefined when no liquidity
 *   adapter is configured or when the configured liquidity adapter is unsupported.
 * @throws {UnknownFactory} when the configured chain has no VaultV2 factory.
 * @throws {UnknownOfFactory} when `address` is not a VaultV2 from the configured factory.
 * @throws {UnsupportedVaultV2AdapterError} when a recognized liquidity adapter is configured with
 *   unsupported liquidity data.
 * @example
 * ```ts
 * import type { VaultV2 } from "@morpho-org/blue-sdk";
 * import { fetchVaultV2 } from "@morpho-org/blue-sdk-viem";
 * import { createPublicClient, http } from "viem";
 * import { base } from "viem/chains";
 *
 * const client = createPublicClient({ chain: base, transport: http() });
 * const vaultV2Address = "0xfDE48B9B8568189f629Bc5209bf5FA826336557a";
 *
 * const vault: VaultV2 = await fetchVaultV2(vaultV2Address, client);
 * ```
 */
// biome-ignore lint/complexity/useMaxParams: TODO refactor to ≤2 params
export async function fetchVaultV2(
  address: Address,
  client: Client,
  { deployless = true, ...parameters }: DeploylessFetchParameters = {},
) {
  parameters.chainId ??= await getChainId(client);

  const {
    morphoVaultV1AdapterFactory,
    morphoMarketV1AdapterV2Factory,
    vaultV2Factory,
  } = getChainAddresses(parameters.chainId);

  if (!vaultV2Factory) {
    throw new UnknownFactory();
  }

  if (deployless) {
    try {
      const { token, isLiquidityAdapterKnown, liquidityAllocations, ...vault } =
        await readContract(client, {
          ...parameters,
          abi,
          code,
          functionName: "query",
          args: [
            address,
            vaultV2Factory,
            morphoVaultV1AdapterFactory ?? zeroAddress,
            morphoMarketV1AdapterV2Factory ?? zeroAddress,
          ],
        });

      return new VaultV2({
        ...token,
        ...vault,
        address,
        adapters: [...vault.adapters],
        liquidityAllocations: isLiquidityAdapterKnown
          ? [...liquidityAllocations]
          : undefined,
      });
    } catch (error) {
      const unsupportedAdapter = getUnsupportedVaultV2Adapter(error);
      if (unsupportedAdapter != null)
        throw new UnsupportedVaultV2AdapterError(unsupportedAdapter);

      if (deployless === "force") throw error;
      if (isUnknownOfFactoryError(error)) throw error;
      // Fallback to multicall if deployless call fails.
    }
  }

  const [
    token,
    isVaultV2,
    asset,
    totalSupply,
    _totalAssets,
    performanceFee,
    managementFee,
    virtualShares,
    lastUpdate,
    maxRate,
    liquidityAdapter,
    liquidityData,
    adaptersLength,
    performanceFeeRecipient,
    managementFeeRecipient,
  ] = await Promise.all([
    fetchToken(address, client, { ...parameters, deployless }),

    readContract(client, {
      ...parameters,
      address: vaultV2Factory,
      abi: vaultV2FactoryAbi,
      functionName: "isVaultV2",
      args: [address],
    }),
    readContract(client, {
      ...parameters,
      address,
      abi: vaultV2Abi,
      functionName: "asset",
    }),
    readContract(client, {
      ...parameters,
      address,
      abi: vaultV2Abi,
      functionName: "totalSupply",
    }),
    readContract(client, {
      ...parameters,
      address,
      abi: vaultV2Abi,
      functionName: "_totalAssets",
    }),
    readContract(client, {
      ...parameters,
      address,
      abi: vaultV2Abi,
      functionName: "performanceFee",
    }),
    readContract(client, {
      ...parameters,
      address,
      abi: vaultV2Abi,
      functionName: "managementFee",
    }),
    readContract(client, {
      ...parameters,
      address,
      abi: vaultV2Abi,
      functionName: "virtualShares",
    }),
    readContract(client, {
      ...parameters,
      address,
      abi: vaultV2Abi,
      functionName: "lastUpdate",
    }),
    readContract(client, {
      ...parameters,
      address,
      abi: vaultV2Abi,
      functionName: "maxRate",
    }),
    readContract(client, {
      ...parameters,
      address,
      abi: vaultV2Abi,
      functionName: "liquidityAdapter",
    }),
    readContract(client, {
      ...parameters,
      address,
      abi: vaultV2Abi,
      functionName: "liquidityData",
    }),
    readContract(client, {
      ...parameters,
      address,
      abi: vaultV2Abi,
      functionName: "adaptersLength",
    }),
    readContract(client, {
      ...parameters,
      address,
      abi: vaultV2Abi,
      functionName: "performanceFeeRecipient",
    }),
    readContract(client, {
      ...parameters,
      address,
      abi: vaultV2Abi,
      functionName: "managementFeeRecipient",
    }),
  ]);

  if (!isVaultV2) {
    throw new UnknownOfFactory(vaultV2Factory, address);
  }

  const [
    hasMorphoVaultV1LiquidityAdapter,
    hasMorphoMarketV1AdapterV2LiquidityAdapter,
    ...adapters
  ] = await Promise.all([
    morphoVaultV1AdapterFactory != null && liquidityAdapter !== zeroAddress
      ? readContract(client, {
          address: morphoVaultV1AdapterFactory,
          abi: morphoVaultV1AdapterFactoryAbi,
          functionName: "isMorphoVaultV1Adapter",
          args: [liquidityAdapter],
          ...parameters,
        })
      : undefined,
    morphoMarketV1AdapterV2Factory != null && liquidityAdapter !== zeroAddress
      ? readContract(client, {
          address: morphoMarketV1AdapterV2Factory,
          abi: morphoMarketV1AdapterV2FactoryAbi,
          functionName: "isMorphoMarketV1AdapterV2",
          args: [liquidityAdapter],
          ...parameters,
        })
      : undefined,
    ...Array.from({ length: Number(adaptersLength) }, (_, i) =>
      readContract(client, {
        ...parameters,
        address,
        abi: vaultV2Abi,
        functionName: "adapters",
        args: [BigInt(i)],
      }),
    ),
  ]);

  if (hasMorphoVaultV1LiquidityAdapter && liquidityData !== "0x")
    throw new UnsupportedVaultV2AdapterError(liquidityAdapter);

  let liquidityAdapterIds: Hash[] | undefined;
  if (hasMorphoVaultV1LiquidityAdapter)
    liquidityAdapterIds = [
      VaultV2MorphoVaultV1Adapter.adapterId(liquidityAdapter),
    ];
  if (hasMorphoMarketV1AdapterV2LiquidityAdapter) {
    const marketParams = MarketParams.fromHex(liquidityData);
    liquidityAdapterIds = [
      VaultV2MorphoMarketV1AdapterV2.adapterId(liquidityAdapter),
      VaultV2MorphoMarketV1AdapterV2.collateralId(marketParams.collateralToken),
      VaultV2MorphoMarketV1AdapterV2.marketParamsId(
        liquidityAdapter,
        marketParams,
      ),
    ];
  }

  let liquidityAllocations: IVaultV2Allocation[] | undefined;
  if (liquidityAdapterIds != null)
    liquidityAllocations = await Promise.all(
      liquidityAdapterIds.map(async (id) => {
        const [absoluteCap, relativeCap, allocation] = await Promise.all([
          readContract(client, {
            ...parameters,
            address,
            abi: vaultV2Abi,
            functionName: "absoluteCap",
            args: [id],
          }),
          readContract(client, {
            ...parameters,
            address,
            abi: vaultV2Abi,
            functionName: "relativeCap",
            args: [id],
          }),
          readContract(client, {
            ...parameters,
            address,
            abi: vaultV2Abi,
            functionName: "allocation",
            args: [id],
          }),
        ]);

        return {
          id,
          absoluteCap,
          relativeCap,
          allocation,
        };
      }),
    );

  return new VaultV2({
    ...token,
    asset,
    _totalAssets,
    totalSupply,
    virtualShares,
    maxRate,
    lastUpdate,
    adapters,
    liquidityAdapter,
    liquidityData,
    liquidityAllocations,
    performanceFee,
    managementFee,
    performanceFeeRecipient,
    managementFeeRecipient,
  });
}

/**
 * Fetches VaultV2 state with accrual data for capacity calculations.
 *
 * Reads all state fetched by `fetchVaultV2`, the vault asset balance, accrual state for the
 * configured liquidity adapter and regular adapters, and force-deallocate penalties.
 *
 * `MorphoMarketV1Adapter` has zero support as a VaultV2 liquidity adapter. This fetcher may hydrate
 * that adapter as an accrual adapter, but liquidity cap allocations remain undefined because
 * `fetchVaultV2` only loads allocations for `MorphoVaultV1Adapter` and
 * `MorphoMarketV1AdapterV2`. Calling `maxDeposit` on the returned `AccrualVaultV2` therefore throws
 * `VaultV2Errors.UnsupportedLiquidityAdapter` for a non-V2 market adapter liquidity adapter.
 *
 * @param address - Address of the VaultV2 to fetch.
 * @param client - Viem client used for deployless reads or multicalls.
 * @param parameters.account - Optional account passed to viem calls.
 * @param parameters.blockNumber - Optional block number for historical reads.
 * @param parameters.blockTag - Optional block tag for historical reads.
 * @param parameters.stateOverride - Optional viem state override.
 * @param parameters.chainId - Optional chain id; defaults to `getChainId(client)`.
 * @param parameters.deployless - Optional deployless read mode; defaults to `true`.
 * @returns The hydrated `AccrualVaultV2` entity with asset balance, accrual adapters, and
 *   force-deallocate penalties.
 * @throws {UnknownFactory} when the configured chain has no VaultV2 factory.
 * @throws {UnknownOfFactory} when `address` is not a VaultV2 from the configured factory.
 * @throws {UnsupportedVaultV2AdapterError} when the vault or one of its adapters uses an
 *   unsupported adapter class.
 * @example
 * ```ts
 * import type { AccrualVaultV2 } from "@morpho-org/blue-sdk";
 * import { fetchAccrualVaultV2 } from "@morpho-org/blue-sdk-viem";
 * import { createPublicClient, http } from "viem";
 * import { base } from "viem/chains";
 *
 * const client = createPublicClient({ chain: base, transport: http() });
 * const vaultV2Address = "0xfDE48B9B8568189f629Bc5209bf5FA826336557a";
 *
 * const vault: AccrualVaultV2 = await fetchAccrualVaultV2(vaultV2Address, client);
 * ```
 */
// biome-ignore lint/complexity/useMaxParams: TODO refactor to ≤2 params
export async function fetchAccrualVaultV2(
  address: Address,
  client: Client,
  parameters: DeploylessFetchParameters = {},
) {
  parameters.chainId ??= await getChainId(client);

  const vaultV2 = await fetchVaultV2(address, client, parameters);

  const [assetBalance, liquidityAdapter, ...adapterResults] = await Promise.all(
    [
      readContract(client, {
        ...parameters,
        address: vaultV2.asset,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [vaultV2.address],
      }),
      vaultV2.liquidityAdapter !== zeroAddress
        ? fetchAccrualVaultV2Adapter(
            vaultV2.liquidityAdapter,
            client,
            parameters,
          )
        : undefined,
      ...vaultV2.adapters.map(async (adapter) => {
        const [accrualAdapter, forceDeallocatePenalty] = await Promise.all([
          fetchAccrualVaultV2Adapter(adapter, client, parameters),
          readContract(client, {
            ...parameters,
            address,
            abi: vaultV2Abi,
            functionName: "forceDeallocatePenalty",
            args: [adapter],
          }),
        ]);
        return { accrualAdapter, forceDeallocatePenalty };
      }),
    ],
  );

  const adapters = adapterResults.map((r) => r.accrualAdapter);
  const forceDeallocatePenalties = Object.fromEntries(
    adapterResults.map((r) => [
      r.accrualAdapter.address,
      r.forceDeallocatePenalty,
    ]),
  );

  return new AccrualVaultV2(
    vaultV2,
    liquidityAdapter,
    adapters,
    assetBalance,
    forceDeallocatePenalties,
  );
}
