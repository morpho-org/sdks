import {
  type InputMarketParams,
  type MarketId,
  MarketParams,
} from "@morpho-org/blue-sdk";
import { fetchMarket } from "@morpho-org/blue-sdk-viem";
import {
  type ERC20ApprovalAction,
  type Metadata,
  type MorphoAuthorizationAction,
  MorphoClient,
  type Requirement,
  type RequirementSignature,
  type Transaction,
  type VaultReallocation,
} from "@morpho-org/morpho-sdk";
import type {
  BorrowResult,
  RepayResult,
  SupplyResult,
  WithdrawOptions,
  WithdrawResult,
} from "@tetherto/wdk-wallet/protocols";
import { LendingProtocol } from "@tetherto/wdk-wallet/protocols";
import type {
  WalletAccountEvm,
  WalletAccountReadOnlyEvm,
} from "@tetherto/wdk-wallet-evm";
import {
  type Address,
  type Chain,
  type Client,
  createClient,
  custom,
  erc4626Abi,
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
  | Array<string | Eip1193Provider>;

/**
 * wdk-wallet exposes the construction config (including the provider URL or
 * EIP-1193 provider) via a `protected _config` field on every wallet account
 * class. Reading it here is the package boundary: there is no public accessor,
 * and we need the raw source to construct a viem client bound to the same
 * provider the wallet uses.
 */
interface WdkWalletWithConfig {
  readonly _config: {
    readonly provider?: WdkProviderSource;
  };
}

type ViemPublicClient = Client<Transport, Chain> &
  PublicActions<Transport, Chain>;

interface Erc4337PaymasterTokenConfig {
  /** Whether the paymaster is sponsoring the account. */
  isSponsored?: false;
  /** Whether to use native coins instead of a paymaster to pay gas fees. */
  useNativeCoins?: false;
  /** The URL of the paymaster service. */
  paymasterUrl: string;
  /** The address of the paymaster smart contract. */
  paymasterAddress: string;
  /** The paymaster token configuration. */
  paymasterToken: { readonly address: string };
  /** The maximum fee amount for transfer operations. */
  transferMaxFee?: number | bigint;
}

interface Erc4337SponsorshipPolicyConfig {
  /** Whether the paymaster is sponsoring the account. */
  isSponsored: true;
  /** Whether to use native coins instead of a paymaster to pay gas fees. */
  useNativeCoins?: false;
  /** The URL of the paymaster service. */
  paymasterUrl: string;
  /** The sponsorship policy id. */
  sponsorshipPolicyId?: string;
}

interface Erc4337NativeCoinsConfig {
  /** Whether the paymaster is sponsoring the account. */
  isSponsored?: false;
  /** Whether to use native coins instead of a paymaster to pay gas fees. */
  useNativeCoins: true;
  /** The maximum fee amount for transfer operations. */
  transferMaxFee?: number | bigint;
}

export type Erc4337TransactionConfig = Partial<
  | Erc4337PaymasterTokenConfig
  | Erc4337SponsorshipPolicyConfig
  | Erc4337NativeCoinsConfig
>;

interface Erc4337ReadOnlyAccount {
  getAddress(): Promise<string>;
  getTokenBalance(tokenAddress: string): Promise<bigint>;
  quoteSendTransaction(
    tx: WdkTransaction | readonly WdkTransaction[],
    config?: Erc4337TransactionConfig,
  ): Promise<{ fee: bigint }>;
  getUserOperationReceipt(hash: string): Promise<unknown>;
}

interface Erc4337WritableAccount extends Erc4337ReadOnlyAccount {
  sendTransaction(
    tx: WdkTransaction | readonly WdkTransaction[],
    config?: Erc4337TransactionConfig,
  ): Promise<SupplyResult>;
}

export type MorphoEvmAccount =
  | WalletAccountReadOnlyEvm
  | WalletAccountEvm
  | Erc4337ReadOnlyAccount
  | Erc4337WritableAccount;

export type RequirementApproval = Transaction<ERC20ApprovalAction>;
export type RequirementAuthorization = Transaction<MorphoAuthorizationAction>;
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
  /** Optional Morpho Vault V2 reallocations to include in the borrow action. */
  reallocations?: readonly VaultReallocation[];
  /** Optional Morpho SDK slippage tolerance in WAD precision. */
  slippageTolerance?: bigint;
}

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

function isErc4337ReadOnlyAccount(
  account: MorphoEvmAccount,
): account is Erc4337ReadOnlyAccount {
  return (
    typeof (account as { getUserOperationReceipt?: unknown })
      .getUserOperationReceipt === "function"
  );
}

function isErc4337WritableAccount(
  account: MorphoEvmAccount,
): account is Erc4337WritableAccount {
  return (
    isErc4337ReadOnlyAccount(account) &&
    typeof (account as { sendTransaction?: unknown }).sendTransaction ===
      "function"
  );
}

function isWritableAccount(
  account: MorphoEvmAccount,
): account is WalletAccountEvm | Erc4337WritableAccount {
  return (
    typeof (account as { sendTransaction?: unknown }).sendTransaction ===
    "function"
  );
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
  private _chainId: number | undefined = undefined;
  private _viemClient: ViemPublicClient | undefined = undefined;
  private _viemClientAccount: Address | undefined = undefined;
  private _morphoClient: MorphoClient | undefined = undefined;
  private _marketParams: MarketParams | undefined = undefined;

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

    const provider = (account as unknown as WdkWalletWithConfig)._config
      ?.provider;

    if (!provider) {
      throw new Error("The wallet account must have a provider configured.");
    }

    const normalizedOptions = normalizeOptions(options);

    this._validateOptions(normalizedOptions);

    this._options = normalizedOptions;
    this._providerSource = provider;
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
   * @throws {Error} If the options are invalid, the token does not match the configured vault, the account lacks funds, or the transaction fails.
   */
  async supply(
    options: MorphoSupplyOptions,
    config?: Erc4337TransactionConfig,
  ): Promise<SupplyResult> {
    this._assertWritable("supply(options)");
    const depositAmounts = normalizeDepositAmounts(options);
    if (depositAmounts.amount > 0n) {
      await this._assertTokenBalance(options.token, depositAmounts.amount);
    } else {
      this._assertAddress("token", options.token);
    }

    const tx = await this._getSupplyTransaction(options, depositAmounts);

    return await this._sendTransaction(tx, config);
  }

  /**
   * Returns Morpho SDK requirements for a vault deposit.
   *
   * @param options - The supply options.
   * @param requirementOptions - Optional Morpho SDK requirement options.
   * @returns Approval/signature requirements.
   */
  async getSupplyRequirements(
    options: MorphoSupplyOptions,
    requirementOptions?: RequirementOptions,
  ): Promise<ApprovalOrSignatureRequirement[]> {
    const action = await this._getSupplyAction(options);

    return await action.getRequirements(requirementOptions);
  }

  /**
   * Quotes the cost of a vault deposit transaction.
   *
   * @param options - The supply options.
   * @param config - ERC-4337 transaction config override.
   * @returns The fee quote.
   */
  async quoteSupply(
    options: MorphoSupplyOptions,
    config?: Erc4337TransactionConfig,
  ): Promise<Omit<SupplyResult, "hash">> {
    const tx = await this._getSupplyTransaction(options);

    return await this._quoteTransaction(tx, config);
  }

  private async _getSupplyAction(
    {
      token,
      amount,
      nativeAmount,
      onBehalfOf,
      slippageTolerance,
    }: MorphoSupplyOptions,
    depositAmounts: NormalizedDepositAmounts = normalizeDepositAmounts({
      amount,
      nativeAmount,
    }),
  ) {
    this._assertAddress("token", token);
    this._assertOptionalAddress("onBehalfOf", onBehalfOf);

    const userAddress = await this._getSdkUserAddress(onBehalfOf);
    const vault = await this._getVault();
    const accrualVault = await vault.entity.getData();

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
    options: MorphoSupplyOptions,
    depositAmounts?: NormalizedDepositAmounts,
  ): Promise<WdkTransaction> {
    const action = await this._getSupplyAction(options, depositAmounts);

    return toWdkTransaction(action.buildTx(options.requirementSignature));
  }

  /**
   * Withdraws assets from the configured Morpho vault.
   *
   * @param options - The withdraw options.
   * @param config - ERC-4337 transaction config override.
   * @returns The withdraw result.
   * @throws {Error} If the options are invalid, the token does not match the configured vault, or the transaction fails.
   */
  async withdraw(
    options: WithdrawOptions,
    config?: Erc4337TransactionConfig,
  ): Promise<WithdrawResult> {
    this._assertWritable("withdraw(options)");

    const tx = await this._getWithdrawTransaction(options);

    return await this._sendTransaction(tx, config);
  }

  /**
   * Quotes the cost of a vault withdraw transaction.
   *
   * @param options - The withdraw options.
   * @param config - ERC-4337 transaction config override.
   * @returns The fee quote.
   */
  async quoteWithdraw(
    options: WithdrawOptions,
    config?: Erc4337TransactionConfig,
  ): Promise<Omit<WithdrawResult, "hash">> {
    const tx = await this._getWithdrawTransaction(options);

    return await this._quoteTransaction(tx, config);
  }

  private async _getWithdrawTransaction({
    token,
    amount,
    to,
  }: WithdrawOptions): Promise<WdkTransaction> {
    const normalizedAmount = normalizeAmount(amount);
    this._assertAddress("token", token);
    this._assertOptionalAddress("to", to);

    const userAddress = (await this._evmAccount.getAddress()) as Address;
    if (to !== undefined && !isAddressEqual(to as Address, userAddress)) {
      throw new Error(
        "'to' must equal the wallet account address for Morpho vault withdrawals.",
      );
    }

    const vault = await this._getVault();
    const accrualVault = await vault.entity.getData();

    if (!isAddressEqual(accrualVault.asset, token as Address)) {
      throw new Error(
        `Token '${token}' does not match configured vault asset '${accrualVault.asset}'.`,
      );
    }

    return toWdkTransaction(
      vault.entity
        .withdraw({
          amount: normalizedAmount,
          userAddress,
        })
        .buildTx(),
    );
  }

  /**
   * Borrows assets from the configured Morpho Blue market.
   *
   * Use `getBorrowRequirements(options)` first if GeneralAdapter1 has not been
   * authorized on Morpho for this account.
   *
   * @param options - The borrow options.
   * @param config - ERC-4337 transaction config override.
   * @returns The borrow result.
   * @throws {Error} If the options are invalid, GeneralAdapter1 is not authorized, or the transaction fails.
   */
  async borrow(
    options: MorphoBorrowOptions,
    config?: Erc4337TransactionConfig,
  ): Promise<BorrowResult> {
    this._assertWritable("borrow(options)");

    const tx = await this._getBorrowTransaction(options);

    return await this._sendTransaction(tx, config);
  }

  /**
   * Returns Morpho SDK requirements for a borrow.
   *
   * @param options - The borrow options.
   * @returns Authorization requirements.
   */
  async getBorrowRequirements(
    options: MorphoBorrowOptions,
  ): Promise<RequirementAuthorization[]> {
    const action = await this._getBorrowAction(options);

    return await action.getRequirements();
  }

  /**
   * Quotes the cost of a borrow transaction.
   *
   * @param options - The borrow options.
   * @param config - ERC-4337 transaction config override.
   * @returns The fee quote.
   */
  async quoteBorrow(
    options: MorphoBorrowOptions,
    config?: Erc4337TransactionConfig,
  ): Promise<Omit<BorrowResult, "hash">> {
    const tx = await this._getBorrowTransaction(options);

    return await this._quoteTransaction(tx, config);
  }

  private async _getBorrowAction({
    token,
    amount,
    onBehalfOf,
    slippageTolerance,
    reallocations,
  }: MorphoBorrowOptions) {
    const normalizedAmount = normalizeAmount(amount);
    this._assertAddress("token", token);
    this._assertOptionalAddress("onBehalfOf", onBehalfOf);

    const userAddress = await this._getSdkUserAddress(onBehalfOf);
    const market = await this._getMarket();

    if (!isAddressEqual(market.params.loanToken, token as Address)) {
      throw new Error(
        `Token '${token}' does not match configured market loan token '${market.params.loanToken}'.`,
      );
    }

    const positionData = await market.entity.getPositionData(userAddress);

    return market.entity.borrow({
      amount: normalizedAmount,
      userAddress,
      positionData,
      slippageTolerance: slippageTolerance ?? this._options.slippageTolerance,
      reallocations,
    });
  }

  private async _getBorrowTransaction(
    options: MorphoBorrowOptions,
  ): Promise<WdkTransaction> {
    const action = await this._getBorrowAction(options);

    return toWdkTransaction(action.buildTx());
  }

  /**
   * Repays assets to the configured Morpho Blue market.
   *
   * Pass `amount: "max"` to repay all current borrow shares.
   *
   * @param options - The repay options.
   * @param config - ERC-4337 transaction config override.
   * @returns The repay result.
   * @throws {Error} If the options are invalid, the account lacks funds, or the transaction fails.
   */
  async repay(
    options: MorphoRepayOptions,
    config?: Erc4337TransactionConfig,
  ): Promise<RepayResult> {
    this._assertWritable("repay(options)");
    const amount =
      options.amount === "max" ? "max" : normalizeAmount(options.amount);

    if (amount !== "max") {
      await this._assertTokenBalance(options.token, amount);
    }

    const tx = await this._getRepayTransaction(options, amount);

    return await this._sendTransaction(tx, config);
  }

  /**
   * Returns Morpho SDK requirements for a repay.
   *
   * @param options - The repay options.
   * @param requirementOptions - Optional Morpho SDK requirement options.
   * @returns Approval/signature requirements.
   */
  async getRepayRequirements(
    options: MorphoRepayOptions,
    requirementOptions?: RequirementOptions,
  ): Promise<ApprovalOrSignatureRequirement[]> {
    const action = await this._getRepayAction(options);

    return await action.getRequirements(requirementOptions);
  }

  /**
   * Quotes the cost of a repay transaction.
   *
   * @param options - The repay options.
   * @param config - ERC-4337 transaction config override.
   * @returns The fee quote.
   */
  async quoteRepay(
    options: MorphoRepayOptions,
    config?: Erc4337TransactionConfig,
  ): Promise<Omit<RepayResult, "hash">> {
    const tx = await this._getRepayTransaction(options);

    return await this._quoteTransaction(tx, config);
  }

  private async _getRepayAction(
    { token, amount, onBehalfOf, slippageTolerance }: MorphoRepayOptions,
    normalizedAmount: "max" | bigint = amount === "max"
      ? "max"
      : normalizeAmount(amount),
  ) {
    this._assertAddress("token", token);
    this._assertOptionalAddress("onBehalfOf", onBehalfOf);

    const userAddress = await this._getSdkUserAddress(onBehalfOf);
    const market = await this._getMarket();

    if (!isAddressEqual(market.params.loanToken, token as Address)) {
      throw new Error(
        `Token '${token}' does not match configured market loan token '${market.params.loanToken}'.`,
      );
    }

    const positionData = await market.entity.getPositionData(userAddress);
    const repayAmount =
      normalizedAmount === "max"
        ? { shares: positionData.borrowShares }
        : { assets: normalizedAmount };

    return market.entity.repay({
      ...repayAmount,
      userAddress,
      positionData,
      slippageTolerance: slippageTolerance ?? this._options.slippageTolerance,
    });
  }

  private async _getRepayTransaction(
    options: MorphoRepayOptions,
    amount?: "max" | bigint,
  ): Promise<WdkTransaction> {
    const action = await this._getRepayAction(options, amount);

    return toWdkTransaction(action.buildTx(options.requirementSignature));
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
   * @throws {Error} If the options are invalid, the token does not match the configured market collateral, the account lacks funds, or the transaction fails.
   */
  async supplyCollateral(
    options: MorphoSupplyOptions,
    config?: Erc4337TransactionConfig,
  ): Promise<SupplyResult> {
    this._assertWritable("supplyCollateral(options)");
    const depositAmounts = normalizeDepositAmounts(options);
    if (depositAmounts.amount > 0n) {
      await this._assertTokenBalance(options.token, depositAmounts.amount);
    } else {
      this._assertAddress("token", options.token);
    }

    const tx = await this._getSupplyCollateralTransaction(
      options,
      depositAmounts,
    );

    return await this._sendTransaction(tx, config);
  }

  /**
   * Returns Morpho SDK requirements for supplying collateral.
   *
   * @param options - The collateral supply options.
   * @param requirementOptions - Optional Morpho SDK requirement options.
   * @returns Approval/signature requirements.
   */
  async getSupplyCollateralRequirements(
    options: MorphoSupplyOptions,
    requirementOptions?: RequirementOptions,
  ): Promise<ApprovalOrSignatureRequirement[]> {
    const action = await this._getSupplyCollateralAction(options);

    return await action.getRequirements(requirementOptions);
  }

  /**
   * Quotes the cost of supplying collateral.
   *
   * @param options - The collateral supply options.
   * @param config - ERC-4337 transaction config override.
   * @returns The fee quote.
   */
  async quoteSupplyCollateral(
    options: MorphoSupplyOptions,
    config?: Erc4337TransactionConfig,
  ): Promise<Omit<SupplyResult, "hash">> {
    const tx = await this._getSupplyCollateralTransaction(options);

    return await this._quoteTransaction(tx, config);
  }

  private async _getSupplyCollateralAction(
    { token, amount, nativeAmount, onBehalfOf }: MorphoSupplyOptions,
    depositAmounts: NormalizedDepositAmounts = normalizeDepositAmounts({
      amount,
      nativeAmount,
    }),
  ) {
    this._assertAddress("token", token);
    this._assertOptionalAddress("onBehalfOf", onBehalfOf);

    const userAddress = await this._getSdkUserAddress(onBehalfOf);
    const market = await this._getMarket();

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
    options: MorphoSupplyOptions,
    depositAmounts?: NormalizedDepositAmounts,
  ): Promise<WdkTransaction> {
    const action = await this._getSupplyCollateralAction(
      options,
      depositAmounts,
    );

    return toWdkTransaction(action.buildTx(options.requirementSignature));
  }

  /**
   * Withdraws collateral from the configured Morpho Blue market.
   *
   * @param options - The collateral withdraw options.
   * @param config - ERC-4337 transaction config override.
   * @returns The withdraw collateral result.
   * @throws {Error} If the options are invalid, the token does not match the configured market collateral, or the transaction fails.
   */
  async withdrawCollateral(
    options: WithdrawOptions,
    config?: Erc4337TransactionConfig,
  ): Promise<WithdrawResult> {
    this._assertWritable("withdrawCollateral(options)");

    const tx = await this._getWithdrawCollateralTransaction(options);

    return await this._sendTransaction(tx, config);
  }

  /**
   * Quotes the cost of withdrawing collateral.
   *
   * @param options - The collateral withdraw options.
   * @param config - ERC-4337 transaction config override.
   * @returns The fee quote.
   */
  async quoteWithdrawCollateral(
    options: WithdrawOptions,
    config?: Erc4337TransactionConfig,
  ): Promise<Omit<WithdrawResult, "hash">> {
    const tx = await this._getWithdrawCollateralTransaction(options);

    return await this._quoteTransaction(tx, config);
  }

  private async _getWithdrawCollateralTransaction({
    token,
    amount,
    to,
  }: WithdrawOptions): Promise<WdkTransaction> {
    const normalizedAmount = normalizeAmount(amount);
    this._assertAddress("token", token);
    this._assertOptionalAddress("to", to);

    const userAddress = (await this._evmAccount.getAddress()) as Address;
    const market = await this._getMarket();

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

    return toWdkTransaction(
      market.entity
        .withdrawCollateral({
          amount: normalizedAmount,
          userAddress,
          positionData,
        })
        .buildTx(),
    );
  }

  /**
   * Returns this or another account's configured vault position.
   *
   * @param account - If set, returns the vault position for the given address.
   * @returns The vault position.
   */
  async getVaultPosition(account?: string): Promise<VaultPosition> {
    this._assertOptionalAddress("account", account);

    const userAddress =
      (account as Address | undefined) ??
      ((await this._evmAccount.getAddress()) as Address);
    const vault = await this._getVault();
    const data = await vault.entity.getData();
    const client = await this._getViemClient();
    const shares = await client.readContract({
      address: vault.address,
      abi: erc4626Abi,
      functionName: "balanceOf",
      args: [userAddress],
    });

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
   */
  async getMarketPosition(account?: string): Promise<MarketPosition> {
    this._assertOptionalAddress("account", account);

    const userAddress =
      (account as Address | undefined) ??
      ((await this._evmAccount.getAddress()) as Address);
    const market = await this._getMarket();
    const position = await market.entity.getPositionData(userAddress);

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
   */
  async getAccountData(account?: string): Promise<AccountData> {
    const [vault, market] = await Promise.all([
      this.getVaultPosition(account),
      this.getMarketPosition(account),
    ]);

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

  private async _getVault(): Promise<{
    address: Address;
    entity: ReturnType<MorphoClient["vaultV2"]>;
  }> {
    const target = this._resolveVaultTarget();
    const { address } = target;
    const chainId = await this._getChainId();
    this._assertTargetChain(target, { chainId, label: "Morpho target" });
    const client = await this._getMorphoClient();
    const entity = client.vaultV2(address, chainId);

    return { address, entity };
  }

  private async _getMarket(): Promise<{
    params: MarketParams;
    entity: ReturnType<MorphoClient["marketV1"]>;
  }> {
    const params = await this._getMarketParams();
    const chainId = await this._getChainId();
    const client = await this._getMorphoClient();

    return {
      params,
      entity: client.marketV1(params, chainId),
    };
  }

  private async _getMarketParams(): Promise<MarketParams> {
    const chainId = await this._getChainId();

    if (this._marketParams) return this._marketParams;

    const target = this._resolveMarketTarget();

    this._assertTargetChain(target, { chainId, label: "Morpho target" });

    if ("marketParams" in target) {
      this._marketParams =
        target.marketParams instanceof MarketParams
          ? target.marketParams
          : new MarketParams(target.marketParams);
      return this._marketParams;
    }

    const client = await this._getViemClient();
    const market = await fetchMarket(target.marketId as MarketId, client, {
      chainId,
      deployless: this._options.supportDeployless,
    });

    this._marketParams =
      market.params instanceof MarketParams
        ? market.params
        : new MarketParams(market.params);

    return this._marketParams;
  }

  private async _getMorphoClient(): Promise<MorphoClient> {
    const viemClient = await this._getViemClient();

    if (!this._morphoClient) {
      this._morphoClient = new MorphoClient(viemClient, {
        supportSignature: this._options.supportSignature ?? false,
        supportDeployless: this._options.supportDeployless,
        metadata: this._options.metadata,
      });
    }

    return this._morphoClient;
  }

  private _getViemTransport(): Transport {
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

  private async _getViemClient(): Promise<ViemPublicClient> {
    const address = (await this._evmAccount.getAddress()) as Address;
    const chainId = await this._getChainId();

    if (
      this._viemClient &&
      this._viemClientAccount &&
      isAddressEqual(this._viemClientAccount, address)
    ) {
      return this._viemClient;
    }

    this._viemClient = createClient({
      account: address,
      chain: this._getViemChain(chainId),
      transport: this._getViemTransport(),
    }).extend(publicActions) as ViemPublicClient;
    this._viemClientAccount = address;
    this._morphoClient = undefined;

    return this._viemClient;
  }

  private async _getChainId(): Promise<number> {
    const currentChainId = Number(
      await createClient({
        transport: this._getViemTransport(),
      })
        .extend(publicActions)
        .getChainId(),
    );

    if (this._chainId !== undefined && this._chainId !== currentChainId) {
      this._viemClient = undefined;
      this._viemClientAccount = undefined;
      this._morphoClient = undefined;
      this._marketParams = undefined;
    }

    this._chainId = currentChainId;

    return this._chainId;
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
    args: { chainId: number; label: string },
  ): void {
    if (target.chainId !== undefined && target.chainId !== args.chainId) {
      throw new Error(
        `${args.label} is configured for chain ${target.chainId}, but the connected provider is on chain ${args.chainId}.`,
      );
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
    if (!isWritableAccount(this._evmAccount)) {
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
    onBehalfOf: string | undefined,
  ): Promise<Address> {
    const address = (await this._evmAccount.getAddress()) as Address;

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
    token: string,
    amount: bigint,
  ): Promise<void> {
    this._assertAddress("token", token);
    const balance = await this._evmAccount.getTokenBalance(token);

    if (balance < amount) {
      throw new Error("Not enough funds to fulfill the operation.");
    }
  }

  private async _sendTransaction(
    tx: WdkTransaction,
    config?: Erc4337TransactionConfig,
  ): Promise<SupplyResult> {
    if (isErc4337WritableAccount(this._evmAccount)) {
      return await this._evmAccount.sendTransaction(tx, config);
    }
    if (isWritableAccount(this._evmAccount)) {
      return (await this._evmAccount.sendTransaction(tx)) as SupplyResult;
    }
    throw new Error(
      "The method requires the protocol to be initialized with a non read-only account.",
    );
  }

  private async _quoteTransaction(
    tx: WdkTransaction,
    config?: Erc4337TransactionConfig,
  ): Promise<{ fee: bigint }> {
    const { fee } = isErc4337ReadOnlyAccount(this._evmAccount)
      ? await this._evmAccount.quoteSendTransaction(tx, config)
      : await this._evmAccount.quoteSendTransaction(tx);

    return { fee };
  }
}
