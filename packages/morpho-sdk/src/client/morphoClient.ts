import { type MarketParams, MarketUtils } from "@morpho-org/blue-sdk";
import { type Address, createPublicClient, type PublicClient } from "viem";
import {
  MorphoMarketV1,
  MorphoVaultV1,
  MorphoVaultV2,
} from "../entities/index.js";
import {
  MarketIdMismatchError,
  type MorphoClientType,
  type MorphoConfig,
  UnsupportedChainError,
} from "../types/index.js";

/**
 * Stateless entry point of the SDK. Holds a `MorphoConfig` (transports per chain + options)
 * and exposes factory methods for the protocol entities.
 *
 * No state beyond configuration: no cache, no `init()`, no warm-up. Each factory call
 * (`vaultV1`, `vaultV2`, `marketV1`) returns a fresh entity bound to a freshly built viem
 * client for the requested chain.
 */
export class MorphoClient implements MorphoClientType {
  /**
   * @param config - SDK-wide configuration. Must include a `transports` map keyed by chain id.
   * @example
   * ```ts
   * import { http } from "viem";
   * import { MorphoClient } from "@morpho-org/morpho-sdk";
   *
   * const morpho = new MorphoClient({
   *   transports: {
   *     1: http("https://eth-mainnet.example"),
   *     8453: http("https://base-mainnet.example"),
   *   },
   *   supportSignature: true,
   * });
   * ```
   */
  constructor(public readonly config: MorphoConfig) {}

  /**
   * Builds a viem `PublicClient` for the requested chain id from the configured transport.
   * The returned client has `chain` left `undefined` — the SDK identifies the chain via the
   * `chainId` carried by the entity that owns the client.
   *
   * @param chainId - Chain id to build the client for.
   * @returns A fresh viem `PublicClient` bound to `config.transports[chainId]`.
   * @throws {UnsupportedChainError} when no transport is configured for `chainId`.
   */
  public getViemClient(chainId: number): PublicClient {
    const transport = this.config.transports[chainId];
    if (transport == null) {
      throw new UnsupportedChainError(chainId);
    }
    return createPublicClient({ transport });
  }

  /**
   * Returns a `MorphoVaultV1` (MetaMorpho) entity bound to this client for the given chain.
   *
   * @param vault - VaultV1 address.
   * @param chainId - Chain the vault lives on. Must be in `config.transports`.
   * @returns A fresh `MorphoVaultV1` entity.
   * @throws {UnsupportedChainError} when no transport is configured for `chainId`.
   */
  public vaultV1(vault: Address, chainId: number) {
    return new MorphoVaultV1(this, vault, chainId);
  }

  /**
   * Returns a `MorphoVaultV2` entity bound to this client for the given chain.
   *
   * @param vault - VaultV2 address.
   * @param chainId - Chain the vault lives on. Must be in `config.transports`.
   * @returns A fresh `MorphoVaultV2` entity.
   * @throws {UnsupportedChainError} when no transport is configured for `chainId`.
   */
  public vaultV2(vault: Address, chainId: number) {
    return new MorphoVaultV2(this, vault, chainId);
  }

  /**
   * Returns a `MorphoMarketV1` entity bound to this client for the given chain. Validates
   * that the supplied `marketParams.id` matches the hash of the other params, so a
   * hand-rolled or agent-written `MarketParams` cannot point at the wrong market silently.
   *
   * @param marketParams - Market params (`loanToken`, `collateralToken`, `oracle`, `irm`,
   *   `lltv`, `id`).
   * @param chainId - Chain the market lives on. Must be in `config.transports`.
   * @returns A fresh `MorphoMarketV1` entity.
   * @throws {UnsupportedChainError} when no transport is configured for `chainId`.
   * @throws {MarketIdMismatchError} when `marketParams.id` does not equal the hash derived
   *   from the other fields.
   */
  public marketV1(marketParams: MarketParams, chainId: number) {
    const derivedId = MarketUtils.getMarketId(marketParams);
    if (marketParams.id !== derivedId) {
      throw new MarketIdMismatchError(marketParams.id, derivedId);
    }
    return new MorphoMarketV1(this, marketParams, chainId);
  }
}
