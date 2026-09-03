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
  selectBundlesSharesRequirementSignature,
  selectBundlesTokenRequirementSignature,
} from "../../actions/bundles/index.js";
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
  computeVaultMaxShareAllowance,
  computeVaultMaxSharePrice,
  validateChainId,
  validateSlippageTolerance,
} from "../../helpers/index.js";
import { validateNativeVaultAsset } from "../../helpers/validate.js";
import type { FetchParameters } from "../../types/data.js";
import {
  type ActionOutput,
  type ActionRequirement,
  type BundlesFundingArgs,
  type BundlesTokenRequirementsOptions,
  ChainIdMismatchError,
  EmptyMarketParamsListError,
  type ERC20ApprovalAction,
  ExpiredDeadlineError,
  InKindRedeemCoverageError,
  InsufficientBlueBalanceForInKindRedeemError,
  isRequirementSignature,
  type MorphoClientType,
  NonPositiveInputError,
  type Permit2SignatureTransferAction,
  type PermitAction,
  type PermitRequirementSignature,
  type Requirement,
  type RequirementSignature,
  selectRequirementSignatures,
  type Transaction,
  VaultAddressMismatchError,
  VaultAssetMismatchError,
  VaultIsBlueFeeRecipientError,
  VaultMorphoMismatchError,
  type VaultV1DepositAction,
  type VaultV1InKindRedeemAction,
  type VaultV1MigrateToV2Action,
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
   * @param {bigint} [params.referralFeePct=0n] - WAD-scaled referral fee deducted from the gross deposit.
   * @param {Address} [params.referralFeeRecipient] - Non-zero recipient required when `referralFeePct` is positive.
   * @param {bigint} [params.deadline] - VaultBundlesV1 execution deadline; defaults to two hours from now.
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
   * @param {bigint} [params.slippageTolerance=DEFAULT_SLIPPAGE_TOLERANCE] - Headroom applied to the computed share-burn allowance cap (default 0.03%, max 10%).
   * @param {bigint} [params.referralFeePct=0n] - WAD-scaled referral fee deducted from the withdrawn assets.
   * @param {Address} [params.referralFeeRecipient] - Non-zero recipient required when `referralFeePct` is positive.
   * @param {bigint} [params.deadline] - VaultBundlesV1 execution deadline; defaults to two hours from now.
   * @returns Lazy exact share-allowance requirements and a synchronous transaction builder.
   * @throws {ExpiredDeadlineError} when `deadline` is not in the future at handle creation or
   *   at any `getRequirements()` call, including calls served from the cached requirement set.
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

  private getBundlesDeadline(deadlineOverride?: bigint): bigint {
    const now = Time.timestamp();
    const deadline = deadlineOverride ?? now + Time.s.from.h(2n);
    if (deadline <= now) throw new ExpiredDeadlineError(deadline, now);
    return deadline;
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
      deadline,
      assets: funding.assets - referralFeeAssets,
      slippageTolerance: params.slippageTolerance ?? DEFAULT_SLIPPAGE_TOLERANCE,
    });
    const spender = getChainAddress(this.chainId, "bundles.vaultBundlesV1");
    let resolvedRequirements: readonly ActionRequirement[] | undefined;
    let expectedRequirement:
      | PermitAction
      | Permit2SignatureTransferAction
      | undefined;
    return Object.freeze({
      getRequirements: async (
        requirementOptions?: BundlesTokenRequirementsOptions,
      ) => {
        const now = Time.timestamp();
        if (deadline <= now) throw new ExpiredDeadlineError(deadline, now);
        if (resolvedRequirements != null) return resolvedRequirements;
        const requirements =
          funding.value > 0n
            ? []
            : await getBundlesTokenRequirements(this.client.viemClient, {
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
        const signatureRequirement = requirements.find(isRequirementSignature);
        if (
          signatureRequirement?.action.type === "permit" ||
          signatureRequirement?.action.type === "permit2SignatureTransfer"
        ) {
          expectedRequirement = signatureRequirement.action;
        }
        resolvedRequirements = requirements;
        return resolvedRequirements;
      },
      buildTx: (signatures?: readonly RequirementSignature[]) => {
        const requirementSignature = selectBundlesTokenRequirementSignature(
          signatures,
          expectedRequirement,
        );
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
    });
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
    let requiredShareAllowance: bigint | undefined;
    let resolvedRequirements: readonly ActionRequirement[] | undefined;
    let expectedRequirement: PermitAction | undefined;
    return Object.freeze({
      getRequirements: async () => {
        const now = Time.timestamp();
        if (deadline <= now) throw new ExpiredDeadlineError(deadline, now);
        if (resolvedRequirements != null) return resolvedRequirements;
        const vaultData = await this.getData();
        requiredShareAllowance ??= computeVaultMaxShareAllowance({
          vaultData,
          deadline,
          assets: params.amount,
          slippageTolerance,
        });
        const requirements = await getVaultBundlesSharesRequirements(
          this.client.viemClient,
          {
            vaultData,
            version: "vaultV1",
            owner: params.userAddress,
            chainId: this.chainId,
            requiredShareAllowance,
            deadline,
            supportSignature: this.client.options.supportSignature,
          },
        );
        const signatureRequirement = requirements.find(isRequirementSignature);
        if (signatureRequirement?.action.type === "permit") {
          expectedRequirement = signatureRequirement.action;
        }
        resolvedRequirements = requirements;
        return resolvedRequirements;
      },
      buildTx: (signatures?: readonly RequirementSignature[]) => {
        const permit = selectBundlesSharesRequirementSignature(signatures, {
          requiredShareAllowance,
          expectedRequirement,
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
    });
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

    const requiredShareAllowance = computeVaultMaxShareAllowance({
      vaultData,
      deadline: now,
      assets: amount,
      slippageTolerance: DEFAULT_SLIPPAGE_TOLERANCE,
    });

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
