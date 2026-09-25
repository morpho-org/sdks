import type { MarketParams } from "@morpho-org/blue-sdk";
import type { Address, Client } from "viem";
import type {
  BlueActions,
  MidnightActions,
  VaultV1Actions,
  VaultV2Actions,
} from "../actions/index.js";
import type { Metadata } from "./index.js";

/**
 * Structural contract the `morpho` namespace satisfies — the object exposed under `client.morpho`
 * once a viem client is extended with {@link morphoViemExtension}. Carries the viem client, the
 * resolved options bag, and the four entity-factory methods the SDK exposes.
 */
export interface MorphoClientType {
  /** Viem client shared by every entity factory and onchain read. */
  readonly viemClient: Client;
  /** Resolved immutable SDK options shared by every entity. */
  readonly options: {
    /** Whether entity prerequisites may be returned as signable EIP-712 requirements. */
    readonly supportSignature: boolean;
    /** Whether supported entity fetchers may use deployless reads. */
    readonly supportDeployless?: boolean;
    /** Optional analytics metadata appended to built transactions. */
    readonly metadata?: Metadata;
  };

  /** Creates a Vault V1 entity bound to `vault` on `chainId`. */
  vaultV1: (vault: Address, chainId: number) => VaultV1Actions;
  /** Creates a Vault V2 entity bound to `vault` on `chainId`. */
  vaultV2: (vault: Address, chainId: number) => VaultV2Actions;
  /** Creates a Morpho Blue market entity whose high-level writes use BlueBundlesV1. */
  blue: (marketParams: MarketParams, chainId: number) => BlueActions;
  /** Creates a Midnight entity bound to `chainId`. */
  midnight: (chainId: number) => MidnightActions;
}
