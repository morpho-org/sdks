import {
  type AccrualVaultV2,
  AccrualVaultV2MorphoMarketV1AdapterV2,
  DEFAULT_SLIPPAGE_TOLERANCE,
  getChainAddresses,
  type MarketParams,
  MarketUtils,
  MathLib,
} from "@morpho-org/blue-sdk";
import { erc2612Abi, fetchAccrualVaultV2 } from "@morpho-org/blue-sdk-viem";
import { getChainAddress, Time } from "@morpho-org/morpho-ts";
import { type Address, erc20Abi, isAddressEqual } from "viem";
import { multicall } from "viem/actions";
import {
  encodeErc20Approval,
  encodeVaultSharesPermit,
  getGeneralAdapterRequirements,
  vaultV2Deposit,
  vaultV2ForceRedeem,
  vaultV2ForceWithdraw,
  vaultV2InKindRedeem,
  vaultV2Redeem,
  vaultV2Withdraw,
} from "../../actions/index.js";
import { validateSlippageTolerance } from "../../helpers/index.js";
import type { FetchParameters } from "../../types/data.js";
import {
  type ActionOutput,
  type ActionRequirement,
  AdapterNotPartOfVaultError,
  ChainIdMismatchError,
  ChainWNativeMissingError,
  type Deallocation,
  type DepositAmountArgs,
  EmptyMarketParamsListError,
  type ERC20ApprovalAction,
  ExpiredDeadlineError,
  InKindRedeemCoverageError,
  InKindRedeemRequiresSingleAdapterError,
  InKindRedeemZeroDeallocationError,
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
  UnsupportedInKindAdapterError,
  VaultAddressMismatchError,
  type VaultV2DepositAction,
  type VaultV2ForceRedeemAction,
  type VaultV2ForceWithdrawAction,
  type VaultV2InKindRedeemAction,
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
   * Uses pre-fetched vault data for accurate calculations of slippage and asset address,
   * then returns the prepared deposit transaction and a function for retrieving all required approval transactions.
   * Bundler Integration: This flow uses the bundler to atomically execute the user's asset transfer and vault deposit in a single transaction for slippage protection.
   *
   * @param {Object} params - The deposit parameters.
   * @param {bigint} [params.amount=0n] - Amount of ERC-20 assets to deposit. At least one of amount or nativeAmount must be provided.
   * @param {Address} params.userAddress - User address initiating the deposit.
   * @param {AccrualVaultV2} params.vaultData - Pre-fetched vault data with asset address and share conversion.
   * @param {bigint} [params.slippageTolerance=DEFAULT_SLIPPAGE_TOLERANCE] - Optional slippage tolerance value. Default is 0.03%. Slippage tolerance must be less than 10%.
   * @param {bigint} [params.nativeAmount] - Amount of native token to wrap into wNative. Vault asset must be wNative.
   * @returns {Object} The result object.
   * @returns {Readonly<Transaction<VaultV2DepositAction>>} returns.tx The prepared deposit transaction.
   * @returns {Promise<(Readonly<Transaction<ERC20ApprovalAction>> | Requirement<PermitRequirementSignature>)[]>} returns.getRequirements The function for retrieving all required approval transactions.
   */
  deposit: (
    params: {
      userAddress: Address;
      vaultData: AccrualVaultV2;
      slippageTolerance?: bigint;
    } & DepositAmountArgs,
  ) => {
    buildTx: (
      signatures?: readonly RequirementSignature[],
    ) => Readonly<Transaction<VaultV2DepositAction>>;
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
   * Prepares an illiquid Vault V2 exit into idle assets and Morpho Blue supply positions.
   *
   * The vault must have exactly one `MorphoMarketV1AdapterV2`. `amount` is penalty-inclusive and
   * the caller controls market order. Call `getRequirements()` before `buildTx()` so Blue balance,
   * allowance, and nonce are checked on-chain. Vault gates are enforced by the final transaction
   * and are not preflighted: receive gates may depend on VaultExitBundlesV1's transient initiator,
   * while arbitrary send-share gates may depend on intermediate state changed by the exit's
   * multiple share burns. The SDK intentionally does not validate the user's share balance; size
   * it so `amount + BigInt(marketParamsList.length) <= vault.previewRedeem(sharesHeld)`. The
   * per-market term covers V2 withdrawal rounding and is not needed for V1. The share allowance
   * includes that buffer, the penalty burns, and accrual through the bundle deadline.
   *
   * Idle balance, penalty, and adapter positions can drift after the snapshot, so an on-chain
   * under-coverage panic remains possible if vault state changes between preparation and inclusion.
   *
   * @param params - In-kind redemption parameters.
   * @param params.amount - Penalty-inclusive, asset-denominated amount to exit.
   * @param params.marketParamsList - Ordered adapter markets consumed greedily after idle assets;
   *   its length is also the V2 share-sufficiency rounding buffer.
   * @param params.vaultData - Pre-fetched Vault V2 accrual snapshot.
   * @param params.userAddress - Account that signs and submits the exit.
   * @param params.adapter - Optional adapter override; defaults to the vault's sole adapter.
   * @param params.deadline - Optional shared permit/bundle deadline; defaults to two hours from now.
   * @returns Lazy prerequisite resolution and a synchronous transaction builder.
   * @throws {ChainIdMismatchError} when the client and entity target different chains.
   * @throws {VaultAddressMismatchError} when `vaultData` belongs to another vault.
   * @throws {NonPositiveInputError} when `amount` is not positive.
   * @throws {InKindRedeemZeroDeallocationError} when the vault has no idle assets and the
   *   penalty-adjusted amount rounds to zero deallocated assets.
   * @throws {EmptyMarketParamsListError} when assets must be deallocated and the market list is empty.
   * @throws {ExpiredDeadlineError} when `deadline` is not in the future at handle creation or
   *   requirement resolution.
   * @throws {InKindRedeemRequiresSingleAdapterError} when the vault does not have one adapter.
   * @throws {AdapterNotPartOfVaultError} when `adapter` is not the vault's adapter.
   * @throws {UnsupportedInKindAdapterError} when the adapter is not a MorphoMarketV1AdapterV2.
   * @throws {InKindRedeemCoverageError} when the deduplicated list cannot cover the exit.
   * @throws {UnsupportedChainIdError} when no address registry exists for the target chain.
   * @throws {UnknownAddressError} when VaultExitBundlesV1 is not registered on the target chain.
   * @throws {viem.BaseError} from `getRequirements()` when an RPC or multicall contract read fails.
   * @throws {InsufficientBlueBalanceForInKindRedeemError} from `getRequirements()` when Blue cannot fund the largest callback.
   * @throws {AmbiguousRequirementSignaturesError} from `buildTx()` when more than one permit signature is supplied.
   * @throws {UnexpectedRequirementSignatureError} from `buildTx()` when a non-permit signature is supplied.
   * @throws {VaultExitBundlesV1PermitMismatchError} from `buildTx()` when the requirement has the wrong permit kind, asset, or signature encoding.
   * @example
   * ```ts
   * import { isRequirementSignature } from "@morpho-org/morpho-sdk";
   *
   * const vault = client.morpho.vaultV2(vaultAddress, 1);
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
   * // tx satisfies Readonly<Transaction<VaultV2InKindRedeemAction>>
   * ```
   */
  readonly inKindRedeem: (params: {
    readonly amount: bigint;
    readonly marketParamsList: readonly MarketParams[];
    readonly vaultData: AccrualVaultV2;
    readonly userAddress: Address;
    readonly adapter?: Address;
    readonly deadline?: bigint;
  }) => ActionOutput<
    VaultV2InKindRedeemAction,
    readonly RequirementSignature[],
    undefined
  >;
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

    return fetchAccrualVaultV2(this.vault, this.client.viemClient, {
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
    vaultData: AccrualVaultV2;
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

    // Accrue interest forward to bound the on-chain share price at execution.
    // Mirrors blue repay's 2h forward-accrual buffer.
    const accrualTimestamp =
      MathLib.max(Time.timestamp(), vaultData.lastUpdate) + Time.s.from.h(2n);
    const { vault: accruedVault } = vaultData.accrueInterest(accrualTimestamp);

    const shares = accruedVault.toShares(totalAssets);
    if (shares <= 0n) {
      throw new NonPositiveInputError("shares", shares);
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

        return vaultV2Deposit({
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

  /** {@inheritDoc VaultV2Actions.inKindRedeem} */
  inKindRedeem({
    amount,
    marketParamsList,
    vaultData,
    userAddress,
    adapter: adapterOverride,
    deadline: deadlineOverride,
  }: {
    readonly amount: bigint;
    readonly marketParamsList: readonly MarketParams[];
    readonly vaultData: AccrualVaultV2;
    readonly userAddress: Address;
    readonly adapter?: Address;
    readonly deadline?: bigint;
  }): ActionOutput<
    VaultV2InKindRedeemAction,
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
    const marketParamsListSnapshot = marketParamsList.map(
      ({ loanToken, collateralToken, oracle, irm, lltv }) => ({
        loanToken,
        collateralToken,
        oracle,
        irm,
        lltv,
      }),
    );
    const marketIdListSnapshot = marketParamsListSnapshot.map((marketParams) =>
      MarketUtils.getMarketId(marketParams),
    );

    const now = Time.timestamp();
    const deadline = deadlineOverride ?? now + Time.s.from.h(2n);
    if (deadline <= now) throw new ExpiredDeadlineError(deadline, now);
    if (vaultData.accrualAdapters.length !== 1) {
      throw new InKindRedeemRequiresSingleAdapterError(
        this.vault,
        vaultData.accrualAdapters.length,
      );
    }

    const soleAdapter = vaultData.accrualAdapters[0];
    if (soleAdapter == null) {
      throw new InKindRedeemRequiresSingleAdapterError(this.vault, 0);
    }
    const adapter = adapterOverride ?? soleAdapter.address;
    if (!isAddressEqual(adapter, soleAdapter.address)) {
      throw new AdapterNotPartOfVaultError(this.vault, adapter);
    }
    if (!(soleAdapter instanceof AccrualVaultV2MorphoMarketV1AdapterV2)) {
      throw new UnsupportedInKindAdapterError(adapter);
    }

    const penalty =
      vaultData.forceDeallocatePenalties[soleAdapter.address] ?? 0n;
    const idleAssets = MathLib.min(vaultData.assetBalance, amount);
    const assetsToDeallocate = MathLib.wDivDown(
      amount - idleAssets,
      MathLib.WAD + penalty,
    );
    if (idleAssets === 0n && assetsToDeallocate === 0n) {
      throw new InKindRedeemZeroDeallocationError({
        vault: this.vault,
        amount,
        penalty,
      });
    }
    if (assetsToDeallocate > 0n && marketParamsListSnapshot.length === 0) {
      throw new EmptyMarketParamsListError();
    }

    const assetsByMarket = new Map(
      soleAdapter.markets.map((market) => [
        market.id,
        // Clamp forward past the market's `lastUpdate`: `accrueInterest` throws
        // `InvalidInterestAccrual` when the caller's clock lags a block that just accrued the
        // market (mirrors `previewVaultV2InKindRedeem`).
        market
          .accrueInterest(MathLib.max(now, market.lastUpdate))
          .toSupplyAssets(soleAdapter.supplyShares[market.id] ?? 0n),
      ]),
    );
    const uniqueMarketIds = new Set(marketIdListSnapshot);
    let covered = 0n;
    for (const id of uniqueMarketIds) covered += assetsByMarket.get(id) ?? 0n;
    if (covered < assetsToDeallocate) {
      const maxExitAssets =
        covered === 0n
          ? idleAssets
          : idleAssets +
            MathLib.wMulUp(covered + 1n, MathLib.WAD + penalty) -
            1n;
      throw new InKindRedeemCoverageError({
        required: assetsToDeallocate,
        covered,
        maxExitAssets,
      });
    }

    let remaining = assetsToDeallocate;
    let peak = 0n;
    const consumedMarketIds = new Set<string>();
    // Clamp the whole-vault fee accrual forward past the markets' `lastUpdate` too: like the
    // per-market accrual above, `AccrualVaultV2.accrueInterest` sums `Market.accrueInterest` and
    // throws `InvalidInterestAccrual` when the caller's clock (and thus `deadline`) lags a block
    // that just accrued a market. Accruing further forward only adds management fees, so the
    // allowance stays an upper bound of the on-chain burn.
    const { vault: allowanceVault } = vaultData.accrueInterest(
      MathLib.max(deadline, ...soleAdapter.markets.map((m) => m.lastUpdate)),
    );
    // Interest can lower the burn, while management fees can raise it; bound both endpoints.
    const previewAllowance = (assets: bigint) =>
      MathLib.max(
        vaultData.toShares(assets, "Up"),
        allowanceVault.toShares(assets, "Up"),
      );

    let requiredShareAllowance = previewAllowance(
      BigInt(marketParamsListSnapshot.length),
    );
    // Pre-burn previews upper-bound each separately rounded idle, penalty, and main burn.
    requiredShareAllowance += previewAllowance(idleAssets);
    for (const id of marketIdListSnapshot) {
      const available = consumedMarketIds.has(id)
        ? 0n
        : (assetsByMarket.get(id) ?? 0n);
      consumedMarketIds.add(id);
      const chunk = MathLib.min(available, remaining);
      peak = MathLib.max(peak, chunk);
      requiredShareAllowance += previewAllowance(
        MathLib.wMulUp(chunk, penalty),
      );
      requiredShareAllowance += previewAllowance(chunk);
      remaining -= chunk;
    }

    const vaultExitBundlesV1 = getChainAddress(
      this.chainId,
      "bundles.vaultExitBundlesV1",
    );
    const addresses = getChainAddresses(this.chainId);
    const blue = addresses.blue ?? addresses.morpho;

    return {
      getRequirements: async (): Promise<readonly ActionRequirement[]> => {
        const requirementsTimestamp = Time.timestamp();
        if (deadline <= requirementsTimestamp) {
          throw new ExpiredDeadlineError(deadline, requirementsTimestamp);
        }
        // Vault gates are intentionally left to the final transaction. A receive gate may inspect
        // VaultExitBundlesV1's transient `initiator`, which is populated only during the actual
        // periphery call. A send-share gate is arbitrary external code and is evaluated repeatedly
        // after intermediate penalty share burns, so one standalone read is not execution-equivalent
        // either. Simulate the finalized transaction after authorization when gate compatibility
        // must be checked before submission.
        const [allowance, nonce, blueBalance] = await multicall(
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
            ],
          },
        );

        if (blueBalance < peak) {
          throw new InsufficientBlueBalanceForInKindRedeemError({
            asset: vaultData.asset,
            available: blueBalance,
            required: peak,
          });
        }
        if (allowance >= requiredShareAllowance) return [];
        if (this.client.options.supportSignature) {
          return [
            encodeVaultSharesPermit({
              vault: vaultData,
              version: "vaultV2",
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
        return vaultV2InKindRedeem({
          vault: { chainId: this.chainId, address: this.vault },
          args: {
            adapter,
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
