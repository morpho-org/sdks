import type { MarketParams } from "@morpho-org/blue-sdk";
import type { Address, Client } from "viem";
import type {
  MarketV1Actions,
  VaultV1Actions,
  VaultV2Actions,
} from "../entities/index.js";
import type { ExtensionMap } from "./extension.js";
import type { Metadata } from "./index.js";

/**
 * Structural contract every concrete `MorphoClient` implementation satisfies. Carries the viem
 * client, the resolved options bag, the three entity-factory methods the SDK exposes, and the
 * `extend` hook integrators use to attach custom entities.
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
  marketV1: (marketParams: MarketParams, chainId: number) => MarketV1Actions;

  extend: <const TExtension extends ExtensionMap>(
    extension: (client: MorphoClientType) => TExtension,
  ) => MorphoClientType & TExtension;
}
