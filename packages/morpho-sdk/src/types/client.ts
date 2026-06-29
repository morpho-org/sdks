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
 * resolved options bag, and the three entity-factory methods the SDK exposes.
 */
export interface MorphoClientType {
  readonly viemClient: Client;
  readonly options: {
    readonly supportSignature: boolean;
    readonly supportDeployless?: boolean;
    readonly metadata?: Metadata;
  };

  vaultV1: (vault: Address, chainId: number) => VaultV1Actions;
  vaultV2: (vault: Address, chainId: number) => VaultV2Actions;
  blue: (marketParams: MarketParams, chainId: number) => BlueActions;
  midnight: (chainId: number) => MidnightActions;
}
