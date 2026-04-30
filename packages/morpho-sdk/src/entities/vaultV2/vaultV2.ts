import {
  type AccrualVaultV2,
  DEFAULT_SLIPPAGE_TOLERANCE,
  MathLib,
  getChainAddresses,
} from "@morpho-org/blue-sdk";
import { fetchAccrualVaultV2 } from "@morpho-org/blue-sdk-viem";
import { type Address, isAddressEqual } from "viem";
import {
  getRequirements,
  vaultV2Deposit,
  vaultV2ForceRedeem,
  vaultV2ForceWithdraw,
  vaultV2Redeem,
  vaultV2Withdraw,
} from "../../actions/index.js";
import { MAX_SLIPPAGE_TOLERANCE } from "../../helpers/constant.js";
import type { FetchParameters } from "../../types/data.js";
import {
  ChainIdMismatchError,
  ChainWNativeMissingError,
  type Deallocation,
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
  type VaultV2DepositAction,
  type VaultV2ForceRedeemAction,
  type VaultV2ForceWithdrawAction,
  type VaultV2RedeemAction,
  type VaultV2WithdrawAction,
} from "../../types/index.js";

export interface VaultV2Actions {
  /**
   * Fetches the latest vault data.
   *
   * This function fetches the latest vault data from the blockchain.
   * @param {FetchParameters} [parameters] - The parameters for the fetch operation.
   *
   * @returns {Promise<Awaited<ReturnType<typeof fetchAccrualVaultV2>>>} The latest vault data.
   */
  getData: (
    parameters?: FetchParameters,
  ) => Promise<Awaited<ReturnType<typeof fetchAccrualVaultV2>>>;
  /**
   * Prepares a deposit transaction for the VaultV2 contract.
   *
   * This function constructs the transaction data required to deposit a specified amount of assets into the vault.
   * Uses pre-fetched accrual vault data for accurate calculations of slippage and asset address,
   * then returns the prepared deposit transaction and a function for retrieving all required approval transactions.
   * Bundler Integration: This flow uses the bundler to atomically execute the user's asset transfer and vault deposit in a single transaction for slippage protection.
   *
   * @param {Object} params - The deposit parameters.
   * @param {bigint} [params.amount=0n] - Amount of ERC-20 assets to deposit. At least one of amount or nativeAmount must be provided.
   * @param {Address} params.userAddress - User address initiating the deposit.
   * @param {AccrualVaultV2} params.accrualVault - Pre-fetched vault data with asset address and share conversion.
   * @param {bigint} [params.slippageTolerance=DEFAULT_SLIPPAGE_TOLERANCE] - Optional slippage tolerance value. Default is 0.03%. Slippage tolerance must be less than 10%.
   * @param {bigint} [params.nativeAmount] - Amount of native token to wrap into wNative. Vault asset must be wNative.
   * @returns {Object} The result object.
   * @returns {Readonly<Transaction<VaultV2DepositAction>>} returns.tx The prepared deposit transaction.
   * @returns {Promise<(Readonly<Transaction<ERC20ApprovalAction>> | Requirement)[]>} returns.getRequirements The function for retrieving all required approval transactions.
   */
  deposit: (
    params: {
      userAddress: Address;
      accrualVault: AccrualVaultV2;
      slippageTolerance?: bigint;
    } & DepositAmountArgs,
  ) => {
    buildTx: (
      requirementSignature?: RequirementSignature,
    ) => Readonly<Transaction<VaultV2DepositAction>>;
    getRequirements: (params?: {
      useSimplePermit?: boolean;
    }) => Promise<(Readonly<Transaction<ERC20ApprovalAction>> | Requirement)[]>;
  };
  /**
   * Prepares a withdraw transaction for the VaultV2 contract.
   *
   * This function constructs the transaction data required to withdraw a specified amount of assets from the vault.
   *
   * @param {Object} params - The withdraw parameters.
   * @param {bigint} params.amount - The amount of assets to withdraw.
   * @param {Address} params.userAddress - User address initiating the withdraw.
   * @returns {Object} The result object.
   * @returns {Readonly<Transaction<VaultV2WithdrawAction>>} returns.tx The prepared withdraw transaction.
   */
  withdraw: (params: { amount: bigint; userAddress: Address }) => {
    buildTx: () => Readonly<Transaction<VaultV2WithdrawAction>>;
  };
  /**
   * Prepares a redeem transaction for the VaultV2 contract.
   *
   * This function constructs the transaction data required to redeem a specified amount of shares from the vault.
   *
   * @param {Object} params - The redeem parameters.
   * @param {bigint} params.shares - The amount of shares to redeem.
   * @param {Address} params.userAddress - User address initiating the redeem.
   * @returns {Object} The result object.
   * @returns {Readonly<Transaction<VaultV2RedeemAction>>} returns.tx The prepared redeem transaction.
   */
  redeem: (params: { shares: bigint; userAddress: Address }) => {
    buildTx: () => Readonly<Transaction<VaultV2RedeemAction>>;
  };
  /**
   * Prepares a force withdraw transaction for the VaultV2 contract using the vault's native multicall.
   *
   * This function encodes one or more on-chain forceDeallocate calls followed by a single withdraw,
   * executed atomically via VaultV2's multicall. This allows a user to free liquidity from multiple
   * illiquid markets and withdraw the resulting assets in one transaction.
   *
   * @param {Object} params - The force withdraw parameters.
   * @param {readonly Deallocation[]} params.deallocations - The typed list of deallocations to perform.
   * @param {Object} params.withdraw - The withdraw parameters applied after deallocations.
   * @param {bigint} params.withdraw.amount - The amount of assets to withdraw.
   * @param {Address} params.userAddress - User address (penalty source and withdraw recipient).
   * @returns {Object} The result object.
   * @returns {Readonly<Transaction<VaultV2ForceWithdrawAction>>} returns.buildTx The prepared multicall transaction.
   */
  forceWithdraw: (params: {
    deallocations: readonly Deallocation[];
    withdraw: { amount: bigint };
    userAddress: Address;
  }) => {
    buildTx: () => Readonly<Transaction<VaultV2ForceWithdrawAction>>;
  };
  /**
   * Prepares a force redeem transaction for the VaultV2 contract using the vault's native multicall.
   *
   * This function encodes one or more on-chain forceDeallocate calls followed by a single redeem,
   * executed atomically via VaultV2's multicall. This allows a user to free liquidity from multiple
   * illiquid markets and redeem all their shares in one transaction.
   *
   * This is the share-based counterpart to forceWithdraw, useful for maximum withdrawal scenarios
   * where specifying an exact asset amount is impractical.
   *
   * The total assets passed to forceDeallocate calls must be greater than or equal to the
   * asset-equivalent of the redeemed shares. The caller should apply a buffer on the deallocated
   * amounts to account for share-price drift between submission and execution.
   *
   * @param {Object} params - The force redeem parameters.
   * @param {readonly Deallocation[]} params.deallocations - The typed list of deallocations to perform.
   * @param {Object} params.redeem - The redeem parameters applied after deallocations.
   * @param {bigint} params.redeem.shares - The amount of shares to redeem.
   * @param {Address} params.userAddress - User address (penalty source and redeem recipient).
   * @returns {Object} The result object.
   * @returns {Readonly<Transaction<VaultV2ForceRedeemAction>>} returns.buildTx The prepared multicall transaction.
   */
  forceRedeem: (params: {
    deallocations: readonly Deallocation[];
    redeem: { shares: bigint };
    userAddress: Address;
  }) => {
    buildTx: () => Readonly<Transaction<VaultV2ForceRedeemAction>>;
  };
}

export class MorphoVaultV2 implements VaultV2Actions {
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

    return fetchAccrualVaultV2(this.vault, this.client.viemClient, {
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
    accrualVault: AccrualVaultV2;
    slippageTolerance?: bigint;
  } & DepositAmountArgs) {
    if (this.client.viemClient.chain?.id !== this.chainId) {
      throw new ChainIdMismatchError(
        this.client.viemClient.chain?.id,
        this.chainId,
      );
    }

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
      MathLib.RAY * 100n,
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
        vaultV2Deposit({
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
    if (this.client.viemClient.chain?.id !== this.chainId) {
      throw new ChainIdMismatchError(
        this.client.viemClient.chain?.id,
        this.chainId,
      );
    }

    return {
      buildTx: () =>
        vaultV2Withdraw({
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
    if (this.client.viemClient.chain?.id !== this.chainId) {
      throw new ChainIdMismatchError(
        this.client.viemClient.chain?.id,
        this.chainId,
      );
    }

    return {
      buildTx: () =>
        vaultV2Redeem({
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

  forceWithdraw({
    deallocations,
    withdraw,
    userAddress,
  }: {
    deallocations: readonly Deallocation[];
    withdraw: { amount: bigint };
    userAddress: Address;
  }) {
    if (this.client.viemClient.chain?.id !== this.chainId) {
      throw new ChainIdMismatchError(
        this.client.viemClient.chain?.id,
        this.chainId,
      );
    }

    return {
      buildTx: () =>
        vaultV2ForceWithdraw({
          vault: { address: this.vault },
          args: {
            deallocations,
            withdraw: {
              amount: withdraw.amount,
              recipient: userAddress,
            },
            onBehalf: userAddress,
          },
          metadata: this.client.options.metadata,
        }),
    };
  }

  forceRedeem({
    deallocations,
    redeem,
    userAddress,
  }: {
    deallocations: readonly Deallocation[];
    redeem: { shares: bigint };
    userAddress: Address;
  }) {
    if (this.client.viemClient.chain?.id !== this.chainId) {
      throw new ChainIdMismatchError(
        this.client.viemClient.chain?.id,
        this.chainId,
      );
    }

    return {
      buildTx: () =>
        vaultV2ForceRedeem({
          vault: { address: this.vault },
          args: {
            deallocations,
            redeem: {
              shares: redeem.shares,
              recipient: userAddress,
            },
            onBehalf: userAddress,
          },
          metadata: this.client.options.metadata,
        }),
    };
  }
}
