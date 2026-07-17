import {
  type AccrualVault,
  type AccrualVaultV2,
  DEFAULT_SLIPPAGE_TOLERANCE,
  getChainAddresses,
  MathLib,
} from "@morpho-org/blue-sdk";
import { fetchAccrualVault } from "@morpho-org/blue-sdk-viem";
import { Time } from "@morpho-org/morpho-ts";
import { type Address, isAddressEqual } from "viem";
import {
  getGeneralAdapterRequirements,
  vaultV1Deposit,
  vaultV1MigrateToV2,
  vaultV1Redeem,
  vaultV1Withdraw,
} from "../../actions/index.js";
import { MAX_ABSOLUTE_SHARE_PRICE } from "../../helpers/constant.js";
import {
  validateChainId,
  validateSlippageTolerance,
} from "../../helpers/index.js";
import {
  TransactionPlan,
  type TransactionPlanSimplePermitOptions,
  type TransactionPlanTokenRequest,
} from "../../transactionPlan/index.js";
import type { FetchParameters } from "../../types/data.js";
import {
  ChainIdMismatchError,
  ChainWNativeMissingError,
  type DepositAmountArgs,
  type MorphoClientType,
  NativeAmountOnNonWNativeVaultError,
  NegativeInputError,
  NonPositiveInputError,
  selectRequirementSignatures,
  VaultAddressMismatchError,
  VaultAssetMismatchError,
  type VaultV1DepositAction,
  type VaultV1MigrateToV2Action,
  type VaultV1RedeemAction,
  type VaultV1WithdrawAction,
} from "../../types/index.js";

/**
 * VaultV1 action flows are synchronous so the SDK does not own vault data fetching. Consumers pass
 * the vault snapshots they already fetched, which lets each app batch, cache, and refresh data for
 * its own UX. Each flow returns a TransactionPlan; call `prepare()` when the app is ready to compute
 * the minimal signature requests and/or transaction steps needed to execute that intent.
 */
export interface VaultV1Actions {
  /**
   * Fetches the latest vault data with accrued interest.
   *
   * @param {FetchParameters} [parameters] - Optional fetch parameters (block number, state overrides, etc.).
   * @returns {Promise<Awaited<ReturnType<typeof fetchAccrualVault>>>} The latest vault data.
   */
  getData: (
    parameters?: FetchParameters,
  ) => Promise<Awaited<ReturnType<typeof fetchAccrualVault>>>;
  /**
   * Prepares a deposit into a VaultV1 (MetaMorpho) contract.
   *
   * Uses pre-fetched vault data to compute `maxSharePrice` with slippage tolerance,
   * then returns a TransactionPlan for lazy request discovery and execution.
   *
   * @param {Object} params - The deposit parameters.
   * @param {bigint} params.amount - Amount of assets to deposit.
   * @param {Address} params.userAddress - User address initiating the deposit.
   * @param {AccrualVault} params.vaultData - Pre-fetched vault data with asset address and share conversion.
   * @param {bigint} [params.slippageTolerance=DEFAULT_SLIPPAGE_TOLERANCE] - Slippage tolerance (default 0.03%, max 10%).
   * @param {bigint} [params.nativeAmount] - Amount of native ETH to wrap into WETH. Vault asset must be wNative.
   * @returns A lazy `TransactionPlan` whose `prepare()` resolves token approval or permit requests
   *   and whose prepared form builds the executable deposit call.
   */
  deposit: (
    params: {
      userAddress: Address;
      vaultData: AccrualVault;
      slippageTolerance?: bigint;
    } & DepositAmountArgs,
  ) => TransactionPlan<
    VaultV1DepositAction,
    TransactionPlanSimplePermitOptions,
    TransactionPlanTokenRequest
  >;
  /**
   * Prepares a withdraw from a VaultV1 (MetaMorpho) contract.
   *
   * @param {Object} params - The withdraw parameters.
   * @param {bigint} params.amount - Amount of assets to withdraw.
   * @param {Address} params.userAddress - User address initiating the withdraw.
   * @returns A lazy `TransactionPlan` that prepares and builds the direct withdraw transaction.
   */
  withdraw: (params: {
    amount: bigint;
    userAddress: Address;
  }) => TransactionPlan<VaultV1WithdrawAction>;
  /**
   * Prepares a redeem from a VaultV1 (MetaMorpho) contract.
   *
   * @param {Object} params - The redeem parameters.
   * @param {bigint} params.shares - Amount of shares to redeem.
   * @param {Address} params.userAddress - User address initiating the redeem.
   * @returns A lazy `TransactionPlan` that prepares and builds the direct redeem transaction.
   */
  redeem: (params: {
    shares: bigint;
    userAddress: Address;
  }) => TransactionPlan<VaultV1RedeemAction>;
  /**
   * Prepares a full migration from VaultV1 to VaultV2.
   *
   * Redeems all V1 shares and atomically deposits the resulting assets into V2
   * via bundler3. Computes slippage-protected share prices for both legs.
   *
   * @param {Object} params - The migration parameters.
   * @param {Address} params.userAddress - User address initiating the migration.
   * @param {AccrualVault} params.sourceVault - Pre-fetched V1 vault data.
   * @param {AccrualVaultV2} params.targetVault - Pre-fetched V2 vault data.
   * @param {bigint} params.shares - User's V1 share balance to migrate.
   * @param {bigint} [params.slippageTolerance=DEFAULT_SLIPPAGE_TOLERANCE] - Slippage tolerance (default 0.03%, max 10%).
   * @returns A lazy `TransactionPlan` whose `prepare()` resolves the V1-share approval request
   *   and whose prepared form builds the atomic migration call.
   */
  migrateToV2: (params: {
    userAddress: Address;
    sourceVault: AccrualVault;
    targetVault: AccrualVaultV2;
    shares: bigint;
    slippageTolerance?: bigint;
  }) => TransactionPlan<
    VaultV1MigrateToV2Action,
    unknown,
    TransactionPlanTokenRequest
  >;
}

export class MorphoVaultV1 implements VaultV1Actions {
  // biome-ignore lint/complexity/useMaxParams: TODO refactor to ≤2 params
  constructor(
    private readonly client: MorphoClientType,
    private readonly vault: Address,
    private readonly chainId: number,
  ) {}

  async getData(parameters?: FetchParameters) {
    if (
      this.client.viemClient.chain?.id &&
      this.client.viemClient.chain?.id !== this.chainId
    ) {
      throw new ChainIdMismatchError(
        this.client.viemClient.chain?.id,
        this.chainId,
      );
    }

    return fetchAccrualVault(this.vault, this.client.viemClient, {
      ...parameters,
      chainId: this.chainId,
      deployless: this.client.options.supportDeployless,
    });
  }

  deposit({
    amount = 0n,
    userAddress,
    vaultData,
    slippageTolerance = DEFAULT_SLIPPAGE_TOLERANCE,
    nativeAmount,
  }: {
    userAddress: Address;
    vaultData: AccrualVault;
    slippageTolerance?: bigint;
  } & DepositAmountArgs) {
    if (this.client.viemClient.chain?.id !== this.chainId) {
      throw new ChainIdMismatchError(
        this.client.viemClient.chain?.id,
        this.chainId,
      );
    }

    if (!isAddressEqual(vaultData.address, this.vault)) {
      throw new VaultAddressMismatchError(this.vault, vaultData.address);
    }

    if (amount < 0n) {
      throw new NegativeInputError("amount", amount);
    }

    if (nativeAmount && nativeAmount < 0n) {
      throw new NegativeInputError("nativeAmount", nativeAmount);
    }

    let wNative: Address | undefined;
    if (nativeAmount) {
      ({ wNative } = getChainAddresses(this.chainId));
      if (!wNative) {
        throw new ChainWNativeMissingError(this.chainId);
      }
    }

    validateSlippageTolerance(slippageTolerance);

    if (nativeAmount && wNative) {
      if (!isAddressEqual(vaultData.asset, wNative)) {
        throw new NativeAmountOnNonWNativeVaultError(vaultData.asset, wNative);
      }
    }

    const totalAssets = amount + (nativeAmount ?? 0n);
    if (totalAssets === 0n) {
      throw new NonPositiveInputError("totalAssets", totalAssets);
    }

    const shares = vaultData.toShares(totalAssets);
    if (shares <= 0n) {
      throw new NonPositiveInputError("shares", shares);
    }

    const maxSharePrice = MathLib.min(
      MathLib.mulDivUp(
        totalAssets,
        MathLib.wToRay(MathLib.WAD + slippageTolerance),
        shares,
      ),
      MAX_ABSOLUTE_SHARE_PRICE,
    );
    return new TransactionPlan({
      getRequirementRequests: (params?: TransactionPlanSimplePermitOptions) =>
        getGeneralAdapterRequirements(this.client.viemClient, {
          address: vaultData.asset,
          chainId: this.chainId,
          supportSignature: this.client.options.supportSignature,
          supportDeployless: this.client.options.supportDeployless,
          useSimplePermit: params?.useSimplePermit,
          args: {
            amount,
            from: userAddress,
          },
        }),

      buildPrimaryTransaction: (signatures) => {
        const { permit } = selectRequirementSignatures(signatures, {
          permit: true,
        });

        return vaultV1Deposit({
          vault: {
            chainId: this.chainId,
            address: this.vault,
            asset: vaultData.asset,
          },
          args: {
            amount,
            maxSharePrice,
            recipient: userAddress,
            requirementSignature: permit,
            nativeAmount,
          },
          metadata: this.client.options.metadata,
        });
      },
    });
  }

  withdraw({ amount, userAddress }: { amount: bigint; userAddress: Address }) {
    if (this.client.viemClient.chain?.id !== this.chainId) {
      throw new ChainIdMismatchError(
        this.client.viemClient.chain?.id,
        this.chainId,
      );
    }

    return new TransactionPlan({
      buildPrimaryTransaction: () =>
        vaultV1Withdraw({
          vault: { address: this.vault },
          args: {
            amount,
            recipient: userAddress,
            onBehalf: userAddress,
          },
          metadata: this.client.options.metadata,
        }),
    });
  }

  redeem({ shares, userAddress }: { shares: bigint; userAddress: Address }) {
    if (this.client.viemClient.chain?.id !== this.chainId) {
      throw new ChainIdMismatchError(
        this.client.viemClient.chain?.id,
        this.chainId,
      );
    }

    return new TransactionPlan({
      buildPrimaryTransaction: () =>
        vaultV1Redeem({
          vault: { address: this.vault },
          args: {
            shares,
            recipient: userAddress,
            onBehalf: userAddress,
          },
          metadata: this.client.options.metadata,
        }),
    });
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
      throw new NonPositiveInputError("shares", shares);
    }

    validateSlippageTolerance(slippageTolerance);

    // Compute minSharePriceVaultV1 for V1 redeem (slippage downward)
    const v1RefAssets = sourceVault.toAssets(shares);
    const minSharePriceVaultV1 = MathLib.mulDivDown(
      v1RefAssets,
      MathLib.wToRay(MathLib.WAD - slippageTolerance),
      shares,
    );

    // Compute maxSharePriceVaultV2 for V2 deposit (slippage upward).
    // Accrue VaultV2 interest forward to bound the on-chain share price at execution.
    const targetAccrualTimestamp =
      MathLib.max(Time.timestamp(), targetVault.lastUpdate) + Time.s.from.h(2n);
    const { vault: accruedTargetVault } = targetVault.accrueInterest(
      targetAccrualTimestamp,
    );
    const v2RefShares = accruedTargetVault.toShares(v1RefAssets);
    if (v2RefShares <= 0n) {
      throw new NonPositiveInputError("targetVaultShares", v2RefShares);
    }
    const maxSharePriceVaultV2 = MathLib.min(
      MathLib.mulDivUp(
        v1RefAssets,
        MathLib.wToRay(MathLib.WAD + slippageTolerance),
        v2RefShares,
      ),
      MAX_ABSOLUTE_SHARE_PRICE,
    );
    return new TransactionPlan({
      getRequirementRequests: () =>
        getGeneralAdapterRequirements(this.client.viemClient, {
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

      buildPrimaryTransaction: (signatures) => {
        const { permit } = selectRequirementSignatures(signatures, {
          permit: true,
        });

        return vaultV1MigrateToV2({
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
            requirementSignature: permit,
          },
          metadata: this.client.options.metadata,
        });
      },
    });
  }
}
