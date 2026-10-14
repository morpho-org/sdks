import { ChainId, getChainAddress, MathLib } from "@morpho-org/morpho-ts";
import {
  midnightAdapterAbi,
  midnightAdapterFactoryAbi,
  midnightCollateralParamsAbi,
  vaultV2Abi,
  vaultV2FactoryAbi,
} from "@morpho-org/morpho-ts/abis";
import {
  type Address,
  type ContractFunctionArgs,
  encodeAbiParameters,
  encodeFunctionData,
  type Hash,
  type Hex,
  maxUint32,
  maxUint128,
  parseEther,
  zeroHash,
} from "viem";
import type { base } from "viem/chains";
import type { AnvilTestClient } from "./client.js";

/** Base block used by Midnight adapter fork fixtures. */
export const BASE_MIDNIGHT_FORK_BLOCK_NUMBER = 52_513_513n;

/** Maximum number of distinct Midnight markets supported by the adapter. */
export const MAX_MIDNIGHT_ADAPTER_MARKETS = 250;

/** Collateral fields used by Midnight adapter cap IDs. */
export interface MidnightAdapterCollateralCap {
  /** Collateral token address. */
  readonly token: Address;
  /** WAD-scaled liquidation loan-to-value. */
  readonly lltv: bigint;
  /** WAD-scaled liquidation cursor. */
  readonly liquidationCursor: bigint;
  /** Oracle address. */
  readonly oracle: Address;
}

/** Market fields needed to configure adapter caps. */
export interface MidnightAdapterMarketCap {
  /** Entry gate (`zeroAddress` when ungated); encoded into the `enterGate` cap ID. */
  readonly enterGate: Address;
  /** Liquidation gate (`zeroAddress` when ungated); encoded into the `liquidatorGate` cap ID. */
  readonly liquidatorGate: Address;
  /** Recovery close factor threshold. */
  readonly rcfThreshold: bigint;
  /** Market collateral parameters. */
  readonly collateralParams: readonly MidnightAdapterCollateralCap[];
}

/** Adapter address and CREATE2 salt. */
export interface VaultV2MidnightAdapterFixtureAdapter {
  /** Factory-created adapter address. */
  readonly address: Address;
  /** CREATE2 salt used to create this adapter. */
  readonly salt: Hash;
}

/** Vault V2, its factory durations, and its factory-created Midnight adapters. */
export interface VaultV2MidnightAdapterFixture {
  /** Factory-created Vault V2 address. */
  readonly vault: Address;
  /** Factory-configured adapter durations, in seconds. */
  readonly durations: readonly bigint[];
  /** Midnight adapters created for the vault. */
  readonly adapters: readonly VaultV2MidnightAdapterFixtureAdapter[];
}

type BaseTestClient = AnvilTestClient<typeof base>;

const submitAndAccept = async (params: {
  readonly client: BaseTestClient;
  readonly address: Address;
  readonly contract: "vault" | "adapter";
  readonly data: Hex;
}) => {
  const { client, address, data } = params;
  if (params.contract === "vault") {
    await client.writeContract({
      address,
      abi: vaultV2Abi,
      functionName: "submit",
      args: [data],
    });
  } else {
    await client.writeContract({
      address,
      abi: midnightAdapterAbi,
      functionName: "submit",
      args: [data],
    });
  }
  const hash = await client.sendTransaction({ to: address, data });
  await client.waitForTransactionReceipt({ hash });
};

/** Advances the fork timestamp and mines a block at the new time. */
export const advanceVaultV2MidnightFixtureTime = async (params: {
  readonly client: BaseTestClient;
  readonly seconds: bigint;
}): Promise<void> => {
  const timestamp = await params.client.timestamp();
  await params.client.setNextBlockTimestamp({
    timestamp: timestamp + params.seconds,
  });
  await params.client.mine({ blocks: 1 });
};

/** Takes a ratified offer through the fixture adapter's allocator path. */
export const takeVaultV2MidnightAdapterOffer = async (params: {
  readonly client: BaseTestClient;
  readonly adapter: Address;
  readonly args: ContractFunctionArgs<
    typeof midnightAdapterAbi,
    "nonpayable",
    "take"
  >;
}): Promise<void> => {
  await params.client.writeContract({
    address: params.adapter,
    abi: midnightAdapterAbi,
    functionName: "take",
    args: params.args,
  });
};

/**
 * Configures the adapter, market, and duration caps needed by a Midnight adapter.
 *
 * @param params.client - Base Anvil test client.
 * @param params.vault - Parent Vault V2.
 * @param params.adapter - Factory-created Midnight adapter.
 * @param params.durations - Factory-configured adapter durations.
 * @param params.markets - Optional markets to configure.
 * @returns Resolves after the caps are accepted by Vault V2.
 */
export const configureVaultV2MidnightAdapterCaps = async (params: {
  readonly client: BaseTestClient;
  readonly vault: Address;
  readonly adapter: Address;
  readonly durations: readonly bigint[];
  readonly markets?: readonly MidnightAdapterMarketCap[];
}): Promise<void> => {
  const capIdData = new Set<Hex>([
    encodeAbiParameters(
      [{ type: "string" }, { type: "address" }],
      ["this", params.adapter],
    ),
    ...params.durations.map((duration) =>
      encodeAbiParameters(
        [{ type: "string" }, { type: "address" }, { type: "uint256" }],
        ["duration", params.adapter, duration],
      ),
    ),
    ...(params.markets ?? []).flatMap((market) => [
      encodeAbiParameters(
        [{ type: "string" }, { type: "address" }],
        ["enterGate", market.enterGate],
      ),
      encodeAbiParameters(
        [{ type: "string" }, { type: "address" }],
        ["liquidatorGate", market.liquidatorGate],
      ),
      encodeAbiParameters(
        [{ type: "string" }, { type: "uint256" }],
        ["rcfThreshold", market.rcfThreshold],
      ),
      ...market.collateralParams.flatMap((collateral) => [
        encodeAbiParameters(
          [{ type: "string" }, { type: "address" }],
          ["collateralToken", collateral.token],
        ),
        encodeAbiParameters(
          [{ type: "string" }, midnightCollateralParamsAbi],
          ["collateralParams", collateral],
        ),
      ]),
    ]),
  ]);

  for (const idData of capIdData) {
    await submitAndAccept({
      client: params.client,
      address: params.vault,
      contract: "vault",
      data: encodeFunctionData({
        abi: vaultV2Abi,
        functionName: "increaseAbsoluteCap",
        args: [idData, maxUint128],
      }),
    });
    await submitAndAccept({
      client: params.client,
      address: params.vault,
      contract: "vault",
      data: encodeFunctionData({
        abi: vaultV2Abi,
        functionName: "increaseRelativeCap",
        args: [idData, MathLib.WAD],
      }),
    });
  }
};

/**
 * Creates a Base-fork Vault V2 and one or more registry-factory Midnight adapters.
 *
 * @remarks Adapter ABI source: morpho-org/vault-v2@6476e9d. To refresh after a
 * redeployment, update the Base factory address in the morpho-ts registry and
 * regenerate its ABI from the new implementation; never deploy a local factory.
 *
 * The fixture configures `setMaxTtm` before adding each adapter, grants allocator
 * access to both the test account and adapter, and enables adapter, market, and
 * duration caps. Adapter salts are supplied by the caller so multiple adapters
 * can be created deterministically for the same parent vault.
 * Midnight and the adapter are compiled for the Osaka EVM. Base fork tests need
 * Anvil v1.8.5, which CI pins in `.github/workflows/test-packages.yml`: its
 * default Base hardfork runs Osaka, so no `hardfork` option is needed. On older
 * Anvil versions, `take` halts with `NotActivated`.
 * A redeploy also requires moving `BASE_MIDNIGHT_FORK_BLOCK_NUMBER` to or past
 * the new factory deploy block. A factory deployed after the pinned block has
 * no code on the fork, so `createMidnightAdapter` fails.
 *
 * @param params.client - Base Anvil test client.
 * @param params.asset - Vault underlying asset.
 * @param params.vaultSalt - CREATE2 salt for the Vault V2; defaults to zero. Use distinct salts to create several vaults for the same owner and asset on one fork.
 * @param params.salts - Distinct CREATE2 salts for the adapters.
 * @param params.markets - Optional markets to configure.
 * @returns The Vault V2 address, factory durations, and each created adapter with its salt.
 */
export const createVaultV2MidnightAdapterFixture = async (params: {
  readonly client: BaseTestClient;
  readonly asset: Address;
  readonly vaultSalt?: Hash;
  readonly salts: readonly [Hash, ...Hash[]];
  readonly markets?: readonly MidnightAdapterMarketCap[];
}): Promise<VaultV2MidnightAdapterFixture> => {
  const { client } = params;
  const vaultV2Factory = getChainAddress(ChainId.BaseMainnet, "vaultV2Factory");
  const midnightAdapterFactory = getChainAddress(
    ChainId.BaseMainnet,
    "midnightAdapterFactory",
  );

  await client.deal({ amount: parseEther("1") });
  const { result: vault, request: createVaultRequest } =
    await client.simulateContract({
      address: vaultV2Factory,
      abi: vaultV2FactoryAbi,
      functionName: "createVaultV2",
      args: [
        client.account.address,
        params.asset,
        params.vaultSalt ?? zeroHash,
      ],
    });
  await client.writeContract(createVaultRequest);

  await client.writeContract({
    address: vault,
    abi: vaultV2Abi,
    functionName: "setCurator",
    args: [client.account.address],
  });
  await submitAndAccept({
    client,
    address: vault,
    contract: "vault",
    data: encodeFunctionData({
      abi: vaultV2Abi,
      functionName: "setIsAllocator",
      args: [client.account.address, true],
    }),
  });

  const durationsLength = await client.readContract({
    address: midnightAdapterFactory,
    abi: midnightAdapterFactoryAbi,
    functionName: "durationsLength",
  });
  const durations = await Promise.all(
    Array.from({ length: Number(durationsLength) }, (_, index) =>
      client.readContract({
        address: midnightAdapterFactory,
        abi: midnightAdapterFactoryAbi,
        functionName: "durations",
        args: [BigInt(index)],
      }),
    ),
  );

  const adapters: VaultV2MidnightAdapterFixtureAdapter[] = [];
  for (const salt of params.salts) {
    const { result: adapter, request: createAdapterRequest } =
      await client.simulateContract({
        address: midnightAdapterFactory,
        abi: midnightAdapterFactoryAbi,
        functionName: "createMidnightAdapter",
        args: [vault, salt],
      });
    await client.writeContract(createAdapterRequest);

    await submitAndAccept({
      client,
      address: adapter,
      contract: "adapter",
      data: encodeFunctionData({
        abi: midnightAdapterAbi,
        functionName: "setMaxTtm",
        args: [maxUint32],
      }),
    });
    await submitAndAccept({
      client,
      address: vault,
      contract: "vault",
      data: encodeFunctionData({
        abi: vaultV2Abi,
        functionName: "setIsAllocator",
        args: [adapter, true],
      }),
    });
    await submitAndAccept({
      client,
      address: vault,
      contract: "vault",
      data: encodeFunctionData({
        abi: vaultV2Abi,
        functionName: "addAdapter",
        args: [adapter],
      }),
    });
    await configureVaultV2MidnightAdapterCaps({
      client,
      vault,
      adapter,
      durations,
      markets: params.markets,
    });

    adapters.push({ address: adapter, salt });
  }

  return { vault, durations, adapters };
};
