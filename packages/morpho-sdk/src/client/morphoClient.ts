import { type MarketParams, MarketUtils } from "@morpho-org/blue-sdk";
import type { Address } from "viem";
import {
  MorphoMarketV1,
  MorphoVaultV1,
  MorphoVaultV2,
} from "../entities/index.js";
import {
  MarketIdMismatchError,
  type Metadata,
  type MorphoClientType,
  type PublicClientWithChain,
} from "../types/index.js";

/**
 * Stateless entry point of the SDK. Wraps a viem `Client` plus a frozen options bag and exposes
 * factory methods for the protocol entities.
 *
 * Holds no state beyond configuration: no cache, no `init()`, no warm-up. Each factory call
 * (`vaultV1`, `vaultV2`, `marketV1`) returns a fresh entity bound to this client.
 */
export class MorphoClient implements MorphoClientType {
  /** SDK-wide options resolved from the constructor's `_options` argument. */
  readonly options: {
    readonly supportSignature: boolean;
    readonly supportDeployless?: boolean;
    readonly metadata?: Metadata;
  };

  /**
   * @param viemClient - Connected viem public `Client` whose `chain` is set. Used for on-chain
   *   reads only; signature flows take a `WalletClientWithChain` directly via `Requirement.sign(...)`.
   * @param _options - SDK-wide options.
   * @param _options.supportSignature - Whether the integrator can collect EIP-712 signatures for
   *   permit / permit2. Defaults to `false` (classic approvals only).
   * @param _options.supportDeployless - Whether entity fetchers may use deployless multicall.
   * @param _options.metadata - Optional analytics metadata applied to every transaction this
   *   client builds.
   * @example
   * ```ts
   * import { createPublicClient, http } from "viem";
   * import { mainnet } from "viem/chains";
   * import { MorphoClient } from "@morpho-org/morpho-sdk";
   *
   * const client = new MorphoClient(
   *   createPublicClient({ chain: mainnet, transport: http() }),
   *   { supportSignature: true },
   * );
   * ```
   */
  constructor(
    public readonly viemClient: PublicClientWithChain,
    readonly _options?: {
      readonly supportSignature?: boolean;
      readonly supportDeployless?: boolean;
      readonly metadata?: Metadata;
    },
  ) {
    this.options = {
      ..._options,
      supportSignature: _options?.supportSignature ?? false,
      supportDeployless: _options?.supportDeployless,
    };
  }

  /**
   * Returns a `MorphoVaultV1` (MetaMorpho) entity bound to this client.
   *
   * @param vault - VaultV1 address.
   * @param chainId - Chain the vault lives on.
   * @returns A fresh `MorphoVaultV1` entity.
   * @example
   * ```ts
   * const vault = client.vaultV1(vaultAddress, 1);
   * const accrualVault = await vault.getData();
   * const { buildTx } = vault.deposit({
   *   amount: 1_000_000n,
   *   userAddress: depositor,
   *   accrualVault,
   * });
   * const tx = buildTx();
   * ```
   */
  public vaultV1(vault: Address, chainId: number) {
    return new MorphoVaultV1(this, vault, chainId);
  }

  /**
   * Returns a `MorphoVaultV2` entity bound to this client.
   *
   * @param vault - VaultV2 address.
   * @param chainId - Chain the vault lives on.
   * @returns A fresh `MorphoVaultV2` entity.
   * @example
   * ```ts
   * const vault = client.vaultV2(vaultAddress, 1);
   * const accrualVault = await vault.getData();
   * const { buildTx } = vault.deposit({
   *   amount: 1_000_000n,
   *   userAddress: depositor,
   *   accrualVault,
   * });
   * const tx = buildTx();
   * ```
   */
  public vaultV2(vault: Address, chainId: number) {
    return new MorphoVaultV2(this, vault, chainId);
  }

  /**
   * Returns a `MorphoMarketV1` entity bound to this client. Validates that the supplied
   * `marketParams.id` matches the hash of the other params, so a hand-rolled or agent-written
   * `MarketParams` cannot point at the wrong market silently.
   *
   * @param marketParams - Market params (`loanToken`, `collateralToken`, `oracle`, `irm`, `lltv`,
   *   `id`).
   * @param chainId - Chain the market lives on.
   * @returns A fresh `MorphoMarketV1` entity.
   * @throws {MarketIdMismatchError} when `marketParams.id` does not equal the hash derived from
   *   the other fields.
   * @example
   * ```ts
   * const market = client.marketV1(marketParams, 1);
   * const positionData = await market.getPositionData(borrower);
   * const { buildTx } = market.borrow({
   *   userAddress: borrower,
   *   amount: 1_000_000n,
   *   positionData,
   * });
   * const tx = buildTx();
   * ```
   */
  public marketV1(marketParams: MarketParams, chainId: number) {
    const derivedId = MarketUtils.getMarketId(marketParams);
    // Can happen with one-time/hardcoded/agent-written possibly inconsistent input market params.
    if (marketParams.id !== derivedId) {
      throw new MarketIdMismatchError(marketParams.id, derivedId);
    }
    return new MorphoMarketV1(this, marketParams, chainId);
  }
}
