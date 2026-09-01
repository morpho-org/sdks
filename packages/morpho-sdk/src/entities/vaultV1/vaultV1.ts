import {
  type AccrualVault,
  type AccrualVaultV2,
  DEFAULT_SLIPPAGE_TOLERANCE,
  getChainAddresses,
  type MarketParams,
  MarketUtils,
  MathLib,
} from "@morpho-org/blue-sdk";
import {
  blueAbi,
  erc2612Abi,
  fetchAccrualVault,
  metaMorphoAbi,
} from "@morpho-org/blue-sdk-viem";
import { getChainAddress, Time } from "@morpho-org/morpho-ts";
import { type Address, erc20Abi, isAddressEqual } from "viem";
import { multicall } from "viem/actions";
import {
  getBundlesReferralFeeAssets,
  normalizeBundlesCommonParams,
  resolveBundlesFunding,
  selectBundlesTokenRequirementSignature,
} from "../../actions/bundles/index.js";
import {
  encodeErc20Approval,
  encodeVaultSharesPermit,
  vaultV1Deposit,
  vaultV1InKindRedeem,
  vaultV1MigrateToV2,
  vaultV1Redeem,
  vaultV1Withdraw,
} from "../../actions/index.js";
import {
  computeVaultMaxSharePrice,
  validateChainId,
  validateSlippageTolerance,
  validateUserAddress,
} from "../../helpers/index.js";
import { validateNativeVaultAsset } from "../../helpers/validate.js";
import type { FetchParameters } from "../../types/data.js";
import {
  type ActionOutput,
  type ActionRequirement,
  AmountAndSharesExclusiveError,
  type BundlesFundingArgs,
  type BundlesTokenRequirementsOptions,
  ChainIdMismatchError,
  EmptyMarketParamsListError,
  ExpiredDeadlineError,
  InKindRedeemCoverageError,
  InsufficientBlueBalanceForInKindRedeemError,
  type MorphoClientType,
  NonPositiveInputError,
  type RequirementSignature,
  SameVaultMigrationError,
  selectRequirementSignatures,
  VaultAddressMismatchError,
  VaultAssetMismatchError,
  VaultIsBlueFeeRecipientError,
  VaultMorphoMismatchError,
  type VaultV1DepositAction,
  type VaultV1InKindRedeemAction,
  type VaultV1MigrateToV2Action,
  type VaultV1MigrateToV2AmountArgs,
  type VaultV1RedeemAction,
  type VaultV1WithdrawAction,
} from "../../types/index.js";
import { getVaultBundlesSharesRequirements } from "../requirements/getVaultBundlesSharesRequirements.js";
import { getBundlesTokenRequirements } from "../requirements/index.js";

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
   * @param {bigint} [params.amount] - ERC-20 assets to deposit; exclusive with `nativeAmount`.
   * @param {Address} params.userAddress - Account that must sign and submit the transaction; VaultBundlesV1 always mints shares to `msg.sender`.
   * @param {AccrualVault} params.vaultData - Pre-fetched vault data with asset address and share conversion.
   * @param {bigint} [params.slippageTolerance=DEFAULT_SLIPPAGE_TOLERANCE] - Slippage tolerance (default 0.03%, max 10%).
   * @param {bigint} [params.nativeAmount] - Native assets to wrap and deposit; exclusive with `amount` and requires a wNative vault.
   * @returns Lazy token requirements and a synchronous VaultBundlesV1 transaction builder.
   */
  deposit: (
    params: {
      readonly userAddress: Address;
      readonly vaultData: AccrualVault;
      readonly slippageTolerance?: bigint;
      readonly referralFeePct?: bigint;
      readonly referralFeeRecipient?: Address;
      readonly deadline?: bigint;
    } & BundlesFundingArgs,
  ) => ActionOutput<
    VaultV1DepositAction,
    readonly RequirementSignature[],
    BundlesTokenRequirementsOptions
  >;
  /**
   * Prepares a withdraw from a VaultV1 (MetaMorpho) contract.
   *
   * @param {Object} params - The withdraw parameters.
   * @param {bigint} params.amount - Amount of assets to withdraw.
   * @param {Address} params.userAddress - Account that must sign and submit the transaction; VaultBundlesV1 burns `msg.sender`'s shares and pays `msg.sender`.
   * @returns Lazy exact share-allowance requirements and a synchronous transaction builder.
   */
  withdraw: (params: {
    readonly amount: bigint;
    readonly userAddress: Address;
    readonly slippageTolerance?: bigint;
    readonly referralFeePct?: bigint;
    readonly referralFeeRecipient?: Address;
    readonly deadline?: bigint;
  }) => ActionOutput<
    VaultV1WithdrawAction,
    readonly RequirementSignature[],
    undefined
  >;
  /**
   * Prepares a redeem from a VaultV1 (MetaMorpho) contract.
   *
   * @param {Object} params - The redeem parameters.
   * @param {bigint} params.shares - Amount of shares to redeem.
   * @param {Address} params.userAddress - Account that must sign and submit the transaction; VaultBundlesV1 burns `msg.sender`'s shares and pays `msg.sender`.
   * @returns Lazy exact share-allowance requirements and a synchronous transaction builder.
   */
  redeem: (params: {
    readonly shares: bigint;
    readonly userAddress: Address;
    readonly referralFeePct?: bigint;
    readonly referralFeeRecipient?: Address;
    readonly deadline?: bigint;
  }) => ActionOutput<
    VaultV1RedeemAction,
    readonly RequirementSignature[],
    undefined
  >;
  /**
   * Prepares an illiquid Vault V1 exit into the vault's Morpho Blue supply positions.
   *
   * The caller controls market order and must call `getRequirements()` before `buildTx()` so the
   * RPC-backed Blue-balance and Morpho-deployment checks run. The SDK validates market coverage but
   * intentionally does not validate the user's share balance; size `amount` in asset terms against
   * `previewRedeem(sharesHeld)`. The share allowance first accrues pending performance-fee shares,
   * then uses the current rounded-up share preview; future interest can only reduce the required
   * burn.
   *
   * Snapshot state can drift before inclusion, so a later reallocation may still make the on-chain
   * loop under-cover even after pre-flight succeeds.
   *
   * @param params - In-kind redemption parameters.
   * @param params.amount - Asset-denominated amount to exit.
   * @param params.marketParamsList - Ordered vault markets consumed greedily by the contract;
   *   repeated entries cannot draw from the same vault position twice.
   * @param params.vaultData - Pre-fetched Vault V1 accrual snapshot.
   * @param params.userAddress - Account that signs and submits the exit.
   * @param params.deadline - Optional shared permit/bundle deadline; defaults to two hours from now.
   * @returns Lazy prerequisite resolution and a synchronous transaction builder.
   * @throws {ChainIdMismatchError} when the client and entity target different chains.
   * @throws {VaultAddressMismatchError} when `vaultData` belongs to another vault.
   * @throws {NonPositiveInputError} when `amount` is not positive.
   * @throws {EmptyMarketParamsListError} when the market list is empty.
   * @throws {ExpiredDeadlineError} when `deadline` is not in the future at handle creation or
   *   requirement resolution.
   * @throws {InKindRedeemCoverageError} when the ordered list cannot cover `amount` without
   *   assigning more than the vault owns in a repeated market.
   * @throws {UnsupportedChainIdError} when no address registry exists for the target chain.
   * @throws {UnknownAddressError} when VaultExitBundlesV1 is not registered on the target chain.
   * @throws {viem.BaseError} from `getRequirements()` when an RPC or multicall contract read fails.
   * @throws {VaultMorphoMismatchError} from `getRequirements()` when the vault uses another Morpho deployment.
   * @throws {VaultIsBlueFeeRecipientError} from `getRequirements()` when Morpho Blue accrues protocol fees to the vault.
   * @throws {InsufficientBlueBalanceForInKindRedeemError} from `getRequirements()` when Blue cannot fund the flash loan.
   * @throws {AmbiguousRequirementSignaturesError} from `buildTx()` when more than one permit signature is supplied.
   * @throws {UnexpectedRequirementSignatureError} from `buildTx()` when a non-permit signature is supplied.
   * @throws {VaultExitBundlesV1PermitMismatchError} from `buildTx()` when the requirement has the wrong permit kind, asset, or signature encoding.
   * @example
   * ```ts
   * import { isRequirementSignature } from "@morpho-org/morpho-sdk";
   *
   * const vault = client.morpho.vaultV1(vaultAddress, 1);
   * const vaultData = await vault.getData();
   * const exit = vault.inKindRedeem({
   *   amount: 1_000_000n,
   *   marketParamsList,
   *   vaultData,
   *   userAddress,
   * });
   * const signatures = [];
   * for (const requirement of await exit.getRequirements()) {
   *   if (isRequirementSignature(requirement)) {
   *     signatures.push(await requirement.sign(walletClient, userAddress));
   *   } else {
   *     const hash = await walletClient.sendTransaction(requirement);
   *     await client.waitForTransactionReceipt({ hash });
   *   }
   * }
   * const tx = exit.buildTx(signatures);
   * // tx satisfies Readonly<Transaction<VaultV1InKindRedeemAction>>
   * ```
   */
  readonly inKindRedeem: (params: {
    readonly amount: bigint;
    readonly marketParamsList: readonly MarketParams[];
    readonly vaultData: AccrualVault;
    readonly userAddress: Address;
    readonly deadline?: bigint;
  }) => ActionOutput<
    VaultV1InKindRedeemAction,
    readonly RequirementSignature[],
    undefined
  >;
  /**
   * Prepares a full migration from VaultV1 to VaultV2.
   *
   * Exits V1 by assets or shares and atomically deposits the resulting assets into V2 through
   * VaultBundlesV1. Only the destination deposit has an onchain share-price bound.
   *
   * @param {Object} params - The migration parameters.
   * @param {Address} params.userAddress - Account that must sign and submit the transaction; VaultBundlesV1 migrates `msg.sender`'s shares into shares owned by `msg.sender`.
   * @param {AccrualVault} params.sourceVault - Pre-fetched V1 vault data.
   * @param {AccrualVaultV2} params.targetVault - Pre-fetched V2 vault data.
   * @param {bigint} [params.shares] - Exact V1 shares to migrate; exclusive with `assets`.
   * @param {bigint} [params.assets] - Exact V1 assets to withdraw and migrate; exclusive with `shares`.
   * @param {bigint} [params.slippageTolerance=DEFAULT_SLIPPAGE_TOLERANCE] - Slippage tolerance (default 0.03%, max 10%).
   * @returns Lazy exact source-share requirements and a synchronous transaction builder.
   */
  migrateToV2: (
    params: {
      readonly userAddress: Address;
      readonly sourceVault: AccrualVault;
      readonly targetVault: AccrualVaultV2;
      readonly slippageTolerance?: bigint;
      readonly referralFeePct?: bigint;
      readonly referralFeeRecipient?: Address;
      readonly deadline?: bigint;
    } & VaultV1MigrateToV2AmountArgs,
  ) => ActionOutput<
    VaultV1MigrateToV2Action,
    readonly RequirementSignature[],
    undefined
  >;
}

export class MorphoVaultV1 implements VaultV1Actions {
  // biome-ignore lint/complexity/useMaxParams: TODO refactor to ≤2 params
  constructor(
    private readonly client: MorphoClientType,
    private readonly vault: Address,
    private readonly chainId: number,
  ) {}

  private getBundlesDeadline(deadlineOverride?: bigint): bigint {
    const now = Time.timestamp();
    const deadline = deadlineOverride ?? now + Time.s.from.h(2n);
    if (deadline <= now) throw new ExpiredDeadlineError(deadline, now);
    return deadline;
  }

  private validateBundlesUser(userAddress: Address): void {
    const accountAddress = this.client.viemClient.account?.address;
    if (accountAddress != null)
      validateUserAddress(accountAddress, userAddress);
  }

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

  deposit(
    params: {
      readonly userAddress: Address;
      readonly vaultData: AccrualVault;
      readonly slippageTolerance?: bigint;
      readonly referralFeePct?: bigint;
      readonly referralFeeRecipient?: Address;
      readonly deadline?: bigint;
    } & BundlesFundingArgs,
  ) {
    validateChainId(this.client.viemClient.chain?.id, this.chainId);
    this.validateBundlesUser(params.userAddress);
    if (!isAddressEqual(params.vaultData.address, this.vault)) {
      throw new VaultAddressMismatchError(this.vault, params.vaultData.address);
    }
    const deadline = this.getBundlesDeadline(params.deadline);
    const common = normalizeBundlesCommonParams({
      deadline,
      referralFeePct: params.referralFeePct,
      referralFeeRecipient: params.referralFeeRecipient,
    });
    const funding = resolveBundlesFunding(params);
    if (funding.value > 0n) {
      // The native path must target the chain's registered wrapped-native asset.
      validateNativeVaultAsset(this.chainId, params.vaultData.asset);
    }
    const referralFeeAssets = getBundlesReferralFeeAssets(
      funding.assets,
      common.referralFeePct,
    );
    const maxSharePrice = computeVaultMaxSharePrice({
      vaultData: params.vaultData,
      timestamp: Time.timestamp(),
      assets: funding.assets - referralFeeAssets,
      slippageTolerance: params.slippageTolerance ?? DEFAULT_SLIPPAGE_TOLERANCE,
    });
    const spender = getChainAddress(this.chainId, "bundles.vaultBundlesV1");
    return {
      getRequirements: (
        requirementOptions?: BundlesTokenRequirementsOptions,
      ) => {
        const now = Time.timestamp();
        if (deadline <= now) throw new ExpiredDeadlineError(deadline, now);
        if (funding.value > 0n) return Promise.resolve([]);
        return getBundlesTokenRequirements(this.client.viemClient, {
          token: params.vaultData.asset,
          spender,
          amount: funding.assets,
          owner: params.userAddress,
          chainId: this.chainId,
          deadline,
          supportSignature: this.client.options.supportSignature,
          supportDeployless: this.client.options.supportDeployless,
          useSimplePermit: requirementOptions?.useSimplePermit,
          permit2Nonce: requirementOptions?.permit2Nonce,
        });
      },
      buildTx: (signatures?: readonly RequirementSignature[]) => {
        const requirementSignature =
          selectBundlesTokenRequirementSignature(signatures);
        return vaultV1Deposit({
          vault: {
            chainId: this.chainId,
            address: this.vault,
            asset: params.vaultData.asset,
          },
          args: {
            ...(funding.value > 0n
              ? { nativeAmount: funding.assets }
              : { amount: funding.assets }),
            maxSharePrice,
            userAddress: params.userAddress,
            requirementSignature,
            referralFeePct: common.referralFeePct,
            referralFeeRecipient: common.referralFeeRecipient,
            deadline,
          },
          metadata: this.client.options.metadata,
        });
      },
    };
  }

  withdraw(params: {
    readonly amount: bigint;
    readonly userAddress: Address;
    readonly slippageTolerance?: bigint;
    readonly referralFeePct?: bigint;
    readonly referralFeeRecipient?: Address;
    readonly deadline?: bigint;
  }) {
    validateChainId(this.client.viemClient.chain?.id, this.chainId);
    this.validateBundlesUser(params.userAddress);
    if (params.amount <= 0n)
      throw new NonPositiveInputError("amount", params.amount);
    const deadline = this.getBundlesDeadline(params.deadline);
    const common = normalizeBundlesCommonParams({
      deadline,
      referralFeePct: params.referralFeePct,
      referralFeeRecipient: params.referralFeeRecipient,
    });
    const slippageTolerance =
      params.slippageTolerance ?? DEFAULT_SLIPPAGE_TOLERANCE;
    validateSlippageTolerance(slippageTolerance);
    getChainAddress(this.chainId, "bundles.vaultBundlesV1");
    return {
      getRequirements: async () => {
        const vaultData = await this.getData();
        const accruedVault = vaultData.accrueInterest(deadline);
        const requiredShareAllowance = MathLib.wMulUp(
          MathLib.max(
            vaultData.toShares(params.amount, "Up"),
            accruedVault.toShares(params.amount, "Up"),
          ),
          MathLib.WAD + slippageTolerance,
        );
        return getVaultBundlesSharesRequirements(this.client.viemClient, {
          vaultData,
          version: "vaultV1",
          owner: params.userAddress,
          chainId: this.chainId,
          requiredShareAllowance,
          deadline,
          supportSignature: this.client.options.supportSignature,
        });
      },
      buildTx: (signatures?: readonly RequirementSignature[]) => {
        const { permit } = selectRequirementSignatures(signatures, {
          permit: true,
        });
        return vaultV1Withdraw({
          vault: { chainId: this.chainId, address: this.vault },
          args: {
            amount: params.amount,
            userAddress: params.userAddress,
            requirementSignature: permit,
            referralFeePct: common.referralFeePct,
            referralFeeRecipient: common.referralFeeRecipient,
            deadline,
          },
          metadata: this.client.options.metadata,
        });
      },
    };
  }

  redeem(params: {
    readonly shares: bigint;
    readonly userAddress: Address;
    readonly referralFeePct?: bigint;
    readonly referralFeeRecipient?: Address;
    readonly deadline?: bigint;
  }) {
    validateChainId(this.client.viemClient.chain?.id, this.chainId);
    this.validateBundlesUser(params.userAddress);
    if (params.shares <= 0n)
      throw new NonPositiveInputError("shares", params.shares);
    const deadline = this.getBundlesDeadline(params.deadline);
    const common = normalizeBundlesCommonParams({
      deadline,
      referralFeePct: params.referralFeePct,
      referralFeeRecipient: params.referralFeeRecipient,
    });
    getChainAddress(this.chainId, "bundles.vaultBundlesV1");
    return {
      getRequirements: async () =>
        getVaultBundlesSharesRequirements(this.client.viemClient, {
          vaultData: await this.getData(),
          version: "vaultV1",
          owner: params.userAddress,
          chainId: this.chainId,
          requiredShareAllowance: params.shares,
          deadline,
          supportSignature: this.client.options.supportSignature,
        }),
      buildTx: (signatures?: readonly RequirementSignature[]) => {
        const { permit } = selectRequirementSignatures(signatures, {
          permit: true,
        });
        return vaultV1Redeem({
          vault: { chainId: this.chainId, address: this.vault },
          args: {
            shares: params.shares,
            userAddress: params.userAddress,
            requirementSignature: permit,
            referralFeePct: common.referralFeePct,
            referralFeeRecipient: common.referralFeeRecipient,
            deadline,
          },
          metadata: this.client.options.metadata,
        });
      },
    };
  }

  /** {@inheritDoc VaultV1Actions.inKindRedeem} */
  inKindRedeem({
    amount,
    marketParamsList,
    vaultData,
    userAddress,
    deadline: deadlineOverride,
  }: {
    readonly amount: bigint;
    readonly marketParamsList: readonly MarketParams[];
    readonly vaultData: AccrualVault;
    readonly userAddress: Address;
    readonly deadline?: bigint;
  }): ActionOutput<
    VaultV1InKindRedeemAction,
    readonly RequirementSignature[],
    undefined
  > {
    validateChainId(this.client.viemClient.chain?.id, this.chainId);
    if (!isAddressEqual(vaultData.address, this.vault)) {
      throw new VaultAddressMismatchError(this.vault, vaultData.address);
    }
    if (amount <= 0n) throw new NonPositiveInputError("amount", amount);
    if (marketParamsList.length === 0) throw new EmptyMarketParamsListError();
    const marketParamsListSnapshot = marketParamsList.map(
      ({ loanToken, collateralToken, oracle, irm, lltv }) => ({
        loanToken,
        collateralToken,
        oracle,
        irm,
        lltv,
      }),
    );

    const now = Time.timestamp();
    const deadline = deadlineOverride ?? now + Time.s.from.h(2n);
    if (deadline <= now) throw new ExpiredDeadlineError(deadline, now);

    const vaultExitBundlesV1 = getChainAddress(
      this.chainId,
      "bundles.vaultExitBundlesV1",
    );
    const addresses = getChainAddresses(this.chainId);
    const blue = addresses.blue ?? addresses.morpho;
    let covered = 0n;
    const assignedByMarket = new Map<string, bigint>();
    for (const marketParams of marketParamsListSnapshot) {
      if (covered === amount) break;
      const marketId = MarketUtils.getMarketId(marketParams);
      const allocation = vaultData.allocations.get(marketId);
      if (allocation?.config.enabled !== true) continue;

      const market = allocation.position.market.accrueInterest(now);
      const available = market.toSupplyAssets(allocation.position.supplyShares);
      const assigned = assignedByMarket.get(marketId) ?? 0n;
      const chunk = MathLib.min(available, amount - covered);
      if (assigned + chunk > available) {
        throw new InKindRedeemCoverageError({
          required: amount,
          covered,
          maxExitAssets: covered,
        });
      }
      assignedByMarket.set(marketId, assigned + chunk);
      covered += chunk;
    }
    if (covered < amount) {
      throw new InKindRedeemCoverageError({
        required: amount,
        covered,
        maxExitAssets: covered,
      });
    }

    // Account for pending performance-fee shares before previewing the burn. Once accrued, future
    // V1 interest cannot lower the share price, so this upper-bounds execution.
    const requiredShareAllowance = vaultData
      .accrueInterest(now)
      .toShares(amount);

    return {
      getRequirements: async (): Promise<readonly ActionRequirement[]> => {
        const requirementsTimestamp = Time.timestamp();
        if (deadline <= requirementsTimestamp) {
          throw new ExpiredDeadlineError(deadline, requirementsTimestamp);
        }
        const [allowance, nonce, blueBalance, morpho, blueFeeRecipient] =
          await multicall(this.client.viemClient, {
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
              {
                address: blue,
                abi: blueAbi,
                functionName: "feeRecipient",
              },
            ],
          });

        if (!isAddressEqual(morpho, blue)) {
          throw new VaultMorphoMismatchError({
            vault: this.vault,
            expected: blue,
            actual: morpho,
          });
        }
        // Reject this unsupported configuration before authorizing vault shares:
        // VaultExitBundlesV1 omits newly accrued Morpho fee shares when estimating the
        // vault position, so its callback can exhaust marketParamsList and panic on-chain.
        if (isAddressEqual(blueFeeRecipient, this.vault)) {
          throw new VaultIsBlueFeeRecipientError(this.vault, blue);
        }
        if (blueBalance < amount) {
          throw new InsufficientBlueBalanceForInKindRedeemError({
            asset: vaultData.asset,
            available: blueBalance,
            required: amount,
          });
        }
        if (allowance >= requiredShareAllowance) return [];
        if (this.client.options.supportSignature) {
          return [
            encodeVaultSharesPermit({
              vault: vaultData,
              version: "vaultV1",
              spender: vaultExitBundlesV1,
              owner: userAddress,
              chainId: this.chainId,
              nonce,
              amount: requiredShareAllowance,
              deadline,
            }),
          ];
        }
        return [
          encodeErc20Approval({
            token: this.vault,
            spender: vaultExitBundlesV1,
            amount: requiredShareAllowance,
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
            marketParamsList: marketParamsListSnapshot,
            userAddress,
            deadline,
            requirementSignature: permit,
          },
          metadata: this.client.options.metadata,
        });
      },
    };
  }

  migrateToV2(
    params: {
      readonly userAddress: Address;
      readonly sourceVault: AccrualVault;
      readonly targetVault: AccrualVaultV2;
      readonly slippageTolerance?: bigint;
      readonly referralFeePct?: bigint;
      readonly referralFeeRecipient?: Address;
      readonly deadline?: bigint;
    } & VaultV1MigrateToV2AmountArgs,
  ) {
    validateChainId(this.client.viemClient.chain?.id, this.chainId);
    this.validateBundlesUser(params.userAddress);
    if (!isAddressEqual(params.sourceVault.address, this.vault)) {
      throw new VaultAddressMismatchError(
        this.vault,
        params.sourceVault.address,
      );
    }
    if (!isAddressEqual(params.sourceVault.asset, params.targetVault.asset)) {
      throw new VaultAssetMismatchError(
        params.sourceVault.asset,
        params.targetVault.asset,
      );
    }
    if (isAddressEqual(this.vault, params.targetVault.address)) {
      throw new SameVaultMigrationError(this.vault);
    }
    const assets = "assets" in params ? params.assets : undefined;
    const shares = "shares" in params ? params.shares : undefined;
    if ((assets == null) === (shares == null)) {
      throw new AmountAndSharesExclusiveError();
    }
    const selectedAmount = assets ?? shares ?? 0n;
    if (selectedAmount <= 0n) {
      throw new NonPositiveInputError(
        assets != null ? "assets" : "shares",
        selectedAmount,
      );
    }
    const slippageTolerance =
      params.slippageTolerance ?? DEFAULT_SLIPPAGE_TOLERANCE;
    validateSlippageTolerance(slippageTolerance);
    const deadline = this.getBundlesDeadline(params.deadline);
    const common = normalizeBundlesCommonParams({
      deadline,
      referralFeePct: params.referralFeePct,
      referralFeeRecipient: params.referralFeeRecipient,
    });
    const grossAssets =
      assets ?? params.sourceVault.toAssets(shares ?? 0n, "Down");
    const referralFeeAssets = getBundlesReferralFeeAssets(
      grossAssets,
      common.referralFeePct,
    );
    const maxSharePriceVaultV2 = computeVaultMaxSharePrice({
      vaultData: params.targetVault,
      timestamp: Time.timestamp(),
      assets: grossAssets - referralFeeAssets,
      slippageTolerance,
    });
    const accruedSourceVault = params.sourceVault.accrueInterest(deadline);
    const requiredShareAllowance =
      shares ??
      MathLib.wMulUp(
        MathLib.max(
          params.sourceVault.toShares(assets ?? 0n, "Up"),
          accruedSourceVault.toShares(assets ?? 0n, "Up"),
        ),
        MathLib.WAD + slippageTolerance,
      );
    getChainAddress(this.chainId, "bundles.vaultBundlesV1");
    return {
      getRequirements: () =>
        getVaultBundlesSharesRequirements(this.client.viemClient, {
          vaultData: params.sourceVault,
          version: "vaultV1",
          owner: params.userAddress,
          chainId: this.chainId,
          requiredShareAllowance,
          deadline,
          supportSignature: this.client.options.supportSignature,
        }),
      buildTx: (signatures?: readonly RequirementSignature[]) => {
        const { permit } = selectRequirementSignatures(signatures, {
          permit: true,
        });
        return vaultV1MigrateToV2({
          vault: {
            chainId: this.chainId,
            address: this.vault,
            asset: params.sourceVault.asset,
          },
          args: {
            targetVault: params.targetVault.address,
            targetAsset: params.targetVault.asset,
            ...(assets != null ? { assets } : { shares: shares ?? 0n }),
            maxSharePriceVaultV2,
            userAddress: params.userAddress,
            requirementSignature: permit,
            referralFeePct: common.referralFeePct,
            referralFeeRecipient: common.referralFeeRecipient,
            deadline,
          },
          metadata: this.client.options.metadata,
        });
      },
    };
  }
}
