export default class MorphoProtocolEvm extends LendingProtocol {
    /**
     * Creates a new read-only interface to the Morpho protocol for EVM blockchains.
     *
     * @overload
     * @param {WalletAccountReadOnlyEvm | WalletAccountReadOnlyEvmErc4337} account - The wallet account to use to interact with the protocol.
     * @param {MorphoProtocolOptions} [options] - The Morpho target configuration.
     */
    constructor(account: WalletAccountReadOnlyEvm | WalletAccountReadOnlyEvmErc4337, options?: MorphoProtocolOptions);
    /**
     * Creates a new interface to the Morpho protocol for EVM blockchains.
     *
     * @overload
     * @param {WalletAccountEvm | WalletAccountEvmErc4337} account - The wallet account to use to interact with the protocol.
     * @param {MorphoProtocolOptions} [options] - The Morpho target configuration.
     */
    constructor(account: WalletAccountEvm | WalletAccountEvmErc4337, options?: MorphoProtocolOptions);
    /** @private */
    private _options;
    /** @private */
    private _providerSource;
    /** @private */
    private _chainId;
    /** @private */
    private _viemClient;
    /** @private */
    private _viemClientAccount;
    /** @private */
    private _morphoClient;
    /** @private */
    private _marketParams;
    /**
     * Supplies assets into the configured Morpho vault.
     *
     * The transaction is built by `@morpho-org/morpho-sdk`. Use
     * `getSupplyRequirements(options)` first if the account has not approved the
     * required Morpho bundler spender.
     *
     * For direct ERC-20 approvals, use {@link WalletAccountEvm#approve} or
     * {@link WalletAccountEvmErc4337#approve} before calling this method.
     *
     * @param {MorphoSupplyOptions} options - The supply options.
     * @param {Erc4337TransactionConfig} [config] - ERC-4337 transaction config override.
     * @returns {Promise<SupplyResult>} The supply result.
     * @throws {Error} If the options are invalid, the token does not match the configured vault, the account lacks funds, or the transaction fails.
     */
    supply(options: MorphoSupplyOptions, config?: Erc4337TransactionConfig): Promise<SupplyResult>;
    /**
     * Returns Morpho SDK requirements for a vault deposit.
     *
     * @param {MorphoSupplyOptions} options - The supply options.
     * @param {RequirementOptions} [requirementOptions] - Optional Morpho SDK requirement options.
     * @returns {Promise<ApprovalOrSignatureRequirement[]>} Approval/signature requirements.
     */
    getSupplyRequirements(options: MorphoSupplyOptions, requirementOptions?: RequirementOptions): Promise<ApprovalOrSignatureRequirement[]>;
    /**
     * Quotes the cost of a vault deposit transaction.
     *
     * @param {MorphoSupplyOptions} options - The supply options.
     * @param {Erc4337TransactionConfig} [config] - ERC-4337 transaction config override.
     * @returns {Promise<Omit<SupplyResult, 'hash'>>} The fee quote.
     */
    quoteSupply(options: MorphoSupplyOptions, config?: Erc4337TransactionConfig): Promise<Omit<SupplyResult, "hash">>;
    /** @private */
    private _getSupplyAction;
    /** @private */
    private _getSupplyTransaction;
    /**
     * Withdraws assets from the configured Morpho vault.
     *
     * @param {WithdrawOptions} options - The withdraw options.
     * @param {Erc4337TransactionConfig} [config] - ERC-4337 transaction config override.
     * @returns {Promise<WithdrawResult>} The withdraw result.
     * @throws {Error} If the options are invalid, the token does not match the configured vault, or the transaction fails.
     */
    withdraw(options: WithdrawOptions, config?: Erc4337TransactionConfig): Promise<WithdrawResult>;
    /**
     * Quotes the cost of a vault withdraw transaction.
     *
     * @param {WithdrawOptions} options - The withdraw options.
     * @param {Erc4337TransactionConfig} [config] - ERC-4337 transaction config override.
     * @returns {Promise<Omit<WithdrawResult, 'hash'>>} The fee quote.
     */
    quoteWithdraw(options: WithdrawOptions, config?: Erc4337TransactionConfig): Promise<Omit<WithdrawResult, "hash">>;
    /** @private */
    private _getWithdrawTransaction;
    /**
     * Borrows assets from the configured Morpho Blue market.
     *
     * Use `getBorrowRequirements(options)` first if GeneralAdapter1 has not been
     * authorized on Morpho for this account.
     *
     * @param {MorphoBorrowOptions} options - The borrow options.
     * @param {Erc4337TransactionConfig} [config] - ERC-4337 transaction config override.
     * @returns {Promise<BorrowResult>} The borrow result.
     * @throws {Error} If the options are invalid, GeneralAdapter1 is not authorized, or the transaction fails.
     */
    borrow(options: MorphoBorrowOptions, config?: Erc4337TransactionConfig): Promise<BorrowResult>;
    /**
     * Returns Morpho SDK requirements for a borrow.
     *
     * @param {MorphoBorrowOptions} options - The borrow options.
     * @returns {Promise<RequirementAuthorization[]>} Authorization requirements.
     */
    getBorrowRequirements(options: MorphoBorrowOptions): Promise<RequirementAuthorization[]>;
    /**
     * Quotes the cost of a borrow transaction.
     *
     * @param {MorphoBorrowOptions} options - The borrow options.
     * @param {Erc4337TransactionConfig} [config] - ERC-4337 transaction config override.
     * @returns {Promise<Omit<BorrowResult, 'hash'>>} The fee quote.
     */
    quoteBorrow(options: MorphoBorrowOptions, config?: Erc4337TransactionConfig): Promise<Omit<BorrowResult, "hash">>;
    /** @private */
    private _getBorrowAction;
    /** @private */
    private _getBorrowTransaction;
    /**
     * Repays assets to the configured Morpho Blue market.
     *
     * Pass `amount: 'max'` to repay all current borrow shares.
     *
     * @param {MorphoRepayOptions} options - The repay options.
     * @param {Erc4337TransactionConfig} [config] - ERC-4337 transaction config override.
     * @returns {Promise<RepayResult>} The repay result.
     * @throws {Error} If the options are invalid, the account lacks funds, or the transaction fails.
     */
    repay(options: MorphoRepayOptions, config?: Erc4337TransactionConfig): Promise<RepayResult>;
    /**
     * Returns Morpho SDK requirements for a repay.
     *
     * @param {MorphoRepayOptions} options - The repay options.
     * @param {RequirementOptions} [requirementOptions] - Optional Morpho SDK requirement options.
     * @returns {Promise<ApprovalOrSignatureRequirement[]>} Approval/signature requirements.
     */
    getRepayRequirements(options: MorphoRepayOptions, requirementOptions?: RequirementOptions): Promise<ApprovalOrSignatureRequirement[]>;
    /**
     * Quotes the cost of a repay transaction.
     *
     * @param {MorphoRepayOptions} options - The repay options.
     * @param {Erc4337TransactionConfig} [config] - ERC-4337 transaction config override.
     * @returns {Promise<Omit<RepayResult, 'hash'>>} The fee quote.
     */
    quoteRepay(options: MorphoRepayOptions, config?: Erc4337TransactionConfig): Promise<Omit<RepayResult, "hash">>;
    /** @private */
    private _getRepayAction;
    /** @private */
    private _getRepayTransaction;
    /**
     * Supplies collateral to the configured Morpho Blue market.
     *
     * Use `getSupplyCollateralRequirements(options)` first if the account has not approved the required Morpho bundler spender.
     *
     * For direct ERC-20 approvals, use {@link WalletAccountEvm#approve} or
     * {@link WalletAccountEvmErc4337#approve} before calling this method.
     *
     * @param {MorphoSupplyOptions} options - The collateral supply options.
     * @param {Erc4337TransactionConfig} [config] - ERC-4337 transaction config override.
     * @returns {Promise<SupplyResult>} The supply collateral result.
     * @throws {Error} If the options are invalid, the token does not match the configured market collateral, the account lacks funds, or the transaction fails.
     */
    supplyCollateral(options: MorphoSupplyOptions, config?: Erc4337TransactionConfig): Promise<SupplyResult>;
    /**
     * Returns Morpho SDK requirements for supplying collateral.
     *
     * @param {MorphoSupplyOptions} options - The collateral supply options.
     * @param {RequirementOptions} [requirementOptions] - Optional Morpho SDK requirement options.
     * @returns {Promise<ApprovalOrSignatureRequirement[]>} Approval/signature requirements.
     */
    getSupplyCollateralRequirements(options: MorphoSupplyOptions, requirementOptions?: RequirementOptions): Promise<ApprovalOrSignatureRequirement[]>;
    /**
     * Quotes the cost of supplying collateral.
     *
     * @param {MorphoSupplyOptions} options - The collateral supply options.
     * @param {Erc4337TransactionConfig} [config] - ERC-4337 transaction config override.
     * @returns {Promise<Omit<SupplyResult, 'hash'>>} The fee quote.
     */
    quoteSupplyCollateral(options: MorphoSupplyOptions, config?: Erc4337TransactionConfig): Promise<Omit<SupplyResult, "hash">>;
    /** @private */
    private _getSupplyCollateralAction;
    /** @private */
    private _getSupplyCollateralTransaction;
    /**
     * Withdraws collateral from the configured Morpho Blue market.
     *
     * @param {WithdrawOptions} options - The collateral withdraw options.
     * @param {Erc4337TransactionConfig} [config] - ERC-4337 transaction config override.
     * @returns {Promise<WithdrawResult>} The withdraw collateral result.
     * @throws {Error} If the options are invalid, the token does not match the configured market collateral, or the transaction fails.
     */
    withdrawCollateral(options: WithdrawOptions, config?: Erc4337TransactionConfig): Promise<WithdrawResult>;
    /**
     * Quotes the cost of withdrawing collateral.
     *
     * @param {WithdrawOptions} options - The collateral withdraw options.
     * @param {Erc4337TransactionConfig} [config] - ERC-4337 transaction config override.
     * @returns {Promise<Omit<WithdrawResult, 'hash'>>} The fee quote.
     */
    quoteWithdrawCollateral(options: WithdrawOptions, config?: Erc4337TransactionConfig): Promise<Omit<WithdrawResult, "hash">>;
    /** @private */
    private _getWithdrawCollateralTransaction;
    /**
     * Returns this or another account's configured vault position.
     *
     * @param {string} [account] - If set, returns the vault position for the given address.
     * @returns {Promise<VaultPosition>} The vault position.
     */
    getVaultPosition(account?: string): Promise<VaultPosition>;
    /**
     * Returns this or another account's configured market position.
     *
     * @param {string} [account] - If set, returns the market position for the given address.
     * @returns {Promise<MarketPosition>} The market position.
     */
    getMarketPosition(account?: string): Promise<MarketPosition>;
    /**
     * Returns this or another account's configured vault and market data.
     *
     * @param {string} [account] - If set, returns the data for the given address.
     * @returns {Promise<AccountData>} The account data.
     */
    getAccountData(account?: string): Promise<AccountData>;
    /**
     * Returns the configured vault address.
     *
     * @returns {string} The configured vault address.
     */
    getVaultAddress(): string;
    /**
     * Returns the configured borrow market id, if one is available without an on-chain fetch.
     *
     * @returns {string} The configured market id.
     */
    getBorrowMarketId(): string;
    /** @private */
    private _getVault;
    /** @private */
    private _getMarket;
    /** @private */
    private _getMarketParams;
    /** @private */
    private _getMorphoClient;
    /** @private */
    private _getViemTransport;
    /** @private */
    private _getViemChain;
    /** @private */
    private _getViemClient;
    /** @private */
    private _getChainId;
    /** @private */
    private _resolveVaultTarget;
    /** @private */
    private _resolveMarketTarget;
    /** @private */
    private _assertTargetChain;
    /** @private */
    private _validateOptions;
    /** @private */
    private _assertWritable;
    /** @private */
    private _assertAddress;
    /** @private */
    private _assertOptionalAddress;
    /** @private */
    private _getSdkUserAddress;
    /** @private */
    private _assertTokenBalance;
    /** @private */
    private _sendTransaction;
    /** @private */
    private _quoteTransaction;
}
export type InputMarketParams = import("@morpho-org/blue-sdk").InputMarketParams;
export type BorrowOptions = import("@tetherto/wdk-wallet/protocols").BorrowOptions;
export type BorrowResult = import("@tetherto/wdk-wallet/protocols").BorrowResult;
export type SupplyOptions = import("@tetherto/wdk-wallet/protocols").SupplyOptions;
export type SupplyResult = import("@tetherto/wdk-wallet/protocols").SupplyResult;
export type WithdrawOptions = import("@tetherto/wdk-wallet/protocols").WithdrawOptions;
export type WithdrawResult = import("@tetherto/wdk-wallet/protocols").WithdrawResult;
export type RepayOptions = import("@tetherto/wdk-wallet/protocols").RepayOptions;
export type RepayResult = import("@tetherto/wdk-wallet/protocols").RepayResult;
export type WalletAccountReadOnlyEvm = import("@tetherto/wdk-wallet-evm").WalletAccountReadOnlyEvm;
export type EvmErc4337WalletPaymasterTokenConfig = import("@tetherto/wdk-wallet-evm-erc-4337").EvmErc4337WalletPaymasterTokenConfig;
export type EvmErc4337WalletSponsorshipPolicyConfig = import("@tetherto/wdk-wallet-evm-erc-4337").EvmErc4337WalletSponsorshipPolicyConfig;
export type EvmErc4337WalletNativeCoinsConfig = import("@tetherto/wdk-wallet-evm-erc-4337").EvmErc4337WalletNativeCoinsConfig;
export type Erc4337TransactionConfig = Partial<EvmErc4337WalletPaymasterTokenConfig | EvmErc4337WalletSponsorshipPolicyConfig | EvmErc4337WalletNativeCoinsConfig>;
export type RequirementApproval = Readonly<import("@morpho-org/morpho-sdk").Transaction<import("@morpho-org/morpho-sdk").ERC20ApprovalAction>>;
export type RequirementAuthorization = Readonly<import("@morpho-org/morpho-sdk").Transaction<import("@morpho-org/morpho-sdk").MorphoAuthorizationAction>>;
export type RequirementSignatureRequest = import("@morpho-org/morpho-sdk").Requirement;
export type RequirementSignature = import("@morpho-org/morpho-sdk").RequirementSignature;
export type VaultReallocation = import("@morpho-org/morpho-sdk").VaultReallocation;
export type ApprovalOrSignatureRequirement = RequirementApproval | RequirementSignatureRequest;
export type RequirementOptions = {
    /**
     * - Prefer the Morpho SDK simple permit flow when generating approval requirements.
     */
    useSimplePermit?: boolean;
};
export type MorphoErc20SupplyOptions = {
    /**
     * - The ERC-20 token address to supply.
     */
    token: string;
    /**
     * - The ERC-20 amount to supply, in base units.
     */
    amount: number | bigint;
    /**
     * - Optional native token amount to wrap and supply, in base units.
     */
    nativeAmount?: number | bigint;
    /**
     * - The address on behalf of which the supply operation should be performed. Must match the wallet account address when set.
     */
    onBehalfOf?: string;
    /**
     * - Signature returned by a Morpho SDK approval requirement.
     */
    requirementSignature?: RequirementSignature;
    /**
     * - Optional Morpho SDK slippage tolerance in WAD precision.
     */
    slippageTolerance?: bigint;
};
export type MorphoNativeSupplyOptions = {
    /**
     * - The wrapped-native token address expected by the configured vault or market.
     */
    token: string;
    /**
     * - Optional ERC-20 amount to supply, in base units.
     */
    amount?: number | bigint;
    /**
     * - The native token amount to wrap and supply, in base units.
     */
    nativeAmount: number | bigint;
    /**
     * - The address on behalf of which the supply operation should be performed. Must match the wallet account address when set.
     */
    onBehalfOf?: string;
    /**
     * - Signature returned by a Morpho SDK approval requirement.
     */
    requirementSignature?: RequirementSignature;
    /**
     * - Optional Morpho SDK slippage tolerance in WAD precision.
     */
    slippageTolerance?: bigint;
};
export type MorphoSupplyOptions = MorphoErc20SupplyOptions | MorphoNativeSupplyOptions;
export type MorphoBorrowOptions = {
    /**
     * - The address of the token to borrow.
     */
    token: string;
    /**
     * - The amount of tokens to borrow, in base units.
     */
    amount: number | bigint;
    /**
     * - The address on behalf of which the borrow operation should be performed. Must match the wallet account address when set.
     */
    onBehalfOf?: string;
    /**
     * - Optional Morpho Vault V2 reallocations to include in the borrow action.
     */
    reallocations?: readonly VaultReallocation[];
    /**
     * - Optional Morpho SDK slippage tolerance in WAD precision.
     */
    slippageTolerance?: bigint;
};
export type MorphoRepayOptions = {
    /**
     * - The address of the token to repay.
     */
    token: string;
    /**
     * - The repayment amount, in base units, or `max` to repay all current borrow shares.
     */
    amount: number | bigint | "max";
    /**
     * - The address on behalf of which the repay operation should be performed. Must match the wallet account address when set.
     */
    onBehalfOf?: string;
    /**
     * - Signature returned by a Morpho SDK approval requirement.
     */
    requirementSignature?: RequirementSignature;
    /**
     * - Optional Morpho SDK slippage tolerance in WAD precision.
     */
    slippageTolerance?: bigint;
};
export type Presets = {
    /**
     * - Key of a curated Morpho Vault V2 preset in `MORPHO_VAULT_PRESETS`.
     */
    earn?: string;
    /**
     * - Key of a curated Morpho Blue market preset in `MORPHO_MARKET_PRESETS`.
     */
    borrow?: string;
};
export type VaultPosition = {
    /**
     * - The account's vault share balance.
     */
    shares: bigint;
    /**
     * - The account's vault position converted to underlying assets using current vault data.
     */
    assets: bigint;
    /**
     * - The configured vault address.
     */
    vaultAddress: string;
};
export type MarketPosition = {
    /**
     * - The account's Morpho market supply shares.
     */
    supplyShares: bigint;
    /**
     * - The account's Morpho market borrow shares.
     */
    borrowShares: bigint;
    /**
     * - The account's current borrow assets after accrual.
     */
    borrowAssets: bigint;
    /**
     * - The account's collateral supplied to the market.
     */
    collateral: bigint;
    /**
     * - The configured market id.
     */
    marketId: string;
};
export type AccountData = {
    /**
     * - The account's configured vault share balance.
     */
    vaultShares: bigint;
    /**
     * - The account's configured vault balance in underlying assets.
     */
    vaultAssets: bigint;
    /**
     * - The account's configured market supply shares.
     */
    marketSupplyShares: bigint;
    /**
     * - The account's configured market borrow shares.
     */
    marketBorrowShares: bigint;
    /**
     * - The account's configured market borrow assets.
     */
    marketBorrowAssets: bigint;
    /**
     * - The account's configured market collateral.
     */
    collateral: bigint;
    /**
     * - The configured vault address.
     */
    vaultAddress: string;
    /**
     * - The configured market id.
     */
    marketId: string;
};
export type MorphoProtocolOptions = {
    /**
     * - Explicit Morpho vault address. Takes priority over `presets.earn`.
     */
    earnVaultAddress?: string;
    /**
     * - Explicit market id. If `borrowMarketParams` is not provided, params are fetched on-chain.
     */
    borrowMarketId?: string;
    /**
     * - Explicit Morpho Blue market params. Takes priority over `borrowMarketId` and `presets.borrow`.
     */
    borrowMarketParams?: InputMarketParams;
    /**
     * - Curated target names for Ethereum USDT earn/borrow.
     */
    presets?: Presets;
    /**
     * - Required when explicit Morpho targets are used; guards against wallet chain switches.
     */
    chainId?: number | bigint;
    /**
     * - Optional Morpho SDK slippage tolerance in WAD precision.
     */
    slippageTolerance?: bigint;
    /**
     * - Enable Morpho SDK permit/permit2 requirements (default: false).
     */
    supportSignature?: boolean;
    /**
     * - Enable Morpho SDK deployless reads (default: false).
     */
    supportDeployless?: boolean;
};
import { LendingProtocol } from '@tetherto/wdk-wallet/protocols';
import { WalletAccountReadOnlyEvmErc4337 } from '@tetherto/wdk-wallet-evm-erc-4337';
import { WalletAccountEvm } from '@tetherto/wdk-wallet-evm';
import { WalletAccountEvmErc4337 } from '@tetherto/wdk-wallet-evm-erc-4337';
