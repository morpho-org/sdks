import {
  type AccrualVault,
  type AccrualVaultV2,
  DEFAULT_SLIPPAGE_TOLERANCE,
  getChainAddresses,
  type MarketParams,
  MathLib,
} from "@morpho-org/blue-sdk";
import {
  erc2612Abi,
  fetchAccrualVault,
  metaMorphoAbi,
} from "@morpho-org/blue-sdk-viem";
import { getChainAddress, Time } from "@morpho-org/morpho-ts";
import { type Address, erc20Abi, isAddressEqual, maxUint256 } from "viem";
import { multicall } from "viem/actions";
import {
  encodeErc20Approval,
  encodeVaultSharesPermit,
  getGeneralAdapterRequirements,
  vaultV1Deposit,
  vaultV1InKindRedeem,
  vaultV1MigrateToV2,
  vaultV1Redeem,
  vaultV1Withdraw,
} from "../../actions/index.js";
import { MAX_ABSOLUTE_SHARE_PRICE } from "../../helpers/constant.js";
import {
  validateChainId,
  validateSlippageTolerance,
} from "../../helpers/index.js";
import type { FetchParameters } from "../../types/data.js";
import {
  type ActionRequirement,
  ChainIdMismatchError,
  ChainWNativeMissingError,
  type DepositAmountArgs,
  EmptyMarketParamsListError,
  type ERC20ApprovalAction,
  ExpiredDeadlineError,
  InKindRedemptionCoverageError,
  InsufficientBlueBalanceForInKindRedeemError,
  type MorphoClientType,
  NativeAmountOnNonWNativeVaultError,
  NegativeInputError,
  NonPositiveInputError,
  type PermitRequirementSignature,
  type Requirement,
  type RequirementSignature,
  selectRequirementSignatures,
  type Transaction,
  VaultAddressMismatchError,
  VaultAssetMismatchError,
  VaultMorphoMismatchError,
  type VaultV1DepositAction,
  type VaultV1InKindRedeemAction,
  type VaultV1MigrateToV2Action,
  type VaultV1RedeemAction,
  type VaultV1WithdrawAction,
} from "../../types/index.js";

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
   * then returns `buildTx` and `getRequirements` for lazy evaluation.
   *
   * @param {Object} params - The deposit parameters.
   * @param {bigint} params.amount - Amount of assets to deposit.
   * @param {Address} params.userAddress - User address initiating the deposit.
   * @param {AccrualVault} params.vaultData - Pre-fetched vault data with asset address and share conversion.
   * @param {bigint} [params.slippageTolerance=DEFAULT_SLIPPAGE_TOLERANCE] - Slippage tolerance (default 0.03%, max 10%).
   * @param {bigint} [params.nativeAmount] - Amount of native ETH to wrap into WETH. Vault asset must be wNative.
   * @returns {Object} Object with `buildTx` and `getRequirements`.
   */
  deposit: (
    params: {
      userAddress: Address;
      vaultData: AccrualVault;
      slippageTolerance?: bigint;
    } & DepositAmountArgs,
  ) => {
    buildTx: (
      signatures?: readonly RequirementSignature[],
    ) => Readonly<Transaction<VaultV1DepositAction>>;
    getRequirements: (params?: {
      useSimplePermit?: boolean;
    }) => Promise<
      (
        | Readonly<Transaction<ERC20ApprovalAction>>
        | Requirement<PermitRequirementSignature>
      )[]
    >;
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
   * Prepares an illiquid Vault V1 exit into the vault's Morpho Blue supply positions.
   *
   * The caller controls market order and must call `getRequirements()` before `buildTx()` so the
   * RPC-backed Blue-balance and Morpho-deployment checks run. The SDK validates market coverage but
   * intentionally does not validate the user's share balance; size `amount` in asset terms against
   * `previewRedeem(sharesHeld)`. A max-share permit or approval remains after execution.
   *
   * Snapshot state can drift before inclusion, so a later reallocation may still make the on-chain
   * loop under-cover even after pre-flight succeeds.
   *
   * @param params - In-kind redemption parameters.
   * @param params.amount - Asset-denominated amount to exit.
   * @param params.marketParamsList - Ordered vault markets consumed greedily by the contract.
   * @param params.vaultData - Pre-fetched Vault V1 accrual snapshot.
   * @param params.userAddress - Account that signs and submits the exit.
   * @param params.deadline - Optional shared permit/bundle deadline; defaults to two hours from now.
   * @returns Lazy prerequisite resolution and a synchronous transaction builder.
   * @throws {ChainIdMismatchError} when the client and entity target different chains.
   * @throws {VaultAddressMismatchError} when `vaultData` belongs to another vault.
   * @throws {NonPositiveInputError} when `amount` is not positive.
   * @throws {EmptyMarketParamsListError} when the market list is empty.
   * @throws {ExpiredDeadlineError} when `deadline` is not in the future.
   * @throws {InKindRedemptionCoverageError} when the ordered list cannot cover `amount`.
   * @throws {UnsupportedChainIdError} when no address registry exists for the target chain.
   * @throws {UnknownAddressError} when VaultExitBundlesV1 is not registered on the target chain.
   * @throws {VaultMorphoMismatchError} from `getRequirements()` when the vault uses another Morpho deployment.
   * @throws {InsufficientBlueBalanceForInKindRedeemError} from `getRequirements()` when Blue cannot fund the flash loan.
   * @throws {InKindRedeemPermitMismatchError} from `buildTx()` when a signature is not bound to this exit.
   * @example
   * ```ts
   * const vault = client.morpho.vaultV1(vaultAddress, 1);
   * const vaultData = await vault.getData();
   * const exit = vault.inKindRedeem({
   *   amount: 1_000_000n,
   *   marketParamsList,
   *   vaultData,
   *   userAddress,
   * });
   * const requirements = await exit.getRequirements();
   * const tx = exit.buildTx();
   * ```
   */
  inKindRedeem: (params: {
    amount: bigint;
    marketParamsList: readonly MarketParams[];
    vaultData: AccrualVault;
    userAddress: Address;
    deadline?: bigint;
  }) => {
    buildTx: (
      signatures?: readonly RequirementSignature[],
    ) => Readonly<Transaction<VaultV1InKindRedeemAction>>;
    getRequirements: () => Promise<readonly ActionRequirement[]>;
  };
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
   * @returns {Object} Object with `buildTx` and `getRequirements`.
   */
  migrateToV2: (params: {
    userAddress: Address;
    sourceVault: AccrualVault;
    targetVault: AccrualVaultV2;
    shares: bigint;
    slippageTolerance?: bigint;
  }) => {
    buildTx: (
      signatures?: readonly RequirementSignature[],
    ) => Readonly<Transaction<VaultV1MigrateToV2Action>>;
    getRequirements: () => Promise<
      (
        | Readonly<Transaction<ERC20ApprovalAction>>
        | Requirement<PermitRequirementSignature>
      )[]
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
    return {
      getRequirements: (params?: { useSimplePermit?: boolean }) =>
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

      buildTx: (signatures?: readonly RequirementSignature[]) => {
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
    if (this.client.viemClient.chain?.id !== this.chainId) {
      throw new ChainIdMismatchError(
        this.client.viemClient.chain?.id,
        this.chainId,
      );
    }

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

  inKindRedeem({
    amount,
    marketParamsList,
    vaultData,
    userAddress,
    deadline: deadlineOverride,
  }: {
    amount: bigint;
    marketParamsList: readonly MarketParams[];
    vaultData: AccrualVault;
    userAddress: Address;
    deadline?: bigint;
  }) {
    if (this.client.viemClient.chain?.id !== this.chainId) {
      throw new ChainIdMismatchError(
        this.client.viemClient.chain?.id,
        this.chainId,
      );
    }
    if (!isAddressEqual(vaultData.address, this.vault)) {
      throw new VaultAddressMismatchError(this.vault, vaultData.address);
    }
    if (amount <= 0n) throw new NonPositiveInputError("amount", amount);
    if (marketParamsList.length === 0) throw new EmptyMarketParamsListError();

    const now = Time.timestamp();
    const deadline = deadlineOverride ?? now + Time.s.from.h(2n);
    if (deadline <= now) throw new ExpiredDeadlineError(deadline, now);

    const vaultExitBundlesV1 = getChainAddress(
      this.chainId,
      "bundles.vaultExitBundlesV1",
    );
    const addresses = getChainAddresses(this.chainId);
    const blue = addresses.blue ?? addresses.morpho;
    const covered = marketParamsList.reduce((total, marketParams) => {
      const allocation = vaultData.allocations.get(marketParams.id);
      if (allocation?.config.enabled !== true) return total;

      const market = allocation.position.market.accrueInterest(
        MathLib.max(now, allocation.position.market.lastUpdate),
      );
      return total + market.toSupplyAssets(allocation.position.supplyShares);
    }, 0n);
    if (covered < amount) {
      throw new InKindRedemptionCoverageError({
        required: amount,
        covered,
        maxExitAssets: covered,
      });
    }

    return {
      getRequirements: async (): Promise<readonly ActionRequirement[]> => {
        const [allowance, nonce, blueBalance, morpho] = await multicall(
          this.client.viemClient,
          {
            allowFailure: false,
            contracts: [
              {
                address: this.vault,
                abi: erc20Abi,
                functionName: "allowance",
                args: [userAddress, vaultExitBundlesV1],
              },
              {
                address: this.vault,
                abi: erc2612Abi,
                functionName: "nonces",
                args: [userAddress],
              },
              {
                address: vaultData.asset,
                abi: erc20Abi,
                functionName: "balanceOf",
                args: [blue],
              },
              {
                address: this.vault,
                abi: metaMorphoAbi,
                functionName: "MORPHO",
              },
            ],
          },
        );

        if (!isAddressEqual(morpho, blue)) {
          throw new VaultMorphoMismatchError({
            vault: this.vault,
            expected: blue,
            actual: morpho,
          });
        }
        if (blueBalance < amount) {
          throw new InsufficientBlueBalanceForInKindRedeemError({
            asset: vaultData.asset,
            available: blueBalance,
            required: amount,
          });
        }
        if (allowance === maxUint256) return [];
        if (this.client.options.supportSignature) {
          return [
            encodeVaultSharesPermit({
              vault: vaultData,
              version: "vaultV1",
              spender: vaultExitBundlesV1,
              owner: userAddress,
              chainId: this.chainId,
              nonce,
              deadline,
            }),
          ];
        }
        return [
          encodeErc20Approval({
            token: this.vault,
            spender: vaultExitBundlesV1,
            amount: maxUint256,
            chainId: this.chainId,
          }),
        ];
      },
      buildTx: (signatures?: readonly RequirementSignature[]) => {
        const { permit } = selectRequirementSignatures(signatures, {
          permit: true,
        });
        return vaultV1InKindRedeem({
          vault: { chainId: this.chainId, address: this.vault },
          args: {
            amount,
            marketParamsList,
            userAddress,
            deadline,
            requirementSignature: permit,
          },
          metadata: this.client.options.metadata,
        });
      },
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
    return {
      getRequirements: () =>
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

      buildTx: (signatures?: readonly RequirementSignature[]) => {
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
    };
  }
}
