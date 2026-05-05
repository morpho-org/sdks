import type { MarketParams } from "@morpho-org/blue-sdk";
import type { Address, PublicClient, Transport } from "viem";
import type {
  MarketV1Actions,
  VaultV1Actions,
  VaultV2Actions,
} from "../entities/index.js";
import type { Metadata } from "./index.js";

/**
 * SDK-wide configuration for `MorphoClient`. Maps each supported chain id to the viem
 * `Transport` the SDK must use for that chain, plus the resolved options bag.
 *
 * The SDK builds a viem `Client` lazily per entity from `transports[chainId]` — integrators
 * never construct a `Client` themselves for the SDK.
 */
export interface MorphoConfig {
  /**
   * Per-chain viem `Transport` map. The SDK builds a `Client` from `transports[chainId]` each
   * time an entity is constructed for `chainId`. Throws `UnsupportedChainError` when an
   * entity is requested for a chain that has no transport.
   */
  readonly transports: Readonly<Record<number, Transport>>;
  /** Whether the integrator can collect EIP-712 signatures for permit / permit2. */
  readonly supportSignature?: boolean;
  /** Whether entity fetchers may use deployless multicall. */
  readonly supportDeployless?: boolean;
  /** Optional analytics metadata applied to every transaction the client builds. */
  readonly metadata?: Metadata;
}

/**
 * Structural contract every concrete `MorphoClient` implementation satisfies. Carries the
 * resolved config and the three entity-factory methods the SDK exposes.
 */
export interface MorphoClientType {
  readonly config: MorphoConfig;

  /**
   * Builds a viem `PublicClient` for the requested chain id from the configured transport.
   * The returned client has `chain` left `undefined` — the SDK identifies the chain via the
   * `chainId` carried by the entity that owns the client.
   *
   * @throws {UnsupportedChainError} when no transport is configured for `chainId`.
   */
  getViemClient: (chainId: number) => PublicClient;

  vaultV1: (vault: Address, chainId: number) => VaultV1Actions;
  vaultV2: (vault: Address, chainId: number) => VaultV2Actions;
  marketV1: (marketParams: MarketParams, chainId: number) => MarketV1Actions;
}
