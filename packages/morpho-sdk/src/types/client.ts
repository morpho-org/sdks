import type { MarketParams } from "@morpho-org/blue-sdk";
import type { Account, Address, Chain, Client, Transport } from "viem";
import type {
  MarketV1Actions,
  VaultV1Actions,
  VaultV2Actions,
} from "../entities/index.js";
import type { Metadata } from "./index.js";

/**
 * Viem public client with a required `chain`. Used by `MorphoClient`, entities, and action
 * builders for on-chain reads and transaction construction. The SDK never reads `account`
 * from this client.
 */
export type PublicClientWithChain<
  TTransport extends Transport = Transport,
  TChain extends Chain = Chain,
> = Client<TTransport, TChain>;

/**
 * Viem wallet client with a required `chain` and `account`. Used by `Requirement.sign(...)`
 * to produce EIP-712 permit / permit2 signatures.
 */
export type WalletClientWithChain<
  TTransport extends Transport = Transport,
  TChain extends Chain = Chain,
  TAccount extends Account = Account,
> = Client<TTransport, TChain, TAccount>;

/**
 * Structural contract every concrete `MorphoClient` implementation satisfies. Carries the
 * viem public client (`chain` is required), the resolved options bag, and the three
 * entity-factory methods the SDK exposes.
 */
export interface MorphoClientType {
  readonly viemClient: PublicClientWithChain;
  readonly options: {
    readonly supportSignature: boolean;
    readonly supportDeployless?: boolean;
    readonly metadata?: Metadata;
  };

  vaultV1: (vault: Address, chainId: number) => VaultV1Actions;
  vaultV2: (vault: Address, chainId: number) => VaultV2Actions;
  marketV1: (marketParams: MarketParams, chainId: number) => MarketV1Actions;
}
