import type { MarketParams } from "@morpho-org/blue-sdk";
import type { Address, PublicClient } from "viem";
import type {
  MarketV1Actions,
  VaultV1Actions,
  VaultV2Actions,
} from "../entities/index.js";
import type { Metadata } from "./index.js";

/**
 * Structural contract every concrete `MorphoClient` implementation satisfies. Carries the
 * viem public client, the resolved options bag, and the three entity-factory methods the SDK
 * exposes.
 */
export interface MorphoClientType {
  /**
   * Connected viem `PublicClient` used for on-chain reads and tx building. `chain` must be set
   * — entities runtime-check `viemClient.chain?.id === chainId` even though viem leaves
   * `chain` optional at the type level. `account` is ignored; permit / permit2 signing takes
   * a `WalletClient` via `Requirement.sign(...)`.
   */
  readonly viemClient: PublicClient;
  /** SDK-wide options resolved from the `MorphoClient` constructor. */
  readonly options: {
    /** When `false`, `getRequirements()` never returns permit / permit2 `Requirement`s. */
    readonly supportSignature: boolean;
    /** When `true`, entity fetchers may use deployless multicall. */
    readonly supportDeployless?: boolean;
    /** Optional analytics metadata appended to every transaction this client builds. */
    readonly metadata?: Metadata;
  };

  /** Returns a fresh `VaultV1` (MetaMorpho) entity bound to this client. */
  vaultV1: (vault: Address, chainId: number) => VaultV1Actions;
  /** Returns a fresh `VaultV2` entity bound to this client. */
  vaultV2: (vault: Address, chainId: number) => VaultV2Actions;
  /** Returns a fresh `MarketV1` (Morpho Blue) entity bound to this client. */
  marketV1: (marketParams: MarketParams, chainId: number) => MarketV1Actions;
}
