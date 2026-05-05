import { type MarketParams, MarketUtils } from "@morpho-org/blue-sdk";
import type { Address, Client } from "viem";
import {
  MorphoMarketV1,
  MorphoVaultV1,
  MorphoVaultV2,
} from "../entities/index.js";
import {
  RESERVED_MORPHO_CLIENT_NAMES,
  validateExtensionMap,
  wrapExtensionFactory,
} from "../helpers/validateExtension.js";
import {
  type ExtensionEntityFactory,
  type ExtensionMap,
  MarketIdMismatchError,
  type Metadata,
  type MorphoClientType,
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
   * @param viemClient - Connected viem `Client`. Public reads use it as-is; signature flows use
   *   it as a `WalletClient` and require `account` to be set.
   * @param _options - SDK-wide options.
   * @param _options.supportSignature - Whether the integrator can collect EIP-712 signatures for
   *   permit / permit2. Defaults to `false` (classic approvals only).
   * @param _options.supportDeployless - Whether entity fetchers may use deployless multicall.
   * @param _options.metadata - Optional analytics metadata applied to every transaction this
   *   client builds.
   * @example
   * ```ts
   * import { createWalletClient, http } from "viem";
   * import { mainnet } from "viem/chains";
   * import { MorphoClient } from "@morpho-org/morpho-sdk";
   *
   * const client = new MorphoClient(
   *   createWalletClient({ chain: mainnet, transport: http(), account: user }),
   *   { supportSignature: true },
   * );
   * ```
   */
  /** @internal Extensions registered through `.extend()`, surfaced as enumerable instance props. */
  private readonly _extensions: ReadonlyMap<string, ExtensionEntityFactory>;

  // biome-ignore lint/complexity/useMaxParams: third arg is `@internal`, only used by `.extend()` to clone.
  constructor(
    public readonly viemClient: Client,
    readonly _options?: {
      readonly supportSignature?: boolean;
      readonly supportDeployless?: boolean;
      readonly metadata?: Metadata;
    },
    /**
     * @internal Used by `.extend()` to carry registered extensions when cloning. Integrators must
     * not pass this directly — call `.extend(fn)` on an existing client instead.
     */
    extensions?: ReadonlyMap<string, ExtensionEntityFactory>,
  ) {
    this.options = {
      ..._options,
      supportSignature: _options?.supportSignature ?? false,
      supportDeployless: _options?.supportDeployless,
    };

    this._extensions = extensions ?? new Map();
    for (const [name, factory] of this._extensions) {
      Object.defineProperty(this, name, {
        value: factory,
        enumerable: true,
        writable: false,
        configurable: false,
      });
    }
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

  /**
   * Returns a new `MorphoClient` carrying every previously registered entity factory plus the
   * ones produced by `extension(this)`. The original client is left untouched (statelessness per
   * `client/CLAUDE.md`). Extensions are accessible as enumerable instance properties.
   *
   * Validation runs at registration time (name collision, identifier format, factory must be a
   * function) and lazily on each call (entity returns an object of methods, each method returns
   * `{ buildTx, getRequirements? }`, `buildTx()` returns a `Transaction`-shaped object,
   * `getRequirements()` resolves to `Transaction | Requirement` items). The validator does not
   * call `deepFreeze` and does not inject `metadata` — the integrator keeps full control.
   *
   * @param extension - Callback receiving the current client and returning a record of entity
   *   factories. Each factory takes the entity's identifying args (e.g. address, chain id) and
   *   returns an object whose methods build actions.
   * @returns A new client whose type is `this & TExtension`.
   * @throws {ExtensionNameCollisionError} when a key collides with a reserved client member or a
   *   previously registered extension.
   * @throws {InvalidExtensionNameError} when a key does not match `/^[a-z][a-zA-Z0-9]*$/`.
   * @throws {InvalidExtensionShapeError} when the callback does not return a non-empty record of
   *   functions.
   * @throws {InvalidEntityShapeError} when an entity factory does not return a record of
   *   functions (raised lazily on call).
   * @throws {InvalidActionShapeError} when an action method does not return `{ buildTx, … }`.
   * @throws {InvalidTransactionShapeError} when `buildTx()` returns a malformed transaction.
   * @throws {InvalidRequirementShapeError} when `getRequirements()` resolves to malformed items.
   * @example
   * ```ts
   * import { defineEntity, MorphoClient } from "@morpho-org/morpho-sdk";
   *
   * const client = new MorphoClient(viemClient).extend((c) => ({
   *   myLending: defineEntity((vault: Address, chainId: number) => ({
   *     depositAndBoost: ({ amount, userAddress }: { amount: bigint; userAddress: Address }) => ({
   *       buildTx: () => ({
   *         to: vault,
   *         value: 0n,
   *         data: "0x",
   *         action: { type: "myLendingDeposit", args: { amount, userAddress, chainId } },
   *       }),
   *     }),
   *   })),
   * }));
   *
   * const tx = client.myLending(vault, 1).depositAndBoost({ amount: 1n, userAddress }).buildTx();
   * ```
   */
  public extend<const TExtension extends ExtensionMap>(
    extension: (client: this) => TExtension,
  ): this & TExtension {
    const raw = extension(this);
    validateExtensionMap(raw, [
      ...RESERVED_MORPHO_CLIENT_NAMES,
      ...this._extensions.keys(),
    ]);

    const merged = new Map(this._extensions);
    for (const [name, factory] of Object.entries(raw)) {
      merged.set(name, wrapExtensionFactory(name, factory));
    }

    return new MorphoClient(this.viemClient, this._options, merged) as this &
      TExtension;
  }
}
