import {
  type InputMarketParams,
  type MarketId,
  MarketParams,
} from "@morpho-org/blue-sdk";
import { fetchMarket } from "@morpho-org/blue-sdk-viem";
import {
  type BlueAuthorizationAction,
  ChainIdMismatchError,
  type ERC20ApprovalAction,
  type Metadata,
  type MorphoClientType,
  morphoViemExtension,
  type Requirement,
  type RequirementSignature,
  type Transaction,
  type VaultReallocation,
  type VaultV2BlueReallocation,
} from "@morpho-org/morpho-sdk";
import type {
  BorrowResult,
  RepayResult,
  SupplyResult,
  WithdrawOptions,
  WithdrawResult,
} from "@tetherto/wdk-wallet/protocols";
import { LendingProtocol } from "@tetherto/wdk-wallet/protocols";
import type { WalletAccountReadOnlyEvm } from "@tetherto/wdk-wallet-evm";
import { WalletAccountEvm } from "@tetherto/wdk-wallet-evm";
import type {
  EvmErc4337WalletNativeCoinsConfig,
  EvmErc4337WalletPaymasterTokenConfig,
  EvmErc4337WalletSponsorshipPolicyConfig,
} from "@tetherto/wdk-wallet-evm-erc-4337";
import {
  WalletAccountEvmErc4337,
  WalletAccountReadOnlyEvmErc4337,
} from "@tetherto/wdk-wallet-evm-erc-4337";
import {
  type Address,
  type Chain,
  type Client,
  createClient,
  custom,
  erc4626Abi,
  fallback,
  http,
  isAddress,
  isAddressEqual,
  type PublicActions,
  publicActions,
  type Transport,
  zeroAddress,
} from "viem";
import { arbitrum, base, mainnet, optimism, polygon } from "viem/chains";
import {
  type MarketPresetKey,
  MORPHO_MARKET_PRESETS,
  MORPHO_VAULT_PRESETS,
  type VaultPresetKey,
} from "./morpho-presets.js";

export type MorphoEvmAccount =
  | WalletAccountReadOnlyEvm
  | WalletAccountReadOnlyEvmErc4337
  | WalletAccountEvm
  | WalletAccountEvmErc4337;

/**
 * Minimal EIP-1193 provider shape the adapter needs to construct a viem
 * `custom()` transport. Mirrors the surface `ethers.Eip1193Provider`
 * exposes; redeclared locally so we don't pull `ethers` into this
 * package's typing surface.
 */
export interface Eip1193Provider {
  request(args: {
    method: string;
    params?: readonly unknown[] | object;
  }): Promise<unknown>;
}

type WdkProviderSource =
  | string
  | Eip1193Provider
  | readonly (string | Eip1193Provider)[];

type ViemPublicClient = Client<Transport, Chain> &
  PublicActions<Transport, Chain>;

export type Erc4337TransactionConfig = Partial<
  | EvmErc4337WalletPaymasterTokenConfig
  | EvmErc4337WalletSponsorshipPolicyConfig
  | EvmErc4337WalletNativeCoinsConfig
>;

export type RequirementApproval = Transaction<ERC20ApprovalAction>;
export type RequirementAuthorization = Transaction<BlueAuthorizationAction>;
export type RequirementSignatureRequest = Requirement;
export type ApprovalOrSignatureRequirement =
  | RequirementApproval
  | RequirementSignatureRequest;

export interface RequirementOptions {
  /** Prefer the Morpho SDK simple permit flow when generating approval requirements. */
  useSimplePermit?: boolean;
}

export interface MorphoErc20SupplyOptions {
  /** The ERC-20 token address to supply. */
  token: string;
  /** The ERC-20 amount to supply, in base units. */
  amount: number | bigint;
  /** Optional native token amount to wrap and supply, in base units. */
  nativeAmount?: number | bigint;
  /** The address on behalf of which the supply operation should be performed. Must match the wallet account address when set. */
  onBehalfOf?: string;
  /** Signature returned by a Morpho SDK approval requirement. */
  requirementSignature?: RequirementSignature;
  /** Optional Morpho SDK slippage tolerance in WAD precision. */
  slippageTolerance?: bigint;
}

export interface MorphoNativeSupplyOptions {
  /** The wrapped-native token address expected by the configured vault or market. */
  token: string;
  /** Optional ERC-20 amount to supply, in base units. */
  amount?: number | bigint;
  /** The native token amount to wrap and supply, in base units. */
  nativeAmount: number | bigint;
  /** The address on behalf of which the supply operation should be performed. Must match the wallet account address when set. */
  onBehalfOf?: string;
  /** Signature returned by a Morpho SDK approval requirement. */
  requirementSignature?: RequirementSignature;
  /** Optional Morpho SDK slippage tolerance in WAD precision. */
  slippageTolerance?: bigint;
}

export type MorphoSupplyOptions =
  | MorphoErc20SupplyOptions
  | MorphoNativeSupplyOptions;

export interface MorphoBorrowOptions {
  /** The address of the token to borrow. */
  token: string;
  /** The amount of tokens to borrow, in base units. */
  amount: number | bigint;
  /** The address on behalf of which the borrow operation should be performed. Must match the wallet account address when set. */
  onBehalfOf?: string;
  /**
   * Optional Vault V1 PublicAllocator reallocations to include in the borrow action.
   *
   * @deprecated Use {@link MorphoBorrowWithVaultV2ReallocationsOptions} for Vault V2
   * BluePublicAllocator reallocations. Vault V1 reallocations will no longer be accepted by
   * high-level Blue writes in the next major.
   */
  reallocations?: readonly VaultReallocation[];
  /** Signature returned by a Morpho SDK authorization requirement, folded into the bundle as `setAuthorizationWithSig`. */
  requirementSignature?: RequirementSignature;
  /** Optional Morpho SDK slippage tolerance in WAD precision. */
  slippageTolerance?: bigint;
}

/**
 * Borrow options that opt into Vault V2 BluePublicAllocator reallocations.
 *
 * Passing this type widens {@link MorphoProtocolEvm.getBorrowRequirements} to
 * include the loan-token approval that a Vault V2 penalty may require. Legacy
 * {@link MorphoBorrowOptions} callers retain the authorization-only result.
 */
export type MorphoBorrowWithVaultV2ReallocationsOptions = Omit<
  MorphoBorrowOptions,
  "reallocations"
> & {
  /** Vault V2 BluePublicAllocator reallocations to include in the borrow action. */
  readonly reallocations: readonly VaultV2BlueReallocation[];
};

type MorphoBorrowInput =
  | MorphoBorrowOptions
  | MorphoBorrowWithVaultV2ReallocationsOptions;

export interface MorphoRepayOptions {
  /** The address of the token to repay. */
  token: string;
  /** The repayment amount, in base units, or `"max"` to repay all current borrow shares. */
  amount: number | bigint | "max";
  /** The address on behalf of which the repay operation should be performed. Must match the wallet account address when set. */
  onBehalfOf?: string;
  /** Signature returned by a Morpho SDK approval requirement. */
  requirementSignature?: RequirementSignature;
  /** Optional Morpho SDK slippage tolerance in WAD precision. */
  slippageTolerance?: bigint;
}

export interface Presets {
  /** Key of a curated Morpho Vault V2 preset in `MORPHO_VAULT_PRESETS`. */
  earn?: VaultPresetKey | string;
  /** Key of a curated Morpho Blue market preset in `MORPHO_MARKET_PRESETS`. */
  borrow?: MarketPresetKey | string;
}

export interface VaultPosition {
  /** The account's vault share balance. */
  shares: bigint;
  /** The account's vault position converted to underlying assets using current vault data. */
  assets: bigint;
  /** The configured vault address. */
  vaultAddress: Address;
}

export interface MarketPosition {
  /** The account's Morpho market supply shares. */
  supplyShares: bigint;
  /** The account's Morpho market borrow shares. */
  borrowShares: bigint;
  /** The account's current borrow assets after accrual. */
  borrowAssets: bigint;
  /** The account's collateral supplied to the market. */
  collateral: bigint;
  /** The configured market id. */
  marketId: string;
}

export interface AccountData {
  /** The account's configured vault share balance. */
  vaultShares: bigint;
  /** The account's configured vault balance in underlying assets. */
  vaultAssets: bigint;
  /** The account's configured market supply shares. */
  marketSupplyShares: bigint;
  /** The account's configured market borrow shares. */
  marketBorrowShares: bigint;
  /** The account's configured market borrow assets. */
  marketBorrowAssets: bigint;
  /** The account's configured market collateral. */
  collateral: bigint;
  /** The configured vault address. */
  vaultAddress: Address;
  /** The configured market id. */
  marketId: string;
}

export interface MorphoProtocolOptions {
  /** Explicit Morpho vault address. Takes priority over `presets.earn`. */
  earnVaultAddress?: string;
  /** Explicit market id. If `borrowMarketParams` is not provided, params are fetched on-chain. */
  borrowMarketId?: string;
  /** Explicit Morpho Blue market params. Takes priority over `borrowMarketId` and `presets.borrow`. */
  borrowMarketParams?: InputMarketParams;
  /** Curated target names for Ethereum USDT earn/borrow. */
  presets?: Presets;
  /** Required when explicit Morpho targets are used; guards against wallet chain switches. */
  chainId?: number | bigint;
  /** Optional Morpho SDK slippage tolerance in WAD precision. */
  slippageTolerance?: bigint;
  /** Enable Morpho SDK permit/permit2 requirements (default: false). */
  supportSignature?: boolean;
  /** Enable Morpho SDK deployless reads (default: false). */
  supportDeployless?: boolean;
  /** Optional Morpho SDK metadata propagated to action encoders. */
  metadata?: Metadata;
}

type NormalizedMorphoProtocolOptions = Readonly<
  Omit<MorphoProtocolOptions, "chainId" | "presets" | "borrowMarketParams"> & {
    chainId: number | undefined;
    presets: Readonly<Presets> | undefined;
    borrowMarketParams: Readonly<InputMarketParams> | undefined;
  }
>;

interface VaultTarget {
  readonly address: Address;
  readonly chainId: number | undefined;
}

type MarketTarget =
  | {
      readonly marketParams: InputMarketParams;
      readonly chainId: number | undefined;
    }
  | { readonly marketId: string; readonly chainId: number | undefined };

interface WdkTransaction {
  to: Address;
  value: bigint;
  data: `0x${string}`;
}

interface ChainContext {
  readonly chainId: number;
  readonly generation: number;
}

interface PreparedTransaction {
  readonly context: ChainContext;
  readonly transaction: WdkTransaction;
}

const SUPPORTED_CHAINS: Record<number, Chain> = {
  [mainnet.id]: mainnet,
  [base.id]: base,
  [arbitrum.id]: arbitrum,
  [optimism.id]: optimism,
  [polygon.id]: polygon,
};

const MARKET_ID_REGEX = /^0x[0-9a-fA-F]{64}$/;

function isNonZeroAddress(address: string): address is Address {
  return isAddress(address) && !isAddressEqual(address as Address, zeroAddress);
}

function isMarketId(value: string): boolean {
  return MARKET_ID_REGEX.test(value);
}

function normalizeAmount(amount: number | bigint, field = "amount"): bigint {
  if (typeof amount !== "bigint" && typeof amount !== "number") {
    throw new Error(`'${field}' must be a number or bigint.`);
  }

  if (typeof amount === "number" && !Number.isSafeInteger(amount)) {
    throw new Error(
      `'${field}' must be a safe integer; pass a bigint for values above Number.MAX_SAFE_INTEGER.`,
    );
  }

  if (amount <= 0) {
    throw new Error(`'${field}' should be greater than zero.`);
  }

  return BigInt(amount);
}

function normalizeOptionalNonNegativeAmount(
  amount: number | bigint | undefined,
  field: string,
): bigint {
  if (amount === undefined) return 0n;

  if (typeof amount !== "bigint" && typeof amount !== "number") {
    throw new Error(`'${field}' must be a number or bigint.`);
  }

  if (typeof amount === "number" && !Number.isSafeInteger(amount)) {
    throw new Error(
      `'${field}' must be a safe integer; pass a bigint for values above Number.MAX_SAFE_INTEGER.`,
    );
  }

  if (amount < 0) {
    throw new Error(`'${field}' should be a non-negative amount.`);
  }

  return BigInt(amount);
}

interface NormalizedDepositAmounts {
  amount: bigint;
  nativeAmount: bigint | undefined;
}

function normalizeDepositAmounts({
  amount,
  nativeAmount,
}: Pick<
  MorphoSupplyOptions,
  "amount" | "nativeAmount"
>): NormalizedDepositAmounts {
  const normalizedAmount = normalizeOptionalNonNegativeAmount(amount, "amount");
  const normalizedNativeAmount = normalizeOptionalNonNegativeAmount(
    nativeAmount,
    "nativeAmount",
  );

  if (normalizedAmount === 0n && normalizedNativeAmount === 0n) {
    throw new Error("'amount' or 'nativeAmount' should be greater than zero.");
  }

  return {
    amount: normalizedAmount,
    nativeAmount:
      normalizedNativeAmount === 0n && nativeAmount === undefined
        ? undefined
        : normalizedNativeAmount,
  };
}

function normalizeOptions(
  options: MorphoProtocolOptions,
): NormalizedMorphoProtocolOptions {
  const normalized: NormalizedMorphoProtocolOptions = {
    ...options,
    chainId:
      options.chainId === undefined ? undefined : Number(options.chainId),
    presets:
      options.presets === undefined
        ? undefined
        : Object.freeze({ ...options.presets }),
    borrowMarketParams:
      options.borrowMarketParams === undefined
        ? undefined
        : Object.freeze({ ...options.borrowMarketParams }),
  };

  return Object.freeze(normalized);
}

function toWdkTransaction(tx: {
  to: Address;
  value?: bigint;
  data: `0x${string}`;
}): WdkTransaction {
  return {
    to: tx.to,
    value: tx.value ?? 0n,
    data: tx.data,
  };
}

/**
 * Morpho lending protocol adapter for WDK-compatible EVM wallet accounts.
 *
 * Wraps `@morpho-org/morpho-sdk` to expose Morpho Vault V2 earn flows and
 * Morpho Blue market borrow/repay flows through the WDK
 * {@link LendingProtocol} contract.
 */
export default class MorphoProtocolEvm extends LendingProtocol {
  /**
   * Narrowed handle on the constructor-supplied account. The inherited
   * `_account: IWalletAccount` field is too narrow (it cannot represent
   * `WalletAccountReadOnly*` variants), so the adapter tracks its own
   * typed reference alongside the base class.
   */
  private readonly _evmAccount: MorphoEvmAccount;
  private readonly _options: NormalizedMorphoProtocolOptions;
  private readonly _providerSource: WdkProviderSource;
  private readonly _providerRetries: number;
  private readonly _accountConfiguredChainId: number | undefined;
  private _chainContext: ChainContext | undefined = undefined;
  private _latestChainObservation:
    | { readonly chainId: Promise<number> }
    | undefined = undefined;
  private _erc4337Context: ChainContext | undefined = undefined;
  private _erc4337InvalidChainId: number | undefined = undefined;
  private _viemClient:
    | {
        readonly context: ChainContext;
        readonly account: Address;
        readonly value: ViemPublicClient;
      }
    | undefined = undefined;
  private _morphoClient:
    | {
        readonly context: ChainContext;
        readonly viemClient: ViemPublicClient;
        readonly value: MorphoClientType;
      }
    | undefined = undefined;
  private _marketParams:
    | { readonly context: ChainContext; readonly value: MarketParams }
    | undefined = undefined;

  /**
   * Creates a new interface to the Morpho protocol for EVM blockchains.
   *
   * Accepts both read-only and writable WDK wallet accounts. Read-only
   * accounts can read on-chain state and quote transactions; write methods
   * (`supply`, `withdraw`, `borrow`, `repay`, `supplyCollateral`,
   * `withdrawCollateral`) require a writable account.
   *
   * @param account - The wallet account to use to interact with the protocol.
   * @param options - The Morpho target configuration.
   */
  constructor(account: MorphoEvmAccount, options: MorphoProtocolOptions = {}) {
    // `LendingProtocol`'s constructor is overloaded to accept either an
    // `IWalletAccountReadOnly` or an `IWalletAccount`. Its inherited
    // `_account` field is typed `IWalletAccount`, which is too narrow
    // for the read-only variants this adapter also accepts. The cast
    // matches the overload at runtime; `_evmAccount` keeps the precise
    // narrowed type for the adapter's own use.
    super(account as ConstructorParameters<typeof LendingProtocol>[0]);
    this._evmAccount = account;

    // wdk-wallet exposes its provider config only through this protected
    // runtime field. Absorb that unstable boundary as unknown before narrowing.
    const walletConfig: unknown = Reflect.get(account, "_config");
    const config =
      typeof walletConfig === "object" && walletConfig !== null
        ? walletConfig
        : {};
    const provider: unknown =
      "provider" in config ? config.provider : undefined;

    if (!provider || (Array.isArray(provider) && provider.length === 0)) {
      throw new Error("The wallet account must have a provider configured.");
    }

    const normalizedOptions = normalizeOptions(options);

    this._validateOptions(normalizedOptions);

    this._options = normalizedOptions;
    this._providerSource = Array.isArray(provider)
      ? (Object.freeze([...provider]) as WdkProviderSource)
      : (provider as WdkProviderSource);
    const retries = "retries" in config ? config.retries : undefined;
    this._providerRetries = typeof retries === "number" ? retries : 3;
    const accountChainId = "chainId" in config ? config.chainId : undefined;
    this._accountConfiguredChainId =
      typeof accountChainId === "number" ? accountChainId : undefined;
  }

  /**
   * Supplies assets into the configured Morpho vault.
   *
   * The transaction is built by `@morpho-org/morpho-sdk`. Use
   * `getSupplyRequirements(options)` first if the account has not approved
   * the required Morpho bundler spender.
   *
   * For direct ERC-20 approvals, use `WalletAccountEvm#approve` or
   * `WalletAccountEvmErc4337#approve` before calling this method.
   *
   * @param options - The supply options.
   * @param config - ERC-4337 transaction config override.
   * @returns The supply result.
   * @throws {ChainIdMismatchError} When the provider changes chains before dispatch.
   * @throws {Error} If the options are invalid, the token does not match the configured vault, the account lacks funds, or the transaction fails.
   */
  async supply(
    options: MorphoSupplyOptions,
    config?: Erc4337TransactionConfig,
  ): Promise<SupplyResult> {
    this._assertWritable("supply(options)");
    const depositAmounts = normalizeDepositAmounts(options);
    const operationOptions: MorphoSupplyOptions = {
      ...options,
      ...depositAmounts,
    };
    const context = await this._getVaultContext();
    if (depositAmounts.amount > 0n) {
      await this._assertTokenBalance(context, {
        token: operationOptions.token,
        amount: depositAmounts.amount,
      });
    } else {
      this._assertAddress("token", operationOptions.token);
    }

    const tx = await this._getSupplyTransaction(context, operationOptions);

    return await this._sendTransaction(tx, config);
  }

  /**
   * Returns Morpho SDK requirements for a vault deposit.
   *
   * @param options - The supply options.
   * @param requirementOptions - Optional Morpho SDK requirement options.
   * @returns Approval/signature requirements.
   * @throws {ChainIdMismatchError} When the provider changes chains while resolving requirements.
   */
  async getSupplyRequirements(
    options: MorphoSupplyOptions,
    requirementOptions?: RequirementOptions,
  ): Promise<ApprovalOrSignatureRequirement[]> {
    const context = await this._getVaultContext();
    const action = await this._getSupplyAction(context, options);
    const requirements = await action.getRequirements(requirementOptions);
    await this._revalidate(context);

    return requirements;
  }

  /**
   * Quotes the cost of a vault deposit transaction.
   *
   * @param options - The supply options.
   * @param config - ERC-4337 transaction config override.
   * @returns The fee quote.
   * @throws {ChainIdMismatchError} When the provider changes chains while quoting.
   */
  async quoteSupply(
    options: MorphoSupplyOptions,
    config?: Erc4337TransactionConfig,
  ): Promise<Omit<SupplyResult, "hash">> {
    const context = await this._getVaultContext();
    const tx = await this._getSupplyTransaction(context, options);

    return await this._quoteTransaction(tx, config);
  }

  private async _getSupplyAction(
    context: ChainContext,
    {
      token,
      amount,
      nativeAmount,
      onBehalfOf,
      slippageTolerance,
    }: MorphoSupplyOptions,
  ) {
    const depositAmounts = normalizeDepositAmounts({ amount, nativeAmount });
    this._assertAddress("token", token);
    this._assertOptionalAddress("onBehalfOf", onBehalfOf);

    const userAddress = await this._getSdkUserAddress(context, onBehalfOf);
    const vault = await this._getVault(context);
    const accrualVault = await vault.entity.getData();
    await this._revalidate(context);

    if (!isAddressEqual(accrualVault.asset, token as Address)) {
      throw new Error(
        `Token '${token}' does not match configured vault asset '${accrualVault.asset}'.`,
      );
    }

    return vault.entity.deposit({
      amount: depositAmounts.amount,
      nativeAmount: depositAmounts.nativeAmount,
      userAddress,
      vaultData: accrualVault,
      slippageTolerance: slippageTolerance ?? this._options.slippageTolerance,
    });
  }

  private async _getSupplyTransaction(
    context: ChainContext,
    options: MorphoSupplyOptions,
  ): Promise<PreparedTransaction> {
    const action = await this._getSupplyAction(context, options);

    return {
      context,
      transaction: toWdkTransaction(
        action.buildTx(
          options.requirementSignature
            ? [options.requirementSignature]
            : undefined,
        ),
      ),
    };
  }

  /**
   * Withdraws assets from the configured Morpho vault.
   *
   * @param options - The withdraw options.
   * @param config - ERC-4337 transaction config override.
   * @returns The withdraw result.
   * @throws {ChainIdMismatchError} When the provider changes chains before dispatch.
   * @throws {Error} If the options are invalid, the token does not match the configured vault, or the transaction fails.
   */
  async withdraw(
    options: WithdrawOptions,
    config?: Erc4337TransactionConfig,
  ): Promise<WithdrawResult> {
    this._assertWritable("withdraw(options)");
    const context = await this._getVaultContext();
    const tx = await this._getWithdrawTransaction(context, options);

    return await this._sendTransaction(tx, config);
  }

  /**
   * Quotes the cost of a vault withdraw transaction.
   *
   * @param options - The withdraw options.
   * @param config - ERC-4337 transaction config override.
   * @returns The fee quote.
   * @throws {ChainIdMismatchError} When the provider changes chains while quoting.
   */
  async quoteWithdraw(
    options: WithdrawOptions,
    config?: Erc4337TransactionConfig,
  ): Promise<Omit<WithdrawResult, "hash">> {
    const context = await this._getVaultContext();
    const tx = await this._getWithdrawTransaction(context, options);

    return await this._quoteTransaction(tx, config);
  }

  private async _getWithdrawTransaction(
    context: ChainContext,
    { token, amount, to }: WithdrawOptions,
  ): Promise<PreparedTransaction> {
    const normalizedAmount = normalizeAmount(amount);
    this._assertAddress("token", token);
    this._assertOptionalAddress("to", to);

    const userAddress = (await this._evmAccount.getAddress()) as Address;
    this._assertCurrent(context);
    if (to !== undefined && !isAddressEqual(to as Address, userAddress)) {
      throw new Error(
        "'to' must equal the wallet account address for Morpho vault withdrawals.",
      );
    }

    const vault = await this._getVault(context);
    const accrualVault = await vault.entity.getData();
    await this._revalidate(context);

    if (!isAddressEqual(accrualVault.asset, token as Address)) {
      throw new Error(
        `Token '${token}' does not match configured vault asset '${accrualVault.asset}'.`,
      );
    }

    return {
      context,
      transaction: toWdkTransaction(
        vault.entity
          .withdraw({
            amount: normalizedAmount,
            userAddress,
          })
          .buildTx(),
      ),
    };
  }

  /**
   * Borrows assets from the configured Morpho Blue market.
   *
   * Call `getBorrowRequirements(options)` first and satisfy every returned
   * requirement. Vault V2 reallocations with a nonzero penalty may require a
   * loan-token approval in addition to GeneralAdapter1 authorization. When
   * offchain signatures are enabled (`supportSignature: true`), sign the returned
   * authorization requirement and pass it via `options.requirementSignature` to
   * fold `setAuthorizationWithSig` into the bundle; otherwise submit the returned
   * authorization transaction separately first.
   *
   * @param options - The borrow options.
   * @param config - ERC-4337 transaction config override.
   * @returns The borrow result.
   * @throws {ChainIdMismatchError} When the provider changes chains before dispatch.
   * @throws {Error} If the options are invalid, GeneralAdapter1 is not authorized, or the transaction fails.
   */
  async borrow(
    options: MorphoBorrowInput,
    config?: Erc4337TransactionConfig,
  ): Promise<BorrowResult> {
    this._assertWritable("borrow(options)");
    const context = await this._getMarketContext();
    const tx = await this._getBorrowTransaction(context, options);

    return await this._sendTransaction(tx, config);
  }

  /**
   * Returns Morpho SDK authorization requirements for a borrow without Vault V2 reallocations.
   *
   * @param options - The borrow options.
   * @returns Authorization requirements. When offchain signatures are enabled
   *   (`supportSignature: true`), the authorization may instead be returned as a signable
   *   `RequirementSignatureRequest` to fold into the bundle via `setAuthorizationWithSig`.
   * @throws {ChainIdMismatchError} When the provider changes chains while resolving requirements.
   */
  public getBorrowRequirements(
    options: MorphoBorrowOptions,
  ): Promise<(RequirementAuthorization | RequirementSignatureRequest)[]>;
  /**
   * Returns Morpho SDK requirements for a borrow with Vault V2 reallocations.
   *
   * @param options - The Vault V2 reallocation borrow options.
   * @returns Authorization requirements and any loan-token approval required for the public
   *   allocator penalty donation. When offchain signatures are enabled (`supportSignature: true`),
   *   the authorization may instead be returned as a signable `RequirementSignatureRequest` to
   *   fold into the bundle via `setAuthorizationWithSig`.
   * @throws {ChainIdMismatchError} When the provider changes chains while resolving requirements.
   */
  public getBorrowRequirements(
    options: MorphoBorrowWithVaultV2ReallocationsOptions,
  ): Promise<
    (
      | RequirementApproval
      | RequirementAuthorization
      | RequirementSignatureRequest
    )[]
  >;
  public async getBorrowRequirements(
    options: MorphoBorrowInput,
  ): Promise<
    (
      | RequirementApproval
      | RequirementAuthorization
      | RequirementSignatureRequest
    )[]
  > {
    const context = await this._getMarketContext();
    const action = await this._getBorrowAction(context, options);
    const requirements = await action.getRequirements();
    await this._revalidate(context);

    return requirements;
  }

  /**
   * Quotes the cost of a borrow transaction.
   *
   * @param options - The borrow options.
   * @param config - ERC-4337 transaction config override.
   * @returns The fee quote.
   * @throws {ChainIdMismatchError} When the provider changes chains while quoting.
   */
  async quoteBorrow(
    options: MorphoBorrowInput,
    config?: Erc4337TransactionConfig,
  ): Promise<Omit<BorrowResult, "hash">> {
    const context = await this._getMarketContext();
    const tx = await this._getBorrowTransaction(context, options);

    return await this._quoteTransaction(tx, config);
  }

  private async _getBorrowAction(
    context: ChainContext,
    {
      token,
      amount,
      onBehalfOf,
      slippageTolerance,
      reallocations,
    }: MorphoBorrowInput,
  ) {
    const normalizedAmount = normalizeAmount(amount);
    this._assertAddress("token", token);
    this._assertOptionalAddress("onBehalfOf", onBehalfOf);

    const userAddress = await this._getSdkUserAddress(context, onBehalfOf);
    const market = await this._getMarket(context);

    if (!isAddressEqual(market.params.loanToken, token as Address)) {
      throw new Error(
        `Token '${token}' does not match configured market loan token '${market.params.loanToken}'.`,
      );
    }

    const positionData = await market.entity.getPositionData(userAddress);
    await this._revalidate(context);

    return market.entity.borrow({
      amount: normalizedAmount,
      userAddress,
      positionData,
      slippageTolerance: slippageTolerance ?? this._options.slippageTolerance,
      reallocations,
    });
  }

  private async _getBorrowTransaction(
    context: ChainContext,
    options: MorphoBorrowInput,
  ): Promise<PreparedTransaction> {
    const action = await this._getBorrowAction(context, options);

    return {
      context,
      transaction: toWdkTransaction(
        action.buildTx(
          options.requirementSignature
            ? [options.requirementSignature]
            : undefined,
        ),
      ),
    };
  }

  /**
   * Repays assets to the configured Morpho Blue market.
   *
   * Pass `amount: "max"` to repay all current borrow shares.
   *
   * @param options - The repay options.
   * @param config - ERC-4337 transaction config override.
   * @returns The repay result.
   * @throws {ChainIdMismatchError} When the provider changes chains before dispatch.
   * @throws {Error} If the options are invalid, the account lacks funds, or the transaction fails.
   */
  async repay(
    options: MorphoRepayOptions,
    config?: Erc4337TransactionConfig,
  ): Promise<RepayResult> {
    this._assertWritable("repay(options)");
    const amount =
      options.amount === "max" ? "max" : normalizeAmount(options.amount);
    const operationOptions: MorphoRepayOptions = { ...options, amount };
    const context = await this._getMarketContext();

    if (amount !== "max") {
      await this._assertTokenBalance(context, {
        token: operationOptions.token,
        amount,
      });
    }

    const tx = await this._getRepayTransaction(context, operationOptions);

    return await this._sendTransaction(tx, config);
  }

  /**
   * Returns Morpho SDK requirements for a repay.
   *
   * @param options - The repay options.
   * @param requirementOptions - Optional Morpho SDK requirement options.
   * @returns Approval/signature requirements.
   * @throws {ChainIdMismatchError} When the provider changes chains while resolving requirements.
   */
  async getRepayRequirements(
    options: MorphoRepayOptions,
    requirementOptions?: RequirementOptions,
  ): Promise<ApprovalOrSignatureRequirement[]> {
    const context = await this._getMarketContext();
    const action = await this._getRepayAction(context, options);
    const requirements = await action.getRequirements(requirementOptions);
    await this._revalidate(context);

    return requirements;
  }

  /**
   * Quotes the cost of a repay transaction.
   *
   * @param options - The repay options.
   * @param config - ERC-4337 transaction config override.
   * @returns The fee quote.
   * @throws {ChainIdMismatchError} When the provider changes chains while quoting.
   */
  async quoteRepay(
    options: MorphoRepayOptions,
    config?: Erc4337TransactionConfig,
  ): Promise<Omit<RepayResult, "hash">> {
    const context = await this._getMarketContext();
    const tx = await this._getRepayTransaction(context, options);

    return await this._quoteTransaction(tx, config);
  }

  private async _getRepayAction(
    context: ChainContext,
    { token, amount, onBehalfOf, slippageTolerance }: MorphoRepayOptions,
  ) {
    const normalizedAmount = amount === "max" ? "max" : normalizeAmount(amount);
    this._assertAddress("token", token);
    this._assertOptionalAddress("onBehalfOf", onBehalfOf);

    const userAddress = await this._getSdkUserAddress(context, onBehalfOf);
    const market = await this._getMarket(context);

    if (!isAddressEqual(market.params.loanToken, token as Address)) {
      throw new Error(
        `Token '${token}' does not match configured market loan token '${market.params.loanToken}'.`,
      );
    }

    const positionData = await market.entity.getPositionData(userAddress);
    await this._revalidate(context);
    const repayAmount =
      normalizedAmount === "max"
        ? { shares: positionData.borrowShares }
        : { amount: normalizedAmount };

    return market.entity.repay({
      ...repayAmount,
      userAddress,
      positionData,
      slippageTolerance: slippageTolerance ?? this._options.slippageTolerance,
    });
  }

  private async _getRepayTransaction(
    context: ChainContext,
    options: MorphoRepayOptions,
  ): Promise<PreparedTransaction> {
    const action = await this._getRepayAction(context, options);

    return {
      context,
      transaction: toWdkTransaction(
        action.buildTx(
          options.requirementSignature
            ? [options.requirementSignature]
            : undefined,
        ),
      ),
    };
  }

  /**
   * Supplies collateral to the configured Morpho Blue market.
   *
   * Use `getSupplyCollateralRequirements(options)` first if the account has
   * not approved the required Morpho bundler spender.
   *
   * For direct ERC-20 approvals, use `WalletAccountEvm#approve` or
   * `WalletAccountEvmErc4337#approve` before calling this method.
   *
   * @param options - The collateral supply options.
   * @param config - ERC-4337 transaction config override.
   * @returns The supply collateral result.
   * @throws {ChainIdMismatchError} When the provider changes chains before dispatch.
   * @throws {Error} If the options are invalid, the token does not match the configured market collateral, the account lacks funds, or the transaction fails.
   */
  async supplyCollateral(
    options: MorphoSupplyOptions,
    config?: Erc4337TransactionConfig,
  ): Promise<SupplyResult> {
    this._assertWritable("supplyCollateral(options)");
    const depositAmounts = normalizeDepositAmounts(options);
    const operationOptions: MorphoSupplyOptions = {
      ...options,
      ...depositAmounts,
    };
    const context = await this._getMarketContext();
    if (depositAmounts.amount > 0n) {
      await this._assertTokenBalance(context, {
        token: operationOptions.token,
        amount: depositAmounts.amount,
      });
    } else {
      this._assertAddress("token", operationOptions.token);
    }

    const tx = await this._getSupplyCollateralTransaction(
      context,
      operationOptions,
    );

    return await this._sendTransaction(tx, config);
  }

  /**
   * Returns Morpho SDK requirements for supplying collateral.
   *
   * @param options - The collateral supply options.
   * @param requirementOptions - Optional Morpho SDK requirement options.
   * @returns Approval/signature requirements.
   * @throws {ChainIdMismatchError} When the provider changes chains while resolving requirements.
   */
  async getSupplyCollateralRequirements(
    options: MorphoSupplyOptions,
    requirementOptions?: RequirementOptions,
  ): Promise<ApprovalOrSignatureRequirement[]> {
    const context = await this._getMarketContext();
    const action = await this._getSupplyCollateralAction(context, options);
    const requirements = await action.getRequirements(requirementOptions);
    await this._revalidate(context);

    return requirements;
  }

  /**
   * Quotes the cost of supplying collateral.
   *
   * @param options - The collateral supply options.
   * @param config - ERC-4337 transaction config override.
   * @returns The fee quote.
   * @throws {ChainIdMismatchError} When the provider changes chains while quoting.
   */
  async quoteSupplyCollateral(
    options: MorphoSupplyOptions,
    config?: Erc4337TransactionConfig,
  ): Promise<Omit<SupplyResult, "hash">> {
    const context = await this._getMarketContext();
    const tx = await this._getSupplyCollateralTransaction(context, options);

    return await this._quoteTransaction(tx, config);
  }

  private async _getSupplyCollateralAction(
    context: ChainContext,
    { token, amount, nativeAmount, onBehalfOf }: MorphoSupplyOptions,
  ) {
    const depositAmounts = normalizeDepositAmounts({ amount, nativeAmount });
    this._assertAddress("token", token);
    this._assertOptionalAddress("onBehalfOf", onBehalfOf);

    const userAddress = await this._getSdkUserAddress(context, onBehalfOf);
    const market = await this._getMarket(context);

    if (!isAddressEqual(market.params.collateralToken, token as Address)) {
      throw new Error(
        `Token '${token}' does not match configured market collateral token '${market.params.collateralToken}'.`,
      );
    }

    return market.entity.supplyCollateral({
      amount: depositAmounts.amount,
      nativeAmount: depositAmounts.nativeAmount,
      userAddress,
    });
  }

  private async _getSupplyCollateralTransaction(
    context: ChainContext,
    options: MorphoSupplyOptions,
  ): Promise<PreparedTransaction> {
    const action = await this._getSupplyCollateralAction(context, options);

    return {
      context,
      transaction: toWdkTransaction(
        action.buildTx(
          options.requirementSignature
            ? [options.requirementSignature]
            : undefined,
        ),
      ),
    };
  }

  /**
   * Withdraws collateral from the configured Morpho Blue market.
   *
   * @param options - The collateral withdraw options.
   * @param config - ERC-4337 transaction config override.
   * @returns The withdraw collateral result.
   * @throws {ChainIdMismatchError} When the provider changes chains before dispatch.
   * @throws {Error} If the options are invalid, the token does not match the configured market collateral, or the transaction fails.
   */
  async withdrawCollateral(
    options: WithdrawOptions,
    config?: Erc4337TransactionConfig,
  ): Promise<WithdrawResult> {
    this._assertWritable("withdrawCollateral(options)");
    const context = await this._getMarketContext();
    const tx = await this._getWithdrawCollateralTransaction(context, options);

    return await this._sendTransaction(tx, config);
  }

  /**
   * Quotes the cost of withdrawing collateral.
   *
   * @param options - The collateral withdraw options.
   * @param config - ERC-4337 transaction config override.
   * @returns The fee quote.
   * @throws {ChainIdMismatchError} When the provider changes chains while quoting.
   */
  async quoteWithdrawCollateral(
    options: WithdrawOptions,
    config?: Erc4337TransactionConfig,
  ): Promise<Omit<WithdrawResult, "hash">> {
    const context = await this._getMarketContext();
    const tx = await this._getWithdrawCollateralTransaction(context, options);

    return await this._quoteTransaction(tx, config);
  }

  private async _getWithdrawCollateralTransaction(
    context: ChainContext,
    { token, amount, to }: WithdrawOptions,
  ): Promise<PreparedTransaction> {
    const normalizedAmount = normalizeAmount(amount);
    this._assertAddress("token", token);
    this._assertOptionalAddress("to", to);

    const userAddress = (await this._evmAccount.getAddress()) as Address;
    this._assertCurrent(context);
    const market = await this._getMarket(context);

    if (!isAddressEqual(market.params.collateralToken, token as Address)) {
      throw new Error(
        `Token '${token}' does not match configured market collateral token '${market.params.collateralToken}'.`,
      );
    }

    if (to !== undefined && !isAddressEqual(to as Address, userAddress)) {
      throw new Error(
        "'to' must equal the wallet account address for Morpho collateral withdrawals.",
      );
    }

    const positionData = await market.entity.getPositionData(userAddress);
    await this._revalidate(context);

    return {
      context,
      transaction: toWdkTransaction(
        market.entity
          .withdrawCollateral({
            amount: normalizedAmount,
            userAddress,
            positionData,
          })
          .buildTx(),
      ),
    };
  }

  /**
   * Returns this or another account's configured vault position.
   *
   * @param account - If set, returns the vault position for the given address.
   * @returns The vault position.
   * @throws {ChainIdMismatchError} When the provider changes chains while reading the position.
   */
  async getVaultPosition(account?: string): Promise<VaultPosition> {
    const context = await this._getVaultContext();

    return await this._getVaultPosition(context, account);
  }

  private async _getVaultPosition(
    context: ChainContext,
    account?: string,
  ): Promise<VaultPosition> {
    this._assertOptionalAddress("account", account);

    const userAddress =
      (account as Address | undefined) ??
      ((await this._evmAccount.getAddress()) as Address);
    this._assertCurrent(context);
    const vault = await this._getVault(context);
    const data = await vault.entity.getData();
    await this._revalidate(context);
    const client = await this._getViemClient(context);
    const shares = await client.readContract({
      address: vault.address,
      abi: erc4626Abi,
      functionName: "balanceOf",
      args: [userAddress],
    });
    await this._revalidate(context);

    return {
      shares,
      assets: data.toAssets(shares),
      vaultAddress: vault.address,
    };
  }

  /**
   * Returns this or another account's configured market position.
   *
   * @param account - If set, returns the market position for the given address.
   * @returns The market position.
   * @throws {ChainIdMismatchError} When the provider changes chains while reading the position.
   */
  async getMarketPosition(account?: string): Promise<MarketPosition> {
    const context = await this._getMarketContext();

    return await this._getMarketPosition(context, account);
  }

  private async _getMarketPosition(
    context: ChainContext,
    account?: string,
  ): Promise<MarketPosition> {
    this._assertOptionalAddress("account", account);

    const userAddress =
      (account as Address | undefined) ??
      ((await this._evmAccount.getAddress()) as Address);
    this._assertCurrent(context);
    const market = await this._getMarket(context);
    const position = await market.entity.getPositionData(userAddress);
    await this._revalidate(context);

    return {
      supplyShares: position.supplyShares,
      borrowShares: position.borrowShares,
      borrowAssets: position.borrowAssets,
      collateral: position.collateral,
      marketId: market.params.id,
    };
  }

  /**
   * Returns this or another account's configured vault and market data.
   *
   * @param account - If set, returns the data for the given address.
   * @returns The account data.
   * @throws {ChainIdMismatchError} When the provider changes chains while reading account data.
   */
  async getAccountData(account?: string): Promise<AccountData> {
    const context = await this._getChainContext();
    this._assertTargetChain(this._resolveVaultTarget(), context);
    this._assertTargetChain(this._resolveMarketTarget(), context);
    const [vault, market] = await Promise.all([
      this._getVaultPosition(context, account),
      this._getMarketPosition(context, account),
    ]);
    await this._revalidate(context);

    return {
      vaultShares: vault.shares,
      vaultAssets: vault.assets,
      marketSupplyShares: market.supplyShares,
      marketBorrowShares: market.borrowShares,
      marketBorrowAssets: market.borrowAssets,
      collateral: market.collateral,
      vaultAddress: vault.vaultAddress,
      marketId: market.marketId,
    };
  }

  /**
   * Returns the configured vault address.
   *
   * @returns The configured vault address.
   */
  getVaultAddress(): Address {
    return this._resolveVaultTarget().address;
  }

  /**
   * Returns the configured borrow market id, computed locally when possible.
   *
   * @returns The configured market id.
   */
  getBorrowMarketId(): string {
    const target = this._resolveMarketTarget();

    if ("marketParams" in target) {
      return new MarketParams(target.marketParams).id;
    }

    return target.marketId;
  }

  private async _getVault(context: ChainContext): Promise<{
    address: Address;
    entity: ReturnType<MorphoClientType["vaultV2"]>;
  }> {
    const target = this._resolveVaultTarget();
    const { address } = target;
    this._assertCurrent(context);
    this._assertTargetChain(target, context);
    const client = await this._getMorphoClient(context);
    const entity = client.vaultV2(address, context.chainId);

    return { address, entity };
  }

  private async _getMarket(context: ChainContext): Promise<{
    params: MarketParams;
    entity: ReturnType<MorphoClientType["blue"]>;
  }> {
    const params = await this._getMarketParams(context);
    const client = await this._getMorphoClient(context);
    this._assertCurrent(context);

    return {
      params,
      entity: client.blue(params, context.chainId),
    };
  }

  private async _getMarketParams(context: ChainContext): Promise<MarketParams> {
    if (this._marketParams?.context === context) {
      return this._marketParams.value;
    }

    const target = this._resolveMarketTarget();

    this._assertCurrent(context);
    this._assertTargetChain(target, context);

    if ("marketParams" in target) {
      const value =
        target.marketParams instanceof MarketParams
          ? target.marketParams
          : new MarketParams(target.marketParams);
      this._marketParams = { context, value };
      return value;
    }

    const client = await this._getViemClient(context);
    const market = await fetchMarket(target.marketId as MarketId, client, {
      chainId: context.chainId,
      deployless: this._options.supportDeployless,
    });
    await this._revalidate(context);

    const value =
      market.params instanceof MarketParams
        ? market.params
        : new MarketParams(market.params);
    this._marketParams = { context, value };

    return value;
  }

  private async _getMorphoClient(
    context: ChainContext,
  ): Promise<MorphoClientType> {
    const viemClient = await this._getViemClient(context);

    if (
      this._morphoClient?.context !== context ||
      this._morphoClient.viemClient !== viemClient
    ) {
      const value = viemClient.extend(
        morphoViemExtension({
          supportSignature: this._options.supportSignature ?? false,
          supportDeployless: this._options.supportDeployless,
          metadata: this._options.metadata,
        }),
      ).morpho;
      this._morphoClient = { context, viemClient, value };
    }

    return this._morphoClient.value;
  }

  private _getViemTransport(): Transport {
    if (Array.isArray(this._providerSource)) {
      const providers = this._providerSource as readonly (
        | string
        | Eip1193Provider
      )[];
      const attempts = 1 + this._providerRetries;
      return fallback(
        Array.from({ length: attempts }, (_, index) => {
          const provider = providers[index % providers.length] as
            | string
            | Eip1193Provider;

          return typeof provider === "string"
            ? http(provider)
            : custom(provider);
        }),
        { retryCount: 0 },
      );
    }

    return typeof this._providerSource === "string"
      ? http(this._providerSource)
      : custom(this._providerSource as Eip1193Provider);
  }

  private _getViemChain(chainId: number): Chain {
    const known = SUPPORTED_CHAINS[chainId];
    if (known) return known;

    return {
      id: chainId,
      name: `Chain ${chainId}`,
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      rpcUrls: {
        default: {
          http:
            typeof this._providerSource === "string"
              ? [this._providerSource]
              : [],
        },
      },
    } satisfies Chain;
  }

  private async _getViemClient(
    context: ChainContext,
  ): Promise<ViemPublicClient> {
    const address = (await this._evmAccount.getAddress()) as Address;
    this._assertCurrent(context);

    if (
      this._viemClient &&
      this._viemClient.context === context &&
      isAddressEqual(this._viemClient.account, address)
    ) {
      return this._viemClient.value;
    }

    const value = createClient({
      account: address,
      chain: this._getViemChain(context.chainId),
      transport: this._getViemTransport(),
    }).extend(publicActions) as ViemPublicClient;
    this._viemClient = { context, account: address, value };

    return value;
  }

  private async _getChainContext(): Promise<ChainContext> {
    const observation = {
      chainId: createClient({
        transport: this._getViemTransport(),
      })
        .extend(publicActions)
        .getChainId()
        .then(Number),
    };
    this._latestChainObservation = observation;
    const chainId = await observation.chainId;
    let latestObservation = observation;
    let latestChainId = chainId;

    while (latestObservation !== this._latestChainObservation) {
      const nextObservation = this._latestChainObservation;
      if (nextObservation === undefined) break;
      latestObservation = nextObservation;
      latestChainId = await nextObservation.chainId;
    }

    if (latestChainId !== chainId) {
      this._chainContext = Object.freeze({
        chainId: latestChainId,
        generation: (this._chainContext?.generation ?? 0) + 1,
      });
      if (this._evmAccount instanceof WalletAccountReadOnlyEvmErc4337) {
        this._erc4337InvalidChainId = chainId;
      }
      throw new ChainIdMismatchError(latestChainId, chainId);
    }

    const context =
      this._chainContext?.chainId === latestChainId
        ? this._chainContext
        : Object.freeze({
            chainId: latestChainId,
            generation: (this._chainContext?.generation ?? 0) + 1,
          });
    this._chainContext = context;
    this._assertErc4337Context(context);
    return context;
  }

  private async _getVaultContext(): Promise<ChainContext> {
    const context = await this._getChainContext();
    this._assertTargetChain(this._resolveVaultTarget(), context);
    return context;
  }

  private async _getMarketContext(): Promise<ChainContext> {
    const context = await this._getChainContext();
    this._assertTargetChain(this._resolveMarketTarget(), context);
    return context;
  }

  private _assertCurrent(context: ChainContext): void {
    if (this._chainContext !== context) {
      throw new ChainIdMismatchError(
        this._chainContext?.chainId,
        context.chainId,
      );
    }

    this._assertErc4337Context(context);
  }

  private async _revalidate(context: ChainContext): Promise<void> {
    const current = await this._getChainContext();
    if (current !== context) {
      throw new ChainIdMismatchError(current.chainId, context.chainId);
    }
  }

  private _assertErc4337Context(context: ChainContext): void {
    if (!(this._evmAccount instanceof WalletAccountReadOnlyEvmErc4337)) {
      return;
    }

    const cachedChainId: unknown = Reflect.get(this._evmAccount, "_chainId");
    const accountChainId =
      typeof cachedChainId === "bigint"
        ? Number(cachedChainId)
        : this._accountConfiguredChainId;
    const expectedChainId =
      this._erc4337Context?.chainId ?? accountChainId ?? context.chainId;

    if (this._erc4337InvalidChainId !== undefined) {
      throw new ChainIdMismatchError(
        this._erc4337InvalidChainId,
        expectedChainId,
      );
    }

    if (
      (accountChainId !== undefined && accountChainId !== expectedChainId) ||
      context.chainId !== expectedChainId ||
      (this._erc4337Context !== undefined && this._erc4337Context !== context)
    ) {
      this._erc4337InvalidChainId =
        accountChainId !== undefined && accountChainId !== expectedChainId
          ? accountChainId
          : context.chainId;
      throw new ChainIdMismatchError(
        this._erc4337InvalidChainId,
        expectedChainId,
      );
    }

    this._erc4337Context = context;
  }

  private _resolveVaultTarget(): VaultTarget {
    if (this._options.earnVaultAddress) {
      return {
        address: this._options.earnVaultAddress as Address,
        chainId: this._options.chainId,
      };
    }

    if (this._options.presets?.earn) {
      const preset =
        MORPHO_VAULT_PRESETS[this._options.presets.earn as VaultPresetKey];
      if (preset) {
        return { address: preset.address, chainId: preset.chainId };
      }
    }

    throw new Error(
      "No Morpho earn vault configured. Set earnVaultAddress or presets.earn.",
    );
  }

  private _resolveMarketTarget(): MarketTarget {
    if (this._options.borrowMarketParams) {
      return {
        marketParams: this._options.borrowMarketParams,
        chainId: this._options.chainId,
      };
    }

    if (this._options.borrowMarketId) {
      return {
        marketId: this._options.borrowMarketId,
        chainId: this._options.chainId,
      };
    }

    if (this._options.presets?.borrow) {
      const preset =
        MORPHO_MARKET_PRESETS[this._options.presets.borrow as MarketPresetKey];
      if (preset) {
        return { marketId: preset.marketId, chainId: preset.chainId };
      }
    }

    throw new Error(
      "No Morpho borrow market configured. Set borrowMarketParams, borrowMarketId, or presets.borrow.",
    );
  }

  private _assertTargetChain(
    target: { chainId: number | undefined },
    context: ChainContext,
  ): void {
    if (target.chainId !== undefined && target.chainId !== context.chainId) {
      throw new ChainIdMismatchError(context.chainId, target.chainId);
    }
  }

  private _validateOptions(options: NormalizedMorphoProtocolOptions): void {
    if (
      options.chainId !== undefined &&
      (!Number.isSafeInteger(options.chainId) || options.chainId <= 0)
    ) {
      throw new Error("'chainId' must be a positive safe integer.");
    }

    const hasExplicitTarget =
      options.earnVaultAddress !== undefined ||
      options.borrowMarketId !== undefined ||
      options.borrowMarketParams !== undefined;

    if (hasExplicitTarget && options.chainId === undefined) {
      throw new Error(
        "'chainId' must be configured when using explicit Morpho targets.",
      );
    }

    if (
      options.earnVaultAddress !== undefined &&
      !isAddress(options.earnVaultAddress)
    ) {
      throw new Error("'earnVaultAddress' must be a valid address.");
    }

    if (
      options.borrowMarketId !== undefined &&
      !isMarketId(options.borrowMarketId)
    ) {
      throw new Error("'borrowMarketId' must be a 66-character hex string.");
    }

    if (
      options.presets?.earn !== undefined &&
      !MORPHO_VAULT_PRESETS[options.presets.earn as VaultPresetKey]
    ) {
      throw new Error(`Unknown Morpho earn preset '${options.presets.earn}'.`);
    }

    if (
      options.presets?.borrow !== undefined &&
      !MORPHO_MARKET_PRESETS[options.presets.borrow as MarketPresetKey]
    ) {
      throw new Error(
        `Unknown Morpho borrow preset '${options.presets.borrow}'.`,
      );
    }

    if (
      options.slippageTolerance !== undefined &&
      (typeof options.slippageTolerance !== "bigint" ||
        options.slippageTolerance < 0n)
    ) {
      throw new Error("'slippageTolerance' must be a non-negative bigint.");
    }
  }

  private _assertWritable(method: string): void {
    if (
      !(
        this._evmAccount instanceof WalletAccountEvm ||
        this._evmAccount instanceof WalletAccountEvmErc4337
      )
    ) {
      throw new Error(
        `The '${method}' method requires the protocol to be initialized with a non read-only account.`,
      );
    }
  }

  private _assertAddress(
    field: string,
    value: string | undefined,
  ): asserts value is Address {
    if (!value || !isAddress(value)) {
      throw new Error(`'${field}' must be a valid address.`);
    }
  }

  private _assertOptionalAddress(
    field: string,
    value: string | undefined,
  ): void {
    if (value !== undefined && !isNonZeroAddress(value)) {
      throw new Error(`'${field}' must be a valid address (not zero address).`);
    }
  }

  private async _getSdkUserAddress(
    context: ChainContext,
    onBehalfOf: string | undefined,
  ): Promise<Address> {
    const address = (await this._evmAccount.getAddress()) as Address;
    this._assertCurrent(context);

    if (
      onBehalfOf !== undefined &&
      !isAddressEqual(onBehalfOf as Address, address)
    ) {
      throw new Error(
        "'onBehalfOf' must equal the wallet account address for Morpho SDK-backed operations.",
      );
    }

    return address;
  }

  private async _assertTokenBalance(
    context: ChainContext,
    { token, amount }: { token: string; amount: bigint },
  ): Promise<void> {
    this._assertAddress("token", token);
    const balance = await this._evmAccount.getTokenBalance(token);
    await this._revalidate(context);

    if (balance < amount) {
      throw new Error("Not enough funds to fulfill the operation.");
    }
  }

  private async _sendTransaction(
    prepared: PreparedTransaction,
    config?: Erc4337TransactionConfig,
  ): Promise<SupplyResult> {
    await this._revalidate(prepared.context);

    if (this._evmAccount instanceof WalletAccountEvmErc4337) {
      return (await this._evmAccount.sendTransaction(
        prepared.transaction,
        config,
      )) as SupplyResult;
    }
    if (this._evmAccount instanceof WalletAccountEvm) {
      return (await this._evmAccount.sendTransaction(
        prepared.transaction,
      )) as SupplyResult;
    }
    throw new Error(
      "The method requires the protocol to be initialized with a non read-only account.",
    );
  }

  private async _quoteTransaction(
    prepared: PreparedTransaction,
    config?: Erc4337TransactionConfig,
  ): Promise<{ fee: bigint }> {
    await this._revalidate(prepared.context);
    const { fee } =
      this._evmAccount instanceof WalletAccountReadOnlyEvmErc4337
        ? await this._evmAccount.quoteSendTransaction(
            prepared.transaction,
            config,
          )
        : await this._evmAccount.quoteSendTransaction(prepared.transaction);
    await this._revalidate(prepared.context);

    return { fee };
  }
}
