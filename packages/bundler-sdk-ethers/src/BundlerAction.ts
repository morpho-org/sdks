import type { BigNumberish, BytesLike, Signature } from "ethers";

import {
  AaveV2MigrationBundlerV2__factory,
  AaveV3MigrationBundlerV2__factory,
  AaveV3OptimizerMigrationBundlerV2__factory,
  CompoundV2MigrationBundlerV2__factory,
  CompoundV3MigrationBundlerV2__factory,
  ERC20WrapperBundler__factory,
  ERC4626Bundler__factory,
  EthereumPermitBundler__factory,
  MorphoBundler__factory,
  Permit2Bundler__factory,
  PermitBundler__factory,
  StEthBundler__factory,
  TransferBundler__factory,
  UrdBundler__factory,
  WNativeBundler__factory,
} from "./types";
import type {
  AuthorizationStruct,
  MarketParamsStruct,
  WithdrawalStruct,
} from "./types/MorphoBundler";
import type { IAllowanceTransfer } from "./types/Permit2Bundler";

export type BundlerCall = string;

const TRANSFER_BUNDLER_IFC = TransferBundler__factory.createInterface();
const PERMIT_BUNDLER_IFC = PermitBundler__factory.createInterface();
const PERMIT2_BUNDLER_IFC = Permit2Bundler__factory.createInterface();
const ERC20_WRAPPER_BUNDLER_IFC =
  ERC20WrapperBundler__factory.createInterface();
const ERC4626_BUNDLER_IFC = ERC4626Bundler__factory.createInterface();
const MORPHO_BUNDLER_IFC = MorphoBundler__factory.createInterface();
const URD_BUNDLER_IFC = UrdBundler__factory.createInterface();
const WNATIVE_BUNDLER_IFC = WNativeBundler__factory.createInterface();
const ST_ETH_BUNDLER_IFC = StEthBundler__factory.createInterface();
const ETHEREUM_PERMIT_BUNDLER_IFC =
  EthereumPermitBundler__factory.createInterface();

const AAVE_V2_BUNDLER_IFC = AaveV2MigrationBundlerV2__factory.createInterface();
const AAVE_V3_BUNDLER_IFC = AaveV3MigrationBundlerV2__factory.createInterface();
const AAVE_V3_OPTIMIZER_BUNDLER_IFC =
  AaveV3OptimizerMigrationBundlerV2__factory.createInterface();
const COMPOUND_V2_BUNDLER_IFC =
  CompoundV2MigrationBundlerV2__factory.createInterface();
const COMPOUND_V3_BUNDLER_IFC =
  CompoundV3MigrationBundlerV2__factory.createInterface();

/**
 * Namespace to easily encode calls to the Bundler contract, using ethers.
 */
export namespace BundlerAction {
  /* ERC20 */

  /**
   * Encodes a call to the Bundler to transfer native tokens (ETH on ethereum, MATIC on polygon, etc).
   * @param recipient The address to send native tokens to.
   * @param amount The amount of native tokens to send (in wei).
   */
  export function nativeTransfer(
    recipient: string,
    amount: BigNumberish,
  ): BundlerCall {
    return TRANSFER_BUNDLER_IFC.encodeFunctionData("nativeTransfer", [
      recipient,
      amount,
    ]);
  }

  /**
   * Encodes a call to the Bundler to transfer ERC20 tokens.
   * @param asset The address of the ERC20 token to transfer.
   * @param recipient The address to send tokens to.
   * @param amount The amount of tokens to send.
   */
  export function erc20Transfer(
    asset: string,
    recipient: string,
    amount: BigNumberish,
  ): BundlerCall {
    return TRANSFER_BUNDLER_IFC.encodeFunctionData("erc20Transfer", [
      asset,
      recipient,
      amount,
    ]);
  }

  /**
   * Encodes a call to the Bundler to transfer ERC20 tokens from the sender to the Bundler.
   * @param asset The address of the ERC20 token to transfer.
   * @param amount The amount of tokens to send.
   */
  export function erc20TransferFrom(
    asset: string,
    amount: BigNumberish,
  ): BundlerCall {
    return TRANSFER_BUNDLER_IFC.encodeFunctionData("erc20TransferFrom", [
      asset,
      amount,
    ]);
  }

  /* Permit */

  /**
   * Encodes a call to the Bundler to permit an ERC20 token.
   * @param asset The address of the ERC20 token to permit.
   * @param amount The amount of tokens to permit.
   * @param deadline The timestamp until which the signature is valid.
   * @param signature The Ethers signature to permit the tokens.
   * @param skipRevert Whether to allow the permit to revert without making the whole multicall revert.
   */
  export function permit(
    asset: string,
    amount: BigNumberish,
    deadline: BigNumberish,
    signature: Signature,
    skipRevert: boolean,
  ): BundlerCall {
    return PERMIT_BUNDLER_IFC.encodeFunctionData("permit", [
      asset,
      amount,
      deadline,
      signature.v,
      signature.r,
      signature.s,
      skipRevert,
    ]);
  }

  /**
   * Encodes a call to the Bundler to permit DAI.
   * @param nonce The permit nonce used.
   * @param expiry The timestamp until which the signature is valid.
   * @param allowed The amount of DAI to permit.
   * @param signature The Ethers signature to permit the tokens.
   * @param skipRevert Whether to allow the permit to revert without making the whole multicall revert.
   */
  export function permitDai(
    nonce: BigNumberish,
    expiry: BigNumberish,
    allowed: boolean,
    signature: Signature,
    skipRevert: boolean,
  ): BundlerCall {
    return ETHEREUM_PERMIT_BUNDLER_IFC.encodeFunctionData("permitDai", [
      nonce,
      expiry,
      allowed,
      signature.v,
      signature.r,
      signature.s,
      skipRevert,
    ]);
  }

  /* Permit2 */

  /**
   * Encodes a call to the Bundler to permit ERC20 tokens via Permit2.
   * @param permitSingle The permit details to submit to Permit2.
   * @param signature The Ethers signature to permit the tokens.
   * @param skipRevert Whether to allow the permit to revert without making the whole multicall revert.
   */
  export function approve2(
    permitSingle: IAllowanceTransfer.PermitSingleStruct,
    signature: Signature,
    skipRevert: boolean,
  ): BundlerCall {
    return PERMIT2_BUNDLER_IFC.encodeFunctionData("approve2", [
      permitSingle,
      signature.serialized,
      skipRevert,
    ]);
  }

  /**
   * Encodes a call to the Bundler to transfer ERC20 tokens via Permit2 from the sender to the Bundler.
   * @param asset The address of the ERC20 token to transfer.
   * @param amount The amount of tokens to send.
   */
  export function transferFrom2(
    asset: string,
    amount: BigNumberish,
  ): BundlerCall {
    return PERMIT2_BUNDLER_IFC.encodeFunctionData("transferFrom2", [
      asset,
      amount,
    ]);
  }

  /* ERC20 Wrapper */

  /**
   * Encodes a call to the Bundler to wrap ERC20 tokens via the provided ERC20Wrapper.
   * @param wrapper The address of the ERC20 wrapper token.
   * @param amount The amount of tokens to send.
   */
  export function erc20WrapperDepositFor(
    wrapper: string,
    amount: BigNumberish,
  ): BundlerCall {
    return ERC20_WRAPPER_BUNDLER_IFC.encodeFunctionData(
      "erc20WrapperDepositFor",
      [wrapper, amount],
    );
  }

  /**
   * Encodes a call to the Bundler to unwrap ERC20 tokens from the provided ERC20Wrapper.
   * @param wrapper The address of the ERC20 wrapper token.
   * @param account The address to send the underlying ERC20 tokens.
   * @param amount The amount of tokens to send.
   */
  export function erc20WrapperWithdrawTo(
    wrapper: string,
    account: string,
    amount: BigNumberish,
  ): BundlerCall {
    return ERC20_WRAPPER_BUNDLER_IFC.encodeFunctionData(
      "erc20WrapperWithdrawTo",
      [wrapper, account, amount],
    );
  }

  /* ERC4626 */

  /**
   * Encodes a call to the Bundler to mint shares of the provided ERC4626 vault.
   * @param erc4626 The address of the ERC4626 vault.
   * @param shares The amount of shares to mint.
   * @param maxAssets The maximum amount of assets to deposit (protects the sender from unexpected slippage).
   * @param receiver The address to send the shares to.
   */
  export function erc4626Mint(
    erc4626: string,
    shares: BigNumberish,
    maxAssets: BigNumberish,
    receiver: string,
  ): BundlerCall {
    return ERC4626_BUNDLER_IFC.encodeFunctionData("erc4626Mint", [
      erc4626,
      shares,
      maxAssets,
      receiver,
    ]);
  }

  /**
   * Encodes a call to the Bundler to deposit assets into the provided ERC4626 vault.
   * @param erc4626 The address of the ERC4626 vault.
   * @param assets The amount of assets to deposit.
   * @param minShares The minimum amount of shares to mint (protects the sender from unexpected slippage).
   * @param receiver The address to send the shares to.
   */
  export function erc4626Deposit(
    erc4626: string,
    assets: BigNumberish,
    minShares: BigNumberish,
    receiver: string,
  ): BundlerCall {
    return ERC4626_BUNDLER_IFC.encodeFunctionData("erc4626Deposit", [
      erc4626,
      assets,
      minShares,
      receiver,
    ]);
  }

  /**
   * Encodes a call to the Bundler to withdraw assets from the provided ERC4626 vault.
   * @param erc4626 The address of the ERC4626 vault.
   * @param assets The amount of assets to withdraw.
   * @param maxShares The maximum amount of shares to redeem (protects the sender from unexpected slippage).
   * @param receiver The address to send the assets to.
   */
  export function erc4626Withdraw(
    erc4626: string,
    assets: BigNumberish,
    maxShares: BigNumberish,
    receiver: string,
    owner: string,
  ): BundlerCall {
    return ERC4626_BUNDLER_IFC.encodeFunctionData("erc4626Withdraw", [
      erc4626,
      assets,
      maxShares,
      receiver,
      owner,
    ]);
  }

  /**
   * Encodes a call to the Bundler to redeem shares from the provided ERC4626 vault.
   * @param erc4626 The address of the ERC4626 vault.
   * @param shares The amount of shares to redeem.
   * @param minAssets The minimum amount of assets to withdraw (protects the sender from unexpected slippage).
   * @param receiver The address to send the assets to.
   */
  export function erc4626Redeem(
    erc4626: string,
    shares: BigNumberish,
    minAssets: BigNumberish,
    receiver: string,
    owner: string,
  ): BundlerCall {
    return ERC4626_BUNDLER_IFC.encodeFunctionData("erc4626Redeem", [
      erc4626,
      shares,
      minAssets,
      receiver,
      owner,
    ]);
  }

  /* Morpho */

  /**
   * Encodes a call to the Bundler to authorize an account on Morpho Blue.
   * @param authorization The authorization details to submit to Morpho Blue.
   * @param signature The Ethers signature to authorize the account.
   * @param skipRevert Whether to allow the authorization call to revert without making the whole multicall revert.
   */
  export function morphoSetAuthorizationWithSig(
    authorization: AuthorizationStruct,
    signature: Signature,
    skipRevert: boolean,
  ): BundlerCall {
    return MORPHO_BUNDLER_IFC.encodeFunctionData(
      "morphoSetAuthorizationWithSig",
      [
        authorization,
        { v: signature.v, r: signature.r, s: signature.s },
        skipRevert,
      ],
    );
  }

  /**
   * Encodes a call to the Bundler to supply to a Morpho Blue market.
   * @param market The market params to supply to.
   * @param assets The amount of assets to supply.
   * @param shares The amount of supply shares to mint.
   * @param slippageAmount The maximum (resp. minimum) amount of assets (resp. supply shares) to supply (resp. mint) (protects the sender from unexpected slippage).
   * @param onBehalf The address to supply on behalf of.
   * @param callbackCalls The array of calls to execute inside Morpho Blue's `onMorphoSupply` callback.
   */
  export function morphoSupply(
    market: MarketParamsStruct,
    assets: BigNumberish,
    shares: BigNumberish,
    slippageAmount: BigNumberish,
    onBehalf: string,
    callbackCalls: BundlerCall[],
  ): BundlerCall {
    return MORPHO_BUNDLER_IFC.encodeFunctionData("morphoSupply", [
      market,
      assets,
      shares,
      slippageAmount,
      onBehalf,
      MORPHO_BUNDLER_IFC.getAbiCoder().encode(["bytes[]"], [callbackCalls]),
    ]);
  }

  /**
   * Encodes a call to the Bundler to supply collateral to a Morpho Blue market.
   * @param market The market params to supply to.
   * @param assets The amount of assets to supply.
   * @param onBehalf The address to supply on behalf of.
   * @param callbackCalls The array of calls to execute inside Morpho Blue's `onMorphoSupplyCollateral` callback.
   */
  export function morphoSupplyCollateral(
    market: MarketParamsStruct,
    assets: BigNumberish,
    onBehalf: string,
    callbackCalls: BundlerCall[],
  ): BundlerCall {
    return MORPHO_BUNDLER_IFC.encodeFunctionData("morphoSupplyCollateral", [
      market,
      assets,
      onBehalf,
      MORPHO_BUNDLER_IFC.getAbiCoder().encode(["bytes[]"], [callbackCalls]),
    ]);
  }

  /**
   * Encodes a call to the Bundler to borrow from a Morpho Blue market.
   * @param market The market params to borrow from.
   * @param assets The amount of assets to borrow.
   * @param shares The amount of borrow shares to mint.
   * @param slippageAmount The minimum (resp. maximum) amount of assets (resp. borrow shares) to borrow (resp. mint) (protects the sender from unexpected slippage).
   * @param receiver The address to send borrowed tokens to.
   */
  export function morphoBorrow(
    market: MarketParamsStruct,
    assets: BigNumberish,
    shares: BigNumberish,
    slippageAmount: BigNumberish,
    receiver: string,
  ): BundlerCall {
    return MORPHO_BUNDLER_IFC.encodeFunctionData("morphoBorrow", [
      market,
      assets,
      shares,
      slippageAmount,
      receiver,
    ]);
  }

  /**
   * Encodes a call to the Bundler to repay to a Morpho Blue market.
   * @param market The market params to repay to.
   * @param assets The amount of assets to repay.
   * @param shares The amount of borrow shares to redeem.
   * @param slippageAmount The maximum (resp. minimum) amount of assets (resp. borrow shares) to repay (resp. redeem) (protects the sender from unexpected slippage).
   * @param onBehalf The address to repay on behalf of.
   * @param callbackCalls The array of calls to execute inside Morpho Blue's `onMorphoSupply` callback.
   */
  export function morphoRepay(
    market: MarketParamsStruct,
    assets: BigNumberish,
    shares: BigNumberish,
    slippageAmount: BigNumberish,
    onBehalf: string,
    callbackCalls: BundlerCall[],
  ): BundlerCall {
    return MORPHO_BUNDLER_IFC.encodeFunctionData("morphoRepay", [
      market,
      assets,
      shares,
      slippageAmount,
      onBehalf,
      MORPHO_BUNDLER_IFC.getAbiCoder().encode(["bytes[]"], [callbackCalls]),
    ]);
  }

  /**
   * Encodes a call to the Bundler to withdraw from a Morpho Blue market.
   * @param market The market params to withdraw from.
   * @param assets The amount of assets to withdraw.
   * @param shares The amount of supply shares to redeem.
   * @param slippageAmount The minimum (resp. maximum) amount of assets (resp. supply shares) to withdraw (resp. redeem) (protects the sender from unexpected slippage).
   * @param receiver The address to send withdrawn tokens to.
   */
  export function morphoWithdraw(
    market: MarketParamsStruct,
    assets: BigNumberish,
    shares: BigNumberish,
    slippageAmount: BigNumberish,
    receiver: string,
  ): BundlerCall {
    return MORPHO_BUNDLER_IFC.encodeFunctionData("morphoWithdraw", [
      market,
      assets,
      shares,
      slippageAmount,
      receiver,
    ]);
  }

  /**
   * Encodes a call to the Bundler to withdraw collateral from a Morpho Blue market.
   * @param market The market params to withdraw from.
   * @param assets The amount of assets to withdraw.
   * @param receiver The address to send withdrawn tokens to.
   */
  export function morphoWithdrawCollateral(
    market: MarketParamsStruct,
    assets: BigNumberish,
    receiver: string,
  ): BundlerCall {
    return MORPHO_BUNDLER_IFC.encodeFunctionData("morphoWithdrawCollateral", [
      market,
      assets,
      receiver,
    ]);
  }

  /**
   * Encodes a call to the Bundler to flash loan from Morpho Blue.
   * @param asset The address of the ERC20 token to flash loan.
   * @param amount The amount of tokens to flash loan.
   * @param callbackCalls The array of calls to execute inside Morpho Blue's `onMorphoFlashLoan` callback.
   */
  export function morphoFlashLoan(
    asset: string,
    amount: BigNumberish,
    callbackCalls: BundlerCall[],
  ): BundlerCall {
    return MORPHO_BUNDLER_IFC.encodeFunctionData("morphoFlashLoan", [
      asset,
      amount,
      MORPHO_BUNDLER_IFC.getAbiCoder().encode(["bytes[]"], [callbackCalls]),
    ]);
  }

  /**
   * Encodes a call to the Bundler to trigger a public reallocation on the PublicAllocator.
   * @param publicAllocator The address of the PublicAllocator to use.
   * @param vault The vault to reallocate.
   * @param value The value of the call. Can be used to pay the vault reallocation fees.
   * @param withdrawals The array of withdrawals to perform, before supplying everything to the supply market.
   * @param supplyMarketParams The market params to reallocate to.
   */
  export function metaMorphoReallocateTo(
    publicAllocator: string,
    vault: string,
    value: BigNumberish,
    withdrawals: WithdrawalStruct[],
    supplyMarketParams: MarketParamsStruct,
  ): BundlerCall {
    return MORPHO_BUNDLER_IFC.encodeFunctionData("reallocateTo", [
      publicAllocator,
      vault,
      value,
      withdrawals,
      supplyMarketParams,
    ]);
  }

  /* Universal Rewards Distributor */

  /**
   * Encodes a call to the Bundler to claim rewards from the Universal Rewards Distributor.
   * @param distributor The address of the distributor to claim rewards from.
   * @param account The address to claim rewards for.
   * @param reward The address of the reward token to claim.
   * @param amount The amount of rewards to claim.
   * @param proof The Merkle proof to claim the rewards.
   * @param skipRevert Whether to allow the claim to revert without making the whole multicall revert.
   */
  export function urdClaim(
    distributor: string,
    account: string,
    reward: string,
    amount: BigNumberish,
    proof: BytesLike[],
    skipRevert: boolean,
  ): BundlerCall {
    return URD_BUNDLER_IFC.encodeFunctionData("urdClaim", [
      distributor,
      account,
      reward,
      amount,
      proof,
      skipRevert,
    ]);
  }

  /* Wrapped Native */

  /**
   * Encodes a call to the Bundler to wrap native tokens (ETH to WETH on ethereum, MATIC to WMATIC on polygon, etc).
   * @param amount The amount of native tokens to wrap (in wei).
   */
  export function wrapNative(amount: BigNumberish): BundlerCall {
    return WNATIVE_BUNDLER_IFC.encodeFunctionData("wrapNative", [amount]);
  }

  /**
   * Encodes a call to the Bundler to unwrap native tokens (WETH to ETH on ethereum, WMATIC to MATIC on polygon, etc).
   * @param amount The amount of native tokens to unwrap (in wei).
   */
  export function unwrapNative(amount: BigNumberish): BundlerCall {
    return WNATIVE_BUNDLER_IFC.encodeFunctionData("unwrapNative", [amount]);
  }

  /* stETH */

  /**
   * Encodes a call to the Bundler to stake native tokens using Lido (ETH to stETH on ethereum).
   * @param amount The amount of native tokens to stake (in wei).
   * @param minShares The minimum amount of shares to mint (protects the sender from unexpected slippage).
   * @param referral The referral address to use.
   */
  export function stakeEth(
    amount: BigNumberish,
    minShares: BigNumberish,
    referral: string,
  ): BundlerCall {
    return ST_ETH_BUNDLER_IFC.encodeFunctionData("stakeEth", [
      amount,
      minShares,
      referral,
    ]);
  }

  /* Wrapped stETH */

  /**
   * Encodes a call to the Bundler to wrap stETH (stETH to wstETH on ethereum).
   * @param amount The amount of stETH to wrap (in wei).
   */
  export function wrapStEth(amount: BigNumberish): BundlerCall {
    return ST_ETH_BUNDLER_IFC.encodeFunctionData("wrapStEth", [amount]);
  }

  /**
   * Encodes a call to the Bundler to unwrap wstETH (wstETH to stETH on ethereum).
   * @param amount The amount of wstETH to unwrap (in wei).
   */
  export function unwrapStEth(amount: BigNumberish): BundlerCall {
    return ST_ETH_BUNDLER_IFC.encodeFunctionData("unwrapStEth", [amount]);
  }

  /* AaveV2 */

  /**
   * ! Only available on AaveV2MigrationBundler instances (not the main Bundler contract!).
   * Encodes a call to the Bundler to repay a debt on AaveV2.
   * @param asset The debt asset to repay.
   * @param amount The amount of debt to repay.
   * @param rateMode The interest rate mode used by the debt to repay.
   */
  export function aaveV2Repay(
    asset: string,
    amount: BigNumberish,
    rateMode: BigNumberish,
  ): BundlerCall {
    return AAVE_V2_BUNDLER_IFC.encodeFunctionData("aaveV2Repay", [
      asset,
      amount,
      rateMode,
    ]);
  }

  /**
   * ! Only available on AaveV2MigrationBundler instances (not the main Bundler contract!).
   * Encodes a call to the Bundler to withdrawn from AaveV2.
   * @param asset The asset to withdraw.
   * @param amount The amount of asset to withdraw.
   */
  export function aaveV2Withdraw(
    asset: string,
    amount: BigNumberish,
  ): BundlerCall {
    return AAVE_V2_BUNDLER_IFC.encodeFunctionData("aaveV2Withdraw", [
      asset,
      amount,
    ]);
  }

  /* AaveV3 */

  /**
   * ! Only available on AaveV3MigrationBundler instances (not the main Bundler contract!).
   * Encodes a call to the Bundler to repay a debt on AaveV3.
   * @param asset The debt asset to repay.
   * @param amount The amount of debt to repay.
   * @param rateMode The interest rate mode used by the debt to repay.
   */
  export function aaveV3Repay(
    asset: string,
    amount: BigNumberish,
    rateMode: BigNumberish,
  ): BundlerCall {
    return AAVE_V3_BUNDLER_IFC.encodeFunctionData("aaveV3Repay", [
      asset,
      amount,
      rateMode,
    ]);
  }

  /**
   * ! Only available on AaveV3MigrationBundler instances (not the main Bundler contract!).
   * Encodes a call to the Bundler to withdrawn from AaveV3.
   * @param asset The asset to withdraw.
   * @param amount The amount of asset to withdraw.
   */
  export function aaveV3Withdraw(
    asset: string,
    amount: BigNumberish,
  ): BundlerCall {
    return AAVE_V3_BUNDLER_IFC.encodeFunctionData("aaveV3Withdraw", [
      asset,
      amount,
    ]);
  }

  /* AaveV3 Optimizer */

  /**
   * ! Only available on AaveV3OptimizerMigrationBundler instances (not the main Bundler contract!).
   * Encodes a call to the Bundler to repay a debt on Morpho's AaveV3Optimizer.
   * @param underlying The underlying debt asset to repay.
   * @param amount The amount of debt to repay.
   * @param maxIterations The maximum amount of iterations to use for the repayment.
   */
  export function aaveV3OptimizerRepay(
    underlying: string,
    amount: BigNumberish,
  ): BundlerCall {
    return AAVE_V3_OPTIMIZER_BUNDLER_IFC.encodeFunctionData(
      "aaveV3OptimizerRepay",
      [underlying, amount],
    );
  }

  /**
   * ! Only available on AaveV3OptimizerMigrationBundler instances (not the main Bundler contract!).
   * Encodes a call to the Bundler to withdraw from Morpho's AaveV3Optimizer.
   * @param underlying The underlying asset to withdraw.
   * @param amount The amount to withdraw.
   * @param maxIterations The maximum amount of iterations to use for the withdrawal.
   */
  export function aaveV3OptimizerWithdraw(
    underlying: string,
    amount: BigNumberish,
    maxIterations: BigNumberish,
  ): BundlerCall {
    return AAVE_V3_OPTIMIZER_BUNDLER_IFC.encodeFunctionData(
      "aaveV3OptimizerWithdraw",
      [underlying, amount, maxIterations],
    );
  }

  /**
   * ! Only available on AaveV3OptimizerMigrationBundler instances (not the main Bundler contract!).
   * Encodes a call to the Bundler to withdraw collateral from Morpho's AaveV3Optimizer.
   * @param underlying The underlying asset to withdraw.
   * @param amount The amount to withdraw.
   */
  export function aaveV3OptimizerWithdrawCollateral(
    underlying: string,
    amount: BigNumberish,
  ): BundlerCall {
    return AAVE_V3_OPTIMIZER_BUNDLER_IFC.encodeFunctionData(
      "aaveV3OptimizerWithdrawCollateral",
      [underlying, amount],
    );
  }

  /**
   * ! Only available on AaveV3OptimizerMigrationBundler instances (not the main Bundler contract!).
   * Encodes a call to the Bundler to approve the Bundler as the sender's manager on Morpho's AaveV3Optimizer.
   * @param isApproved Whether the manager is approved.
   * @param nonce The nonce used to sign.
   * @param deadline The timestamp until which the signature is valid.
   * @param signature The Ethers signature to submit.
   * @param skipRevert Whether to allow the signature to revert without making the whole multicall revert.
   */
  export function aaveV3OptimizerApproveManagerWithSig(
    isApproved: boolean,
    nonce: BigNumberish,
    deadline: BigNumberish,
    signature: Signature,
    skipRevert: boolean,
  ): BundlerCall {
    return AAVE_V3_OPTIMIZER_BUNDLER_IFC.encodeFunctionData(
      "aaveV3OptimizerApproveManagerWithSig",
      [
        isApproved,
        nonce,
        deadline,
        { v: signature.v, r: signature.r, s: signature.s },
        skipRevert,
      ],
    );
  }

  /* CompoundV2 */

  /**
   * ! Only available on CompoundV2MigrationBundler instances (not the main Bundler contract!).
   * Encodes a call to the Bundler to repay a debt on CompoundV2.
   * @param cToken The cToken on which to repay the debt.
   * @param amount The amount of debt to repay.
   */
  export function compoundV2Repay(
    cToken: string,
    amount: BigNumberish,
  ): BundlerCall {
    return COMPOUND_V2_BUNDLER_IFC.encodeFunctionData("compoundV2Repay", [
      cToken,
      amount,
    ]);
  }

  /**
   * ! Only available on CompoundV2MigrationBundler instances (not the main Bundler contract!).
   * Encodes a call to the Bundler to withdraw collateral from CompoundV2.
   * @param cToken The cToken on which to withdraw.
   * @param amount The amount to withdraw.
   */
  export function compoundV2Redeem(
    cToken: string,
    amount: BigNumberish,
  ): BundlerCall {
    return COMPOUND_V2_BUNDLER_IFC.encodeFunctionData("compoundV2Redeem", [
      cToken,
      amount,
    ]);
  }

  /* CompoundV3 */

  /**
   * ! Only available on CompoundV3MigrationBundler instances (not the main Bundler contract!).
   * Encodes a call to the Bundler to repay a debt on CompoundV3.
   * @param instance The CompoundV3 instance on which to repay the debt.
   * @param amount The amount of debt to repay.
   */
  export function compoundV3Repay(
    instance: string,
    amount: BigNumberish,
  ): BundlerCall {
    return COMPOUND_V3_BUNDLER_IFC.encodeFunctionData("compoundV3Repay", [
      instance,
      amount,
    ]);
  }

  /**
   * ! Only available on CompoundV3MigrationBundler instances (not the main Bundler contract!).
   * Encodes a call to the Bundler to withdraw collateral from CompoundV3.
   * @param instance The CompoundV3 instance on which to withdraw.
   * @param amount The amount to withdraw.
   */
  export function compoundV3WithdrawFrom(
    instance: string,
    asset: string,
    amount: BigNumberish,
  ): BundlerCall {
    return COMPOUND_V3_BUNDLER_IFC.encodeFunctionData(
      "compoundV3WithdrawFrom",
      [instance, asset, amount],
    );
  }

  /**
   * ! Only available on CompoundV3MigrationBundler instances (not the main Bundler contract!).
   * Encodes a call to the Bundler to allow the Bundler to act on the sender's position on CompoundV3.
   * @param instance The CompoundV3 instance on which to submit the signature.
   * @param isAllowed Whether the manager is allowed.
   * @param nonce The nonce used to sign.
   * @param expiry The timestamp until which the signature is valid.
   * @param signature The Ethers signature to submit.
   * @param skipRevert Whether to allow the signature to revert without making the whole multicall revert.
   */
  export function compoundV3AllowBySig(
    instance: string,
    isAllowed: boolean,
    nonce: BigNumberish,
    expiry: BigNumberish,
    signature: Signature,
    skipRevert: boolean,
  ): BundlerCall {
    return COMPOUND_V3_BUNDLER_IFC.encodeFunctionData("compoundV3AllowBySig", [
      instance,
      isAllowed,
      nonce,
      expiry,
      signature.v,
      signature.r,
      signature.s,
      skipRevert,
    ]);
  }
}

export default BundlerAction;
