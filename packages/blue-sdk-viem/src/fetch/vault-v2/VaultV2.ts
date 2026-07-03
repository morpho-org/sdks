import {
  AccrualPosition,
  AccrualVault,
  AccrualVaultV2,
  AccrualVaultV2MorphoMarketV1Adapter,
  AccrualVaultV2MorphoMarketV1AdapterV2,
  AccrualVaultV2MorphoVaultV1Adapter,
  getChainAddresses,
  type IAccrualVaultV2Adapter,
  type IVaultV2Allocation,
  Market,
  type MarketId,
  MarketParams,
  Position,
  UnknownFactory,
  UnknownOfFactory,
  UnsupportedVaultV2AdapterError,
  Vault,
  VaultMarketConfig,
  VaultV2,
  VaultV2MorphoMarketV1Adapter,
  VaultV2MorphoMarketV1AdapterV2,
  VaultV2MorphoVaultV1Adapter,
} from "@morpho-org/blue-sdk";
import {
  type Address,
  type Client,
  type ContractFunctionReturnType,
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
import {
  abi as getAccrualVaultV2Abi,
  code as getAccrualVaultV2Code,
} from "../../queries/vault-v2/GetAccrualVaultV2.js";
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

/** @internal Decoded shape of the deployless `GetAccrualVaultV2.query` response. */
type AccrualVaultV2QueryResponse = ContractFunctionReturnType<
  typeof getAccrualVaultV2Abi,
  "view",
  "query"
>;
/** @internal One adapter entry of the deployless `GetAccrualVaultV2.query` response. */
type AdapterQueryResponse = AccrualVaultV2QueryResponse["adapters"][number];
/** @internal One market entry of the deployless `GetAccrualVaultV2.query` response. */
type MarketQueryResponse =
  AdapterQueryResponse["marketV1Positions"][number]["market"];

/** @internal Mirrors the `AdapterType` enum encoded by `GetAccrualVaultV2.sol`. */
const AdapterType = {
  Unknown: 0,
  MorphoVaultV1: 1,
  MorphoMarketV1: 2,
  MorphoMarketV1AdapterV2: 3,
} as const;

/** @internal Rebuilds a `Market` from a deployless `GetAccrualVaultV2` market response. */
function toMarket(
  response: MarketQueryResponse,
  adaptiveCurveIrm: Address,
): Market {
  return new Market({
    params: new MarketParams(response.marketParams),
    ...response.market,
    price: response.hasPrice ? response.price : undefined,
    rateAtTarget:
      response.marketParams.irm === adaptiveCurveIrm
        ? response.rateAtTarget
        : undefined,
  });
}

/** @internal Rebuilds one accrued adapter from a deployless `GetAccrualVaultV2` adapter response. */
function toAccrualAdapter(
  adapter: AdapterQueryResponse,
  adaptiveCurveIrm: Address,
): IAccrualVaultV2Adapter {
  const base = {
    address: adapter.adapter,
    parentVault: adapter.parentVault,
    skimRecipient: adapter.skimRecipient,
  };

  switch (adapter.adapterType) {
    case AdapterType.MorphoVaultV1: {
      const { morphoVaultV1, vaultV1 } = adapter;

      const vault = new Vault({
        address: morphoVaultV1,
        asset: vaultV1.config.asset,
        symbol: vaultV1.config.symbol,
        name: vaultV1.config.name,
        decimalsOffset: vaultV1.config.decimalsOffset,
        owner: vaultV1.owner,
        curator: vaultV1.curator,
        guardian: vaultV1.guardian,
        feeRecipient: vaultV1.feeRecipient,
        skimRecipient: vaultV1.skimRecipient,
        timelock: vaultV1.timelock,
        fee: vaultV1.fee,
        pendingOwner: vaultV1.pendingOwner,
        pendingGuardian: {
          value: vaultV1.pendingGuardian.value,
          validAt: vaultV1.pendingGuardian.validAt,
        },
        pendingTimelock: {
          value: vaultV1.pendingTimelock.value,
          validAt: vaultV1.pendingTimelock.validAt,
        },
        supplyQueue: [...vaultV1.supplyQueue] as MarketId[],
        withdrawQueue: [...vaultV1.withdrawQueue] as MarketId[],
        totalSupply: vaultV1.totalSupply,
        // Overridden by `AccrualVault` with the sum of allocations' supply assets.
        totalAssets: 0n,
        lastTotalAssets: vaultV1.lastTotalAssets,
        lostAssets: vaultV1.hasLostAssets ? vaultV1.lostAssets : undefined,
      });

      const allocations = adapter.vaultV1Allocations.map((allocation, i) => {
        const marketId = vaultV1.withdrawQueue[i] as MarketId;
        const market = toMarket(allocation.market, adaptiveCurveIrm);

        return {
          config: new VaultMarketConfig({
            vault: morphoVaultV1,
            marketId,
            cap: allocation.cap,
            pendingCap: {
              value: allocation.pendingCap.value,
              validAt: allocation.pendingCap.validAt,
            },
            removableAt: allocation.removableAt,
            enabled: allocation.enabled,
          }),
          position: new AccrualPosition(
            new Position({
              user: morphoVaultV1,
              marketId,
              supplyShares: allocation.position.supplyShares,
              borrowShares: allocation.position.borrowShares,
              collateral: allocation.position.collateral,
            }),
            market,
          ),
        };
      });

      return new AccrualVaultV2MorphoVaultV1Adapter(
        new VaultV2MorphoVaultV1Adapter({ ...base, morphoVaultV1 }),
        new AccrualVault(vault, allocations),
        adapter.vaultV1Shares,
      );
    }

    case AdapterType.MorphoMarketV1: {
      const positions = adapter.marketV1Positions.map((entry) => {
        const market = toMarket(entry.market, adaptiveCurveIrm);

        return new AccrualPosition(
          new Position({
            user: adapter.adapter,
            marketId: market.id,
            supplyShares: entry.position.supplyShares,
            borrowShares: entry.position.borrowShares,
            collateral: entry.position.collateral,
          }),
          market,
        );
      });

      return new AccrualVaultV2MorphoMarketV1Adapter(
        new VaultV2MorphoMarketV1Adapter({
          ...base,
          marketParamsList: adapter.marketV1Positions.map(
            (entry) => new MarketParams(entry.market.marketParams),
          ),
        }),
        positions,
      );
    }

    case AdapterType.MorphoMarketV1AdapterV2: {
      const markets = adapter.marketV1V2Allocations.map((entry) =>
        toMarket(entry.market, adaptiveCurveIrm),
      );

      return new AccrualVaultV2MorphoMarketV1AdapterV2(
        new VaultV2MorphoMarketV1AdapterV2({
          ...base,
          adaptiveCurveIrm: adapter.adaptiveCurveIrm,
          marketIds: adapter.marketV1V2Allocations.map(
            (entry) => entry.marketId as MarketId,
          ),
          supplyShares: Object.fromEntries(
            adapter.marketV1V2Allocations.map((entry) => [
              entry.marketId,
              entry.supplyShares,
            ]),
          ),
        }),
        markets,
      );
    }

    default:
      throw new UnsupportedVaultV2AdapterError(adapter.adapter);
  }
}

/**
 * Fetches the full VaultV2 accrual tree in a single deployless call.
 *
 * Unlike {@link fetchAccrualVaultV2}, which chains sequential reads (vault, then each adapter, then
 * each adapter's markets or wrapped MetaMorpho V1 vault), this reader traverses the entire tree
 * on-chain through the deployless `GetAccrualVaultV2` query and returns the hydrated entity from one
 * `eth_call`. It is deployless-only: there is no multicall fallback, so it throws if the deployless
 * read fails (equivalent to `deployless: "force"`), and requires every configured adapter factory to
 * be deployed at the queried block.
 *
 * The returned `AccrualVaultV2` is behaviorally identical to `fetchAccrualVaultV2`'s output. The
 * nested MetaMorpho V1 vault of a `MorphoVaultV1Adapter` omits two capacity-irrelevant optional
 * fields for query-size reasons: its EIP-5267 domain (`eip5267Domain`) and PublicAllocator config
 * (both vault-level and per-market `publicAllocatorConfig`). All accounting and capacity outputs
 * (`maxDeposit`, `maxWithdraw`, `accrueInterest`, per-adapter `realAssets`) match exactly.
 *
 * @param address - Address of the VaultV2 to fetch.
 * @param client - Viem client used for the deployless read.
 * @param parameters.account - Optional account passed to the viem call.
 * @param parameters.blockNumber - Optional block number for a historical read.
 * @param parameters.blockTag - Optional block tag for a historical read.
 * @param parameters.stateOverride - Optional viem state override.
 * @param parameters.chainId - Optional chain id; defaults to `getChainId(client)`.
 * @returns The hydrated `AccrualVaultV2` entity with asset balance, accrued liquidity and regular
 *   adapters, and force-deallocate penalties.
 * @throws {UnknownFactory} when the configured chain has no VaultV2 factory.
 * @throws {UnknownOfFactory} when `address` is not a VaultV2 from the configured factory.
 * @throws {UnsupportedVaultV2AdapterError} when the vault or one of its adapters uses an unsupported
 *   adapter class.
 * @example
 * ```ts
 * import type { AccrualVaultV2 } from "@morpho-org/blue-sdk";
 * import { fetchAccrualVaultV2Deployless } from "@morpho-org/blue-sdk-viem";
 * import { createPublicClient, http } from "viem";
 * import { base } from "viem/chains";
 *
 * const client = createPublicClient({ chain: base, transport: http() });
 * const vaultV2Address = "0xfDE48B9B8568189f629Bc5209bf5FA826336557a";
 *
 * const vault: AccrualVaultV2 = await fetchAccrualVaultV2Deployless(
 *   vaultV2Address,
 *   client,
 * );
 * ```
 */
// biome-ignore lint/complexity/useMaxParams: TODO refactor to ≤2 params
export async function fetchAccrualVaultV2Deployless(
  address: Address,
  client: Client,
  parameters: DeploylessFetchParameters = {},
) {
  parameters.chainId ??= await getChainId(client);

  const {
    morpho,
    adaptiveCurveIrm,
    vaultV2Factory,
    morphoVaultV1AdapterFactory,
    morphoMarketV1AdapterFactory,
    morphoMarketV1AdapterV2Factory,
  } = getChainAddresses(parameters.chainId);

  if (!vaultV2Factory) {
    throw new UnknownFactory();
  }

  let response: AccrualVaultV2QueryResponse;
  try {
    response = await readContract(client, {
      ...parameters,
      abi: getAccrualVaultV2Abi,
      code: getAccrualVaultV2Code,
      functionName: "query",
      args: [
        address,
        vaultV2Factory,
        morphoVaultV1AdapterFactory ?? zeroAddress,
        morphoMarketV1AdapterFactory ?? zeroAddress,
        morphoMarketV1AdapterV2Factory ?? zeroAddress,
        morpho,
        adaptiveCurveIrm,
      ],
    });
  } catch (error) {
    const unsupportedAdapter = getUnsupportedVaultV2Adapter(error);
    if (unsupportedAdapter != null)
      throw new UnsupportedVaultV2AdapterError(unsupportedAdapter);

    if (isUnknownOfFactoryError(error))
      throw new UnknownOfFactory(vaultV2Factory, address);

    throw error;
  }

  const vaultV2 = new VaultV2({
    ...response.token,
    asset: response.asset,
    _totalAssets: response._totalAssets,
    totalSupply: response.totalSupply,
    virtualShares: response.virtualShares,
    maxRate: response.maxRate,
    lastUpdate: response.lastUpdate,
    address,
    adapters: response.adapters.map((adapter) => adapter.adapter),
    liquidityAdapter: response.liquidityAdapter,
    liquidityData: response.liquidityData,
    liquidityAllocations: response.isLiquidityAdapterKnown
      ? [...response.liquidityAllocations]
      : undefined,
    performanceFee: response.performanceFee,
    managementFee: response.managementFee,
    performanceFeeRecipient: response.performanceFeeRecipient,
    managementFeeRecipient: response.managementFeeRecipient,
  });

  const accrualLiquidityAdapter = response.hasLiquidityAdapter
    ? toAccrualAdapter(response.liquidityAdapterInfo, adaptiveCurveIrm)
    : undefined;

  const accrualAdapters = response.adapters.map((adapter) =>
    toAccrualAdapter(adapter, adaptiveCurveIrm),
  );

  const forceDeallocatePenalties = Object.fromEntries(
    response.adapters.map((adapter) => [
      adapter.adapter,
      adapter.forceDeallocatePenalty,
    ]),
  );

  return new AccrualVaultV2(
    vaultV2,
    accrualLiquidityAdapter,
    accrualAdapters,
    response.assetBalance,
    forceDeallocatePenalties,
  );
}
