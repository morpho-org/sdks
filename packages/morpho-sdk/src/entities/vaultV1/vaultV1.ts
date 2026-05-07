import {
  type AccrualVault,
  type AccrualVaultV2,
  DEFAULT_SLIPPAGE_TOLERANCE,
  getChainAddresses,
  MathLib,
} from "@morpho-org/blue-sdk";
import { fetchAccrualVault } from "@morpho-org/blue-sdk-viem";
import { type Address, isAddressEqual } from "viem";
import {
  getRequirements,
  vaultV1Deposit,
  vaultV1MigrateToV2,
  vaultV1Redeem,
  vaultV1Withdraw,
} from "../../actions/index.js";
import {
  MAX_ABSOLUTE_SHARE_PRICE,
  MAX_SLIPPAGE_TOLERANCE,
} from "../../helpers/constant.js";
import { validateChainId } from "../../helpers/index.js";
import type { FetchParameters } from "../../types/data.js";
import {
  ChainWNativeMissingError,
  type DepositAmountArgs,
  type ERC20ApprovalAction,
  ExcessiveSlippageToleranceError,
  type MorphoClientType,
  NativeAmountOnNonWNativeVaultError,
  NegativeNativeAmountError,
  NegativeSlippageToleranceError,
  NonPositiveAssetAmountError,
  NonPositiveSharesAmountError,
  type Requirement,
  type RequirementSignature,
  type Transaction,
  VaultAddressMismatchError,
  VaultAssetMismatchError,
  type VaultV1DepositAction,
  type VaultV1MigrateToV2Action,
  type VaultV1RedeemAction,
  type VaultV1WithdrawAction,
} from "../../types/index.js";

export interface VaultV1Actions {
  /**
   * Fetches the latest vault data with accrued interest.
   *
   * @param {FetchParameters} [parameters] - Optional fetch parameters (block number, state overrides, etc.).
   * @returns {Promise<Awaited<ReturnType<typeof fetchAccrualVault>>>} The latest accrued vault data.
   */
  getData: (
    parameters?: FetchParameters,
  ) => Promise<Awaited<ReturnType<typeof fetchAccrualVault>>>;
  /**
   * Prepares a deposit into a VaultV1 (MetaMorpho) contract.
   *
   * Uses pre-fetched accrual vault data to compute `maxSharePrice` with slippage tolerance,
   * then returns `buildTx` and `getRequirements` for lazy evaluation.
   *
   * **The tx MUST be broadcast by `userAddress`.** Assets are pulled from `msg.sender` (broadcaster) but vault shares are minted to `userAddress`.
   *
   * @param params - Deposit parameters including pre-fetched `accrualVault`.
   * @param params.userAddress - User address that will own the minted shares.
   * @param params.accrualVault - Pre-fetched vault data (asset address + share conversion).
   * @param params.amount - Optional ERC-20 asset amount to deposit. At least one of `amount` / `nativeAmount` must be positive.
   * @param params.nativeAmount - Optional native amount to wrap into wNative; vault asset must be wNative.
   * @param params.slippageTolerance - Optional slippage tolerance in WAD (default `DEFAULT_SLIPPAGE_TOLERANCE` = 0.03%, max 10%).
   * @returns Object with `buildTx` (deep-frozen `Transaction<VaultV1DepositAction>`) and `getRequirements` (ERC20 approval / permit / permit2 requirements for the asset).
   * @throws {ChainIdMismatchError} when the underlying `PublicClient`'s `chain.id` differs from the entity's `chainId`.
   * @throws {VaultAddressMismatchError} when `accrualVault.address !== this.vault`.
   * @throws {NonPositiveAssetAmountError} when `amount < 0n`.
   * @throws {NegativeNativeAmountError} when `nativeAmount < 0n`.
   * @throws {ChainWNativeMissingError} when `nativeAmount` is set but the chain has no wNative.
   * @throws {NativeAmountOnNonWNativeVaultError} when `nativeAmount` is set but `accrualVault.asset !== wNative`.
   * @throws {NegativeSlippageToleranceError} when `slippageTolerance < 0n`.
   * @throws {ExcessiveSlippageToleranceError} when `slippageTolerance > MAX_SLIPPAGE_TOLERANCE`.
   * @throws {NonPositiveSharesAmountError} when the computed shares are non-positive.
   * @example
   * ```ts
   * import { createPublicClient, http } from "viem";
   * import { mainnet } from "viem/chains";
   * import { MorphoClient } from "@morpho-org/morpho-sdk";
   *
   * const client = new MorphoClient(
   *   createPublicClient({ chain: mainnet, transport: http() }),
   * );
   *
   * const vault = client.vaultV1(vaultAddress, mainnet.id);
   * const accrualVault = await vault.getData();
   *
   * const { buildTx, getRequirements } = vault.deposit({
   *   userAddress: depositor,
   *   accrualVault,
   *   amount: 1_000_000n,
   * });
   * const requirements = await getRequirements();
   * const tx = buildTx();
   * // tx satisfies Readonly<Transaction<VaultV1DepositAction>>
   * ```
   */
  deposit: (
    params: {
      userAddress: Address;
      accrualVault: AccrualVault;
      slippageTolerance?: bigint;
    } & DepositAmountArgs,
  ) => {
    buildTx: (
      requirementSignature?: RequirementSignature,
    ) => Readonly<Transaction<VaultV1DepositAction>>;
    getRequirements: (params?: {
      useSimplePermit?: boolean;
    }) => Promise<(Readonly<Transaction<ERC20ApprovalAction>> | Requirement)[]>;
  };
  /**
   * Prepares a withdraw from a VaultV1 (MetaMorpho) contract.
   *
   * @param {Object} params - The withdraw parameters.
   * @param {bigint} params.amount - Amount of assets to withdraw.
   * @param {Address} params.userAddress - User address initiating the withdraw.
   * @returns {Object} Object with `buildTx`.
   */
  withdraw: (params: { amount: bigint; userAddress: Address }) => {
    buildTx: () => Readonly<Transaction<VaultV1WithdrawAction>>;
  };
  /**
   * Prepares a redeem from a VaultV1 (MetaMorpho) contract.
   *
   * @param {Object} params - The redeem parameters.
   * @param {bigint} params.shares - Amount of shares to redeem.
   * @param {Address} params.userAddress - User address initiating the redeem.
   * @returns {Object} Object with `buildTx`.
   */
  redeem: (params: { shares: bigint; userAddress: Address }) => {
    buildTx: () => Readonly<Transaction<VaultV1RedeemAction>>;
  };
  /**
   * Prepares a full migration from VaultV1 to VaultV2.
   *
   * Redeems all V1 shares and atomically deposits the resulting assets into V2
   * via bundler3. Computes slippage-protected share prices for both legs.
   *
   * **The tx MUST be broadcast by `userAddress`.** V1 shares are pulled from `msg.sender` (broadcaster) and V2 shares are minted to `userAddress`. A mismatch silently transfers the broadcaster's V1 position to `userAddress` on V2.
   *
   * @param params - Migration parameters including pre-fetched source/target vault data.
   * @param params.userAddress - User address that will own the minted V2 shares.
   * @param params.sourceVault - Pre-fetched V1 vault data.
   * @param params.targetVault - Pre-fetched V2 vault data; must share `asset` with `sourceVault`.
   * @param params.shares - User's V1 share balance to migrate (must be positive).
   * @param params.slippageTolerance - Optional slippage tolerance in WAD (default `DEFAULT_SLIPPAGE_TOLERANCE` = 0.03%, max 10%) — applied to both legs.
   * @returns Object with `buildTx` (deep-frozen `Transaction<VaultV1MigrateToV2Action>`) and `getRequirements` (V1 share permit/approval requirements).
   * @throws {ChainIdMismatchError} when the underlying `PublicClient`'s `chain.id` differs from the entity's `chainId`.
   * @throws {VaultAddressMismatchError} when `sourceVault.address !== this.vault`.
   * @throws {VaultAssetMismatchError} when `sourceVault.asset !== targetVault.asset`.
   * @throws {NonPositiveSharesAmountError} when `shares <= 0n` or when the computed V2 shares are non-positive.
   * @throws {NegativeSlippageToleranceError} when `slippageTolerance < 0n`.
   * @throws {ExcessiveSlippageToleranceError} when `slippageTolerance > MAX_SLIPPAGE_TOLERANCE`.
   * @example
   * ```ts
   * import { createPublicClient, http } from "viem";
   * import { mainnet } from "viem/chains";
   * import { MorphoClient } from "@morpho-org/morpho-sdk";
   *
   * const client = new MorphoClient(
   *   createPublicClient({ chain: mainnet, transport: http() }),
   * );
   *
   * const sourceVault = await client.vaultV1(v1Vault, mainnet.id).getData();
   * const targetVault = await client.vaultV2(v2Vault, mainnet.id).getData();
   *
   * const { buildTx, getRequirements } = client
   *   .vaultV1(v1Vault, mainnet.id)
   *   .migrateToV2({
   *     userAddress: holder,
   *     sourceVault,
   *     targetVault,
   *     shares: sourceVault.toShares(holderBalance),
   *   });
   * const requirements = await getRequirements();
   * const tx = buildTx();
   * // tx satisfies Readonly<Transaction<VaultV1MigrateToV2Action>>
   * ```
   */
  migrateToV2: (params: {
    userAddress: Address;
    sourceVault: AccrualVault;
    targetVault: AccrualVaultV2;
    shares: bigint;
    slippageTolerance?: bigint;
  }) => {
    buildTx: (
      requirementSignature?: RequirementSignature,
    ) => Readonly<Transaction<VaultV1MigrateToV2Action>>;
    getRequirements: () => Promise<
      (Readonly<Transaction<ERC20ApprovalAction>> | Requirement)[]
    >;
  };
}

export class MorphoVaultV1 implements VaultV1Actions {
  // biome-ignore lint/complexity/useMaxParams: TODO refactor to ≤2 params
  constructor(
    private readonly client: MorphoClientType,
    private readonly vault: Address,
    private readonly chainId: number,
  ) {}

  async getData(parameters?: FetchParameters) {
    validateChainId(this.client.viemClient.chain?.id, this.chainId);

    return fetchAccrualVault(this.vault, this.client.viemClient, {
      ...parameters,
      chainId: this.chainId,
      deployless: this.client.options.supportDeployless,
    });
  }

  deposit({
    amount = 0n,
    userAddress,
    accrualVault,
    slippageTolerance = DEFAULT_SLIPPAGE_TOLERANCE,
    nativeAmount,
  }: {
    userAddress: Address;
    accrualVault: AccrualVault;
    slippageTolerance?: bigint;
  } & DepositAmountArgs) {
    validateChainId(this.client.viemClient.chain?.id, this.chainId);

    if (!isAddressEqual(accrualVault.address, this.vault)) {
      throw new VaultAddressMismatchError(this.vault, accrualVault.address);
    }

    if (amount < 0n) {
      throw new NonPositiveAssetAmountError(this.vault);
    }

    if (nativeAmount && nativeAmount < 0n) {
      throw new NegativeNativeAmountError(nativeAmount);
    }

    let wNative: Address | undefined;
    if (nativeAmount) {
      ({ wNative } = getChainAddresses(this.chainId));
      if (!wNative) {
        throw new ChainWNativeMissingError(this.chainId);
      }
    }

    if (slippageTolerance < 0n) {
      throw new NegativeSlippageToleranceError(slippageTolerance);
    }
    if (slippageTolerance > MAX_SLIPPAGE_TOLERANCE) {
      throw new ExcessiveSlippageToleranceError(slippageTolerance);
    }

    if (nativeAmount && wNative) {
      if (!isAddressEqual(accrualVault.asset, wNative)) {
        throw new NativeAmountOnNonWNativeVaultError(
          accrualVault.asset,
          wNative,
        );
      }
    }

    const totalAssets = amount + (nativeAmount ?? 0n);

    const shares = accrualVault.toShares(totalAssets);
    if (shares <= 0n) {
      throw new NonPositiveSharesAmountError(this.vault);
    }

    const maxSharePrice = MathLib.min(
      MathLib.mulDivUp(
        totalAssets,
        MathLib.wToRay(MathLib.WAD + slippageTolerance),
        shares,
      ),
      MAX_ABSOLUTE_SHARE_PRICE,
    );

    return {
      getRequirements: async (params?: { useSimplePermit?: boolean }) =>
        await getRequirements(this.client.viemClient, {
          address: accrualVault.asset,
          chainId: this.chainId,
          supportSignature: this.client.options.supportSignature,
          supportDeployless: this.client.options.supportDeployless,
          useSimplePermit: params?.useSimplePermit,
          args: {
            amount,
            from: userAddress,
          },
        }),

      buildTx: (requirementSignature?: RequirementSignature) =>
        vaultV1Deposit({
          vault: {
            chainId: this.chainId,
            address: this.vault,
            asset: accrualVault.asset,
          },
          args: {
            amount,
            maxSharePrice,
            recipient: userAddress,
            requirementSignature,
            nativeAmount,
          },
          metadata: this.client.options.metadata,
        }),
    };
  }

  withdraw({ amount, userAddress }: { amount: bigint; userAddress: Address }) {
    validateChainId(this.client.viemClient.chain?.id, this.chainId);

    return {
      buildTx: () =>
        vaultV1Withdraw({
          vault: { address: this.vault },
          args: {
            amount,
            recipient: userAddress,
            onBehalf: userAddress,
          },
          metadata: this.client.options.metadata,
        }),
    };
  }

  redeem({ shares, userAddress }: { shares: bigint; userAddress: Address }) {
    validateChainId(this.client.viemClient.chain?.id, this.chainId);

    return {
      buildTx: () =>
        vaultV1Redeem({
          vault: { address: this.vault },
          args: {
            shares,
            recipient: userAddress,
            onBehalf: userAddress,
          },
          metadata: this.client.options.metadata,
        }),
    };
  }

  migrateToV2({
    userAddress,
    sourceVault,
    targetVault,
    shares,
    slippageTolerance = DEFAULT_SLIPPAGE_TOLERANCE,
  }: {
    userAddress: Address;
    sourceVault: AccrualVault;
    targetVault: AccrualVaultV2;
    shares: bigint;
    slippageTolerance?: bigint;
  }) {
    validateChainId(this.client.viemClient.chain?.id, this.chainId);

    if (!isAddressEqual(sourceVault.address, this.vault)) {
      throw new VaultAddressMismatchError(this.vault, sourceVault.address);
    }

    if (!isAddressEqual(sourceVault.asset, targetVault.asset)) {
      throw new VaultAssetMismatchError(sourceVault.asset, targetVault.asset);
    }

    if (shares <= 0n) {
      throw new NonPositiveSharesAmountError(this.vault);
    }

    if (slippageTolerance < 0n) {
      throw new NegativeSlippageToleranceError(slippageTolerance);
    }
    if (slippageTolerance > MAX_SLIPPAGE_TOLERANCE) {
      throw new ExcessiveSlippageToleranceError(slippageTolerance);
    }

    // Compute minSharePriceVaultV1 for V1 redeem (slippage downward)
    const v1RefAssets = sourceVault.toAssets(shares);
    const minSharePriceVaultV1 = MathLib.mulDivDown(
      v1RefAssets,
      MathLib.wToRay(MathLib.WAD - slippageTolerance),
      shares,
    );

    // Compute maxSharePriceVaultV2 for V2 deposit (slippage upward)
    const v2RefShares = targetVault.toShares(v1RefAssets);
    if (v2RefShares <= 0n) {
      throw new NonPositiveSharesAmountError(targetVault.address);
    }
    const maxSharePriceVaultV2 = MathLib.min(
      MathLib.mulDivUp(
        v1RefAssets,
        MathLib.wToRay(MathLib.WAD + slippageTolerance),
        v2RefShares,
      ),
      MAX_ABSOLUTE_SHARE_PRICE,
    );

    return {
      getRequirements: async () =>
        await getRequirements(this.client.viemClient, {
          address: this.vault,
          chainId: this.chainId,
          supportSignature: this.client.options.supportSignature,
          supportDeployless: this.client.options.supportDeployless,
          // V1 shares always implement EIP-2612.
          useSimplePermit: true,
          args: {
            amount: shares,
            from: userAddress,
          },
        }),

      buildTx: (requirementSignature?: RequirementSignature) =>
        vaultV1MigrateToV2({
          vault: {
            chainId: this.chainId,
            address: this.vault,
            asset: sourceVault.asset,
          },
          args: {
            targetVault: targetVault.address,
            targetAsset: targetVault.asset,
            shares,
            minSharePriceVaultV1,
            maxSharePriceVaultV2,
            recipient: userAddress,
            requirementSignature,
          },
          metadata: this.client.options.metadata,
        }),
    };
  }
}
