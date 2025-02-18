import {
  aaveV2MigrationAdapterAbi,
  aaveV3MigrationAdapterAbi,
  aaveV3OptimizerMigrationAdapterAbi,
  bundler3Abi,
  compoundV2MigrationAdapterAbi,
  compoundV3MigrationAdapterAbi,
  coreAdapterAbi,
  erc20WrapperAdapterAbi,
  ethereumGeneralAdapter1Abi,
  generalAdapter1Abi,
  universalRewardsDistributorAbi,
} from "./abis.js";

import {
  type ChainId,
  type InputMarketParams,
  getChainAddresses,
} from "@morpho-org/blue-sdk";
import {
  blueAbi,
  erc2612Abi,
  permit2Abi,
  publicAllocatorAbi,
} from "@morpho-org/blue-sdk-viem";
import {
  type Address,
  type Hex,
  encodeFunctionData,
  keccak256,
  maxUint256,
  parseSignature,
  toFunctionSelector,
  zeroHash,
} from "viem";
import { BundlerErrors } from "./errors.js";
import type {
  Action,
  Authorization,
  InputReallocation,
  Permit2PermitSingle,
} from "./types/index.js";

export interface BundlerCall {
  to: Address;
  data: Hex;
  value: bigint;
  skipRevert: boolean;
  callbackHash: Hex;
}

const reenterSelectorHash = keccak256(
  toFunctionSelector(
    bundler3Abi.find(
      (item) => item.type === "function" && item.name === "reenter",
    )!,
  ),
);

/**
 * Namespace to easily encode calls to the Bundler contract, using ethers.
 */
export namespace BundlerAction {
  export function encodeBundle(
    chainId: ChainId,
    actions: Action[],
    value = 0n,
  ) {
    const {
      bundler3: { bundler3 },
    } = getChainAddresses(chainId);

    const firstNativeTokenActionIndex = actions.findIndex(
      ({ type }) =>
        type === "nativeTransfer" ||
        type === "stakeEth" ||
        type === "wrapNative",
    ); // TODO: track how much ETH is needed by each adapter

    const encode = BundlerAction.encode.bind(null, chainId);

    const callsBeforefirstNativeTokenAction =
      firstNativeTokenActionIndex === -1
        ? []
        : actions
            .slice(0, firstNativeTokenActionIndex)
            .flatMap(encode)
            .concat(
              encode(actions[firstNativeTokenActionIndex]!).map((call, i) =>
                i === 0 ? { ...call, value } : call,
              ),
            );

    return {
      to: bundler3,
      value,
      data: encodeFunctionData({
        abi: bundler3Abi,
        functionName: "multicall",
        args: [
          callsBeforefirstNativeTokenAction.concat(
            actions.slice(firstNativeTokenActionIndex + 1).flatMap(encode),
          ),
        ],
      }),
    };
  }

  export function encode(
    chainId: ChainId,
    { type, args }: Action,
  ): BundlerCall[] {
    switch (type) {
      /* ERC20 */
      case "nativeTransfer": {
        return BundlerAction.nativeTransfer(chainId, ...args);
      }
      case "erc20Transfer": {
        return BundlerAction.erc20Transfer(chainId, ...args);
      }
      case "erc20TransferFrom": {
        return BundlerAction.erc20TransferFrom(chainId, ...args);
      }

      /* ERC20Wrapper */
      case "erc20WrapperDepositFor": {
        return BundlerAction.erc20WrapperDepositFor(chainId, ...args);
      }
      case "erc20WrapperWithdrawTo": {
        return BundlerAction.erc20WrapperWithdrawTo(chainId, ...args);
      }

      /* Permit */
      case "permit": {
        const [
          sender,
          asset,
          amount,
          deadline,
          signature,
          spender,
          skipRevert,
        ] = args;
        if (signature == null) throw new BundlerErrors.MissingSignature();

        return BundlerAction.permit(
          chainId,
          sender,
          asset,
          amount,
          deadline,
          signature,
          spender,
          skipRevert,
        );
      }
      case "permitDai": {
        const [sender, nonce, expiry, allowed, signature, spender, skipRevert] =
          args;
        if (signature == null) throw new BundlerErrors.MissingSignature();

        return BundlerAction.permitDai(
          chainId,
          sender,
          nonce,
          expiry,
          allowed,
          signature,
          spender,
          skipRevert,
        );
      }

      /* Permit2 */
      case "approve2": {
        const [sender, permitSingle, signature, skipRevert] = args;
        if (signature == null) throw new BundlerErrors.MissingSignature();

        return BundlerAction.approve2(
          chainId,
          sender,
          permitSingle,
          signature,
          skipRevert,
        );
      }
      case "transferFrom2": {
        return BundlerAction.transferFrom2(chainId, ...args);
      }

      /* ERC4626 */
      case "erc4626Mint": {
        return BundlerAction.erc4626Mint(chainId, ...args);
      }
      case "erc4626Deposit": {
        return BundlerAction.erc4626Deposit(chainId, ...args);
      }
      case "erc4626Withdraw": {
        return BundlerAction.erc4626Withdraw(chainId, ...args);
      }
      case "erc4626Redeem": {
        return BundlerAction.erc4626Redeem(chainId, ...args);
      }

      /* Morpho */
      case "morphoSetAuthorizationWithSig": {
        const [authorization, signature, skipRevert] = args;
        if (signature == null) throw new BundlerErrors.MissingSignature();

        return BundlerAction.morphoSetAuthorizationWithSig(
          chainId,
          authorization,
          signature,
          skipRevert,
        );
      }
      case "morphoSupply": {
        const [
          market,
          assets,
          shares,
          slippageAmount,
          onBehalf,
          onMorphoSupply,
        ] = args;

        return BundlerAction.morphoSupply(
          chainId,
          market,
          assets,
          shares,
          slippageAmount,
          onBehalf,
          onMorphoSupply.flatMap(BundlerAction.encode.bind(null, chainId)),
        );
      }
      case "morphoSupplyCollateral": {
        const [market, amount, onBehalf, onMorphoSupplyCollateral] = args;

        return BundlerAction.morphoSupplyCollateral(
          chainId,
          market,
          amount,
          onBehalf,
          onMorphoSupplyCollateral.flatMap(
            BundlerAction.encode.bind(null, chainId),
          ),
        );
      }
      case "morphoBorrow": {
        return BundlerAction.morphoBorrow(chainId, ...args);
      }
      case "morphoRepay": {
        const [
          market,
          assets,
          shares,
          slippageAmount,
          onBehalf,
          onMorphoRepay,
        ] = args;

        return BundlerAction.morphoRepay(
          chainId,
          market,
          assets,
          shares,
          slippageAmount,
          onBehalf,
          onMorphoRepay.flatMap(BundlerAction.encode.bind(null, chainId)),
        );
      }
      case "morphoWithdraw": {
        return BundlerAction.morphoWithdraw(chainId, ...args);
      }
      case "morphoWithdrawCollateral": {
        return BundlerAction.morphoWithdrawCollateral(chainId, ...args);
      }

      /* MetaMorpho */
      case "reallocateTo": {
        return BundlerAction.metaMorphoReallocateTo(chainId, ...args);
      }

      /* Universal Rewards Distributor */
      case "urdClaim": {
        return BundlerAction.urdClaim(...args);
      }

      /* Wrapped Native */
      case "wrapNative": {
        return BundlerAction.wrapNative(chainId, ...args);
      }
      case "unwrapNative": {
        return BundlerAction.unwrapNative(chainId, ...args);
      }

      /* stETH */
      case "stakeEth": {
        return BundlerAction.stakeEth(chainId, ...args);
      }

      /* Wrapped stETH */
      case "wrapStEth": {
        return BundlerAction.wrapStEth(chainId, ...args);
      }
      case "unwrapStEth": {
        return BundlerAction.unwrapStEth(chainId, ...args);
      }

      /* AaveV2 */
      case "aaveV2Repay": {
        return BundlerAction.aaveV2Repay(chainId, ...args);
      }
      case "aaveV2Withdraw": {
        return BundlerAction.aaveV2Withdraw(chainId, ...args);
      }

      /* AaveV3 */
      case "aaveV3Repay": {
        return BundlerAction.aaveV3Repay(chainId, ...args);
      }
      case "aaveV3Withdraw": {
        return BundlerAction.aaveV3Withdraw(chainId, ...args);
      }

      /* AaveV3 Optimizer */
      case "aaveV3OptimizerRepay": {
        return BundlerAction.aaveV3OptimizerRepay(chainId, ...args);
      }
      case "aaveV3OptimizerWithdraw": {
        return BundlerAction.aaveV3OptimizerWithdraw(chainId, ...args);
      }
      case "aaveV3OptimizerWithdrawCollateral": {
        return BundlerAction.aaveV3OptimizerWithdrawCollateral(
          chainId,
          ...args,
        );
      }
      case "aaveV3OptimizerApproveManagerWithSig": {
        const [
          owner,
          isApproved,
          nonce,
          deadline,
          signature,
          manager,
          skipRevert,
        ] = args;
        if (signature == null) throw new BundlerErrors.MissingSignature();

        return BundlerAction.aaveV3OptimizerApproveManagerWithSig(
          chainId,
          owner,
          isApproved,
          nonce,
          deadline,
          signature,
          manager,
          skipRevert,
        );
      }

      /* CompoundV2 */
      case "compoundV2Repay": {
        return BundlerAction.compoundV2Repay(chainId, ...args);
      }
      case "compoundV2Redeem": {
        return BundlerAction.compoundV2Redeem(chainId, ...args);
      }

      /* CompoundV3 */
      case "compoundV3Repay": {
        return BundlerAction.compoundV3Repay(chainId, ...args);
      }
      case "compoundV3WithdrawFrom": {
        return BundlerAction.compoundV3WithdrawFrom(chainId, ...args);
      }
      case "compoundV3AllowBySig": {
        const [
          instance,
          owner,
          isAllowed,
          nonce,
          expiry,
          signature,
          manager,
          skipRevert,
        ] = args;

        if (signature == null) throw new BundlerErrors.MissingSignature();

        return BundlerAction.compoundV3AllowBySig(
          chainId,
          owner,
          instance,
          isAllowed,
          nonce,
          expiry,
          signature,
          manager,
          skipRevert,
        );
      }
    }

    throw Error(`unhandled action encoding: ${type}`);
  }

  /* ERC20 */

  /**
   * Encodes a call to the Adapter to transfer native tokens (ETH on ethereum, MATIC on polygon, etc).
   * @param recipient The address to send native tokens to.
   * @param amount The amount of native tokens to send (in wei).
   */
  export function nativeTransfer(
    chainId: ChainId,
    recipient: Address,
    amount: bigint,
  ): BundlerCall[] {
    const {
      bundler3: { generalAdapter1 },
    } = getChainAddresses(chainId);

    return [
      {
        to: generalAdapter1,
        data: encodeFunctionData({
          abi: coreAdapterAbi,
          functionName: "nativeTransfer",
          args: [recipient, amount],
        }),
        value: 0n,
        skipRevert: false,
        callbackHash: zeroHash,
      },
    ];
  }

  /**
   * Encodes a call to the Adapter to transfer ERC20 tokens.
   * @param asset The address of the ERC20 token to transfer.
   * @param recipient The address to send tokens to.
   * @param amount The amount of tokens to send.
   */
  export function erc20Transfer(
    chainId: ChainId,
    asset: Address,
    recipient: Address,
    amount: bigint,
  ): BundlerCall[] {
    const {
      bundler3: { generalAdapter1 },
    } = getChainAddresses(chainId);

    return [
      {
        to: generalAdapter1,
        data: encodeFunctionData({
          abi: coreAdapterAbi,
          functionName: "erc20Transfer",
          args: [asset, recipient, amount],
        }),
        value: 0n,
        skipRevert: false,
        callbackHash: zeroHash,
      },
    ];
  }

  /**
   * Encodes a call to the Adapter to transfer ERC20 tokens from the sender to the Bundler.
   * @param asset The address of the ERC20 token to transfer.
   * @param amount The amount of tokens to send.
   */
  export function erc20TransferFrom(
    chainId: ChainId,
    asset: Address,
    amount: bigint,
    recipient?: Address,
  ): BundlerCall[] {
    const {
      bundler3: { generalAdapter1 },
    } = getChainAddresses(chainId);

    recipient ??= generalAdapter1;

    return [
      {
        to: generalAdapter1,
        data: encodeFunctionData({
          abi: generalAdapter1Abi,
          functionName: "erc20TransferFrom",
          args: [asset, recipient, amount],
        }),
        value: 0n,
        skipRevert: false,
        callbackHash: zeroHash,
      },
    ];
  }

  /* Permit */

  /**
   * Encodes a call to the Adapter to permit an ERC20 token.
   * @param owner The address which owns the tokens.
   * @param asset The address of the ERC20 token to permit.
   * @param amount The amount of tokens to permit.
   * @param deadline The timestamp until which the signature is valid.
   * @param signature The Ethers signature to permit the tokens.
   * @param skipRevert Whether to allow the permit to revert without making the whole multicall revert.
   */
  export function permit(
    chainId: ChainId,
    owner: Address,
    asset: Address,
    amount: bigint,
    deadline: bigint,
    signature: Hex,
    spender?: Address,
    skipRevert = true,
  ): BundlerCall[] {
    const {
      bundler3: { generalAdapter1 },
    } = getChainAddresses(chainId);
    const { r, s, yParity } = parseSignature(signature);

    spender ??= generalAdapter1;

    return [
      {
        to: asset,
        data: encodeFunctionData({
          abi: erc2612Abi,
          functionName: "permit",
          args: [owner, spender, amount, deadline, yParity + 27, r, s],
        }),
        value: 0n,
        skipRevert,
        callbackHash: zeroHash,
      },
    ];
  }

  /**
   * Encodes a call to the Adapter to permit DAI.
   * @param owner The address which owns the tokens.
   * @param nonce The permit nonce used.
   * @param expiry The timestamp until which the signature is valid.
   * @param allowed The amount of DAI to permit.
   * @param signature The Ethers signature to permit the tokens.
   * @param skipRevert Whether to allow the permit to revert without making the whole multicall revert.
   */
  export function permitDai(
    chainId: ChainId,
    owner: Address,
    nonce: bigint,
    expiry: bigint,
    allowed: boolean,
    signature: Hex,
    spender?: Address,
    skipRevert = true,
  ): BundlerCall[] {
    const {
      dai,
      bundler3: { generalAdapter1 },
    } = getChainAddresses(chainId);
    if (dai == null)
      throw new BundlerErrors.UnexpectedAction("permitDai", chainId);

    spender ??= generalAdapter1;

    const { r, s, yParity } = parseSignature(signature);

    return [
      {
        to: dai,
        data: encodeFunctionData({
          abi: [
            {
              constant: false,
              inputs: [
                { name: "holder", type: "address" },
                { name: "spender", type: "address" },
                { name: "nonce", type: "uint256" },
                { name: "expiry", type: "uint256" },
                { name: "allowed", type: "bool" },
                { name: "v", type: "uint8" },
                { name: "r", type: "bytes32" },
                { name: "s", type: "bytes32" },
              ],
              name: "permit",
              outputs: [],
              payable: false,
              stateMutability: "nonpayable",
              type: "function",
            },
          ],
          functionName: "permit",
          args: [owner, spender, nonce, expiry, allowed, yParity + 27, r, s],
        }),
        value: 0n,
        skipRevert,
        callbackHash: zeroHash,
      },
    ];
  }

  /* Permit2 */

  /**
   * Encodes a call to the Adapter to permit ERC20 tokens via Permit2.
   * @param permitSingle The permit details to submit to Permit2.
   * @param signature The Ethers signature to permit the tokens.
   * @param skipRevert Whether to allow the permit to revert without making the whole multicall revert.
   */
  export function approve2(
    chainId: ChainId,
    owner: Address,
    permitSingle: Permit2PermitSingle,
    signature: Hex,
    skipRevert = true,
  ): BundlerCall[] {
    const { permit2 } = getChainAddresses(chainId);

    return [
      {
        to: permit2,
        data: encodeFunctionData({
          abi: permit2Abi,
          functionName: "permit",
          args: [owner, permitSingle, signature],
        }),
        value: 0n,
        skipRevert,
        callbackHash: zeroHash,
      },
    ];
  }

  /**
   * Encodes a call to the Adapter to transfer ERC20 tokens via Permit2 from the sender to the Bundler.
   * @param asset The address of the ERC20 token to transfer.
   * @param amount The amount of tokens to send.
   */
  export function transferFrom2(
    chainId: ChainId,
    asset: Address,
    owner: Address,
    amount: bigint,
    recipient?: Address,
  ): BundlerCall[] {
    const {
      permit2,
      bundler3: { generalAdapter1 },
    } = getChainAddresses(chainId);

    recipient ??= generalAdapter1;

    return [
      {
        to: permit2,
        data: encodeFunctionData({
          abi: permit2Abi,
          functionName: "transferFrom",
          // TODO: batch all permit2 transfers via transferFrom(AllowanceTransferDetails[] calldata)
          args: [owner, recipient, amount, asset],
        }),
        value: 0n,
        skipRevert: false,
        callbackHash: zeroHash,
      },
    ];
  }

  /* ERC20 Wrapper */

  /**
   * Encodes a call to the Adapter to wrap ERC20 tokens via the provided ERC20Wrapper.
   * @param wrapper The address of the ERC20 wrapper token.
   * @param amount The amount of tokens to send.
   */
  export function erc20WrapperDepositFor(
    chainId: ChainId,
    wrapper: Address,
    underlying: Address,
    amount: bigint,
  ): BundlerCall[] {
    const {
      bundler3: { generalAdapter1, erc20WrapperAdapter },
    } = getChainAddresses(chainId);

    return [
      {
        to: generalAdapter1,
        data: encodeFunctionData({
          abi: generalAdapter1Abi,
          functionName: "erc20Transfer",
          args: [underlying, erc20WrapperAdapter, maxUint256],
        }),
        value: 0n,
        skipRevert: false,
        callbackHash: zeroHash,
      },
      {
        to: erc20WrapperAdapter,
        data: encodeFunctionData({
          abi: erc20WrapperAdapterAbi,
          functionName: "erc20WrapperDepositFor",
          args: [wrapper, amount],
        }),
        value: 0n,
        skipRevert: false,
        callbackHash: zeroHash,
      },
      {
        to: erc20WrapperAdapter,
        data: encodeFunctionData({
          abi: erc20WrapperAdapterAbi,
          functionName: "erc20Transfer",
          args: [underlying, generalAdapter1, maxUint256],
        }),
        value: 0n,
        skipRevert: false,
        callbackHash: zeroHash,
      },
    ];
  }

  /**
   * Encodes a call to the Adapter to unwrap ERC20 tokens from the provided ERC20Wrapper.
   * @param wrapper The address of the ERC20 wrapper token.
   * @param account The address to send the underlying ERC20 tokens.
   * @param amount The amount of tokens to send.
   */
  export function erc20WrapperWithdrawTo(
    chainId: ChainId,
    wrapper: Address,
    receiver: Address,
    amount: bigint,
  ): BundlerCall[] {
    const {
      bundler3: { generalAdapter1, erc20WrapperAdapter },
    } = getChainAddresses(chainId);

    return [
      {
        to: generalAdapter1,
        data: encodeFunctionData({
          abi: generalAdapter1Abi,
          functionName: "erc20Transfer",
          args: [wrapper, erc20WrapperAdapter, maxUint256],
        }),
        value: 0n,
        skipRevert: false,
        callbackHash: zeroHash,
      },
      {
        to: erc20WrapperAdapter,
        data: encodeFunctionData({
          abi: erc20WrapperAdapterAbi,
          functionName: "erc20WrapperWithdrawTo",
          args: [wrapper, receiver, amount],
        }),
        value: 0n,
        skipRevert: false,
        callbackHash: zeroHash,
      },
      {
        to: erc20WrapperAdapter,
        data: encodeFunctionData({
          abi: erc20WrapperAdapterAbi,
          functionName: "erc20Transfer",
          args: [wrapper, generalAdapter1, maxUint256],
        }),
        value: 0n,
        skipRevert: false,
        callbackHash: zeroHash,
      },
    ];
  }

  /* ERC4626 */

  /**
   * Encodes a call to the Adapter to mint shares of the provided ERC4626 vault.
   * @param erc4626 The address of the ERC4626 vault.
   * @param shares The amount of shares to mint.
   * @param maxSharePrice The maximum amount of assets to pay to get 1 share (scaled by RAY).
   * @param receiver The address to send the shares to.
   */
  export function erc4626Mint(
    chainId: ChainId,
    erc4626: Address,
    shares: bigint,
    maxSharePrice: bigint,
    receiver: Address,
  ): BundlerCall[] {
    const {
      bundler3: { generalAdapter1 },
    } = getChainAddresses(chainId);

    return [
      {
        to: generalAdapter1,
        data: encodeFunctionData({
          abi: generalAdapter1Abi,
          functionName: "erc4626Mint",
          args: [erc4626, shares, maxSharePrice, receiver],
        }),
        value: 0n,
        skipRevert: false,
        callbackHash: zeroHash,
      },
    ];
  }

  /**
   * Encodes a call to the Adapter to deposit assets into the provided ERC4626 vault.
   * @param erc4626 The address of the ERC4626 vault.
   * @param assets The amount of assets to deposit.
   * @param maxSharePrice The maximum amount of assets to pay to get 1 share (scaled by RAY).
   * @param receiver The address to send the shares to.
   */
  export function erc4626Deposit(
    chainId: ChainId,
    erc4626: Address,
    assets: bigint,
    maxSharePrice: bigint,
    receiver: Address,
  ): BundlerCall[] {
    const {
      bundler3: { generalAdapter1 },
    } = getChainAddresses(chainId);

    return [
      {
        to: generalAdapter1,
        data: encodeFunctionData({
          abi: generalAdapter1Abi,
          functionName: "erc4626Deposit",
          args: [erc4626, assets, maxSharePrice, receiver],
        }),
        value: 0n,
        skipRevert: false,
        callbackHash: zeroHash,
      },
    ];
  }

  /**
   * Encodes a call to the Adapter to withdraw assets from the provided ERC4626 vault.
   * @param erc4626 The address of the ERC4626 vault.
   * @param assets The amount of assets to withdraw.
   * @param minSharePrice The minimum number of assets to receive per share (scaled by RAY).
   * @param receiver The address to send the assets to.
   * @param owner The address on behalf of which the assets are withdrawn.
   */
  export function erc4626Withdraw(
    chainId: ChainId,
    erc4626: Address,
    assets: bigint,
    minSharePrice: bigint,
    receiver: Address,
    owner: Address,
  ): BundlerCall[] {
    const {
      bundler3: { generalAdapter1 },
    } = getChainAddresses(chainId);

    return [
      {
        to: generalAdapter1,
        data: encodeFunctionData({
          abi: generalAdapter1Abi,
          functionName: "erc4626Withdraw",
          args: [erc4626, assets, minSharePrice, receiver, owner],
        }),
        value: 0n,
        skipRevert: false,
        callbackHash: zeroHash,
      },
    ];
  }

  /**
   * Encodes a call to the Adapter to redeem shares from the provided ERC4626 vault.
   * @param erc4626 The address of the ERC4626 vault.
   * @param shares The amount of shares to redeem.
   * @param minSharePrice The minimum number of assets to receive per share (scaled by RAY).
   * @param receiver The address to send the assets to.
   * @param owner The address on behalf of which the assets are withdrawn.
   */
  export function erc4626Redeem(
    chainId: ChainId,
    erc4626: Address,
    shares: bigint,
    minSharePrice: bigint,
    receiver: Address,
    owner: Address,
  ): BundlerCall[] {
    const {
      bundler3: { generalAdapter1 },
    } = getChainAddresses(chainId);

    return [
      {
        to: generalAdapter1,
        data: encodeFunctionData({
          abi: generalAdapter1Abi,
          functionName: "erc4626Redeem",
          args: [erc4626, shares, minSharePrice, receiver, owner],
        }),
        value: 0n,
        skipRevert: false,
        callbackHash: zeroHash,
      },
    ];
  }

  /* Morpho */

  /**
   * Encodes a call to the Adapter to authorize an account on Morpho Blue.
   * @param authorization The authorization details to submit to Morpho Blue.
   * @param signature The Ethers signature to authorize the account.
   * @param skipRevert Whether to allow the authorization call to revert without making the whole multicall revert.
   */
  export function morphoSetAuthorizationWithSig(
    chainId: ChainId,
    authorization: Authorization,
    signature: Hex,
    skipRevert = true,
  ): BundlerCall[] {
    const { morpho } = getChainAddresses(chainId);
    const { r, s, yParity } = parseSignature(signature);

    return [
      {
        to: morpho,
        data: encodeFunctionData({
          abi: blueAbi,
          functionName: "setAuthorizationWithSig",
          args: [authorization, { v: yParity + 27, r, s }],
        }),
        value: 0n,
        skipRevert,
        callbackHash: zeroHash,
      },
    ];
  }

  /**
   * Encodes a call to the Adapter to supply to a Morpho Blue market.
   * @param market The market params to supply to.
   * @param assets The amount of assets to supply.
   * @param shares The amount of supply shares to mint.
   * @param slippageAmount The maximum (resp. minimum) amount of assets (resp. supply shares) to supply (resp. mint) (protects the sender from unexpected slippage).
   * @param onBehalf The address to supply on behalf of.
   * @param callbackCalls The array of calls to execute inside Morpho Blue's `onMorphoSupply` callback.
   */
  export function morphoSupply(
    chainId: ChainId,
    market: InputMarketParams,
    assets: bigint,
    shares: bigint,
    slippageAmount: bigint,
    onBehalf: Address,
    callbackCalls: BundlerCall[],
  ): BundlerCall[] {
    const {
      bundler3: { generalAdapter1 },
    } = getChainAddresses(chainId);

    const useCallback = callbackCalls.length > 0;

    return [
      {
        to: generalAdapter1,
        data: encodeFunctionData({
          abi: generalAdapter1Abi,
          functionName: "morphoSupply",
          args: [
            market,
            assets,
            shares,
            slippageAmount,
            onBehalf,
            useCallback
              ? encodeFunctionData({
                  abi: bundler3Abi,
                  functionName: "reenter",
                  args: [callbackCalls],
                })
              : "0x",
          ],
        }),
        value: 0n,
        skipRevert: false,
        callbackHash: useCallback
          ? keccak256(`${generalAdapter1}${reenterSelectorHash}`)
          : zeroHash,
      },
    ];
  }

  /**
   * Encodes a call to the Adapter to supply collateral to a Morpho Blue market.
   * @param market The market params to supply to.
   * @param assets The amount of assets to supply.
   * @param onBehalf The address to supply on behalf of.
   * @param callbackCalls The array of calls to execute inside Morpho Blue's `onMorphoSupplyCollateral` callback.
   */
  export function morphoSupplyCollateral(
    chainId: ChainId,
    market: InputMarketParams,
    assets: bigint,
    onBehalf: Address,
    callbackCalls: BundlerCall[],
  ): BundlerCall[] {
    const {
      bundler3: { generalAdapter1 },
    } = getChainAddresses(chainId);

    const useCallback = callbackCalls.length > 0;

    return [
      {
        to: generalAdapter1,
        data: encodeFunctionData({
          abi: generalAdapter1Abi,
          functionName: "morphoSupplyCollateral",
          args: [
            market,
            assets,
            onBehalf,
            useCallback
              ? encodeFunctionData({
                  abi: bundler3Abi,
                  functionName: "reenter",
                  args: [callbackCalls],
                })
              : "0x",
          ],
        }),
        value: 0n,
        skipRevert: false,
        callbackHash: useCallback
          ? keccak256(`${generalAdapter1}${reenterSelectorHash}`)
          : zeroHash,
      },
    ];
  }

  /**
   * Encodes a call to the Adapter to borrow from a Morpho Blue market.
   * @param market The market params to borrow from.
   * @param assets The amount of assets to borrow.
   * @param shares The amount of borrow shares to mint.
   * @param slippageAmount The minimum (resp. maximum) amount of assets (resp. borrow shares) to borrow (resp. mint) (protects the sender from unexpected slippage).
   * @param receiver The address to send borrowed tokens to.
   */
  export function morphoBorrow(
    chainId: ChainId,
    market: InputMarketParams,
    assets: bigint,
    shares: bigint,
    slippageAmount: bigint,
    receiver: Address,
  ): BundlerCall[] {
    const {
      bundler3: { generalAdapter1 },
    } = getChainAddresses(chainId);

    return [
      {
        to: generalAdapter1,
        data: encodeFunctionData({
          abi: generalAdapter1Abi,
          functionName: "morphoBorrow",
          args: [market, assets, shares, slippageAmount, receiver],
        }),
        value: 0n,
        skipRevert: false,
        callbackHash: zeroHash,
      },
    ];
  }

  /**
   * Encodes a call to the Adapter to repay to a Morpho Blue market.
   * @param market The market params to repay to.
   * @param assets The amount of assets to repay.
   * @param shares The amount of borrow shares to redeem.
   * @param slippageAmount The maximum (resp. minimum) amount of assets (resp. borrow shares) to repay (resp. redeem) (protects the sender from unexpected slippage).
   * @param onBehalf The address to repay on behalf of.
   * @param callbackCalls The array of calls to execute inside Morpho Blue's `onMorphoSupply` callback.
   */
  export function morphoRepay(
    chainId: ChainId,
    market: InputMarketParams,
    assets: bigint,
    shares: bigint,
    slippageAmount: bigint,
    onBehalf: Address,
    callbackCalls: BundlerCall[],
  ): BundlerCall[] {
    const {
      bundler3: { generalAdapter1 },
    } = getChainAddresses(chainId);

    const useCallback = callbackCalls.length > 0;

    return [
      {
        to: generalAdapter1,
        data: encodeFunctionData({
          abi: generalAdapter1Abi,
          functionName: "morphoRepay",
          args: [
            market,
            assets,
            shares,
            slippageAmount,
            onBehalf,
            useCallback
              ? encodeFunctionData({
                  abi: bundler3Abi,
                  functionName: "reenter",
                  args: [callbackCalls],
                })
              : "0x",
          ],
        }),
        value: 0n,
        skipRevert: false,
        callbackHash: useCallback
          ? keccak256(`${generalAdapter1}${reenterSelectorHash}`)
          : zeroHash,
      },
    ];
  }

  /**
   * Encodes a call to the Adapter to withdraw from a Morpho Blue market.
   * @param market The market params to withdraw from.
   * @param assets The amount of assets to withdraw.
   * @param shares The amount of supply shares to redeem.
   * @param slippageAmount The minimum (resp. maximum) amount of assets (resp. supply shares) to withdraw (resp. redeem) (protects the sender from unexpected slippage).
   * @param receiver The address to send withdrawn tokens to.
   */
  export function morphoWithdraw(
    chainId: ChainId,
    market: InputMarketParams,
    assets: bigint,
    shares: bigint,
    slippageAmount: bigint,
    receiver: Address,
  ): BundlerCall[] {
    const {
      bundler3: { generalAdapter1 },
    } = getChainAddresses(chainId);

    return [
      {
        to: generalAdapter1,
        data: encodeFunctionData({
          abi: generalAdapter1Abi,
          functionName: "morphoWithdraw",
          args: [market, assets, shares, slippageAmount, receiver],
        }),
        value: 0n,
        skipRevert: false,
        callbackHash: zeroHash,
      },
    ];
  }

  /**
   * Encodes a call to the Adapter to withdraw collateral from a Morpho Blue market.
   * @param market The market params to withdraw from.
   * @param assets The amount of assets to withdraw.
   * @param receiver The address to send withdrawn tokens to.
   */
  export function morphoWithdrawCollateral(
    chainId: ChainId,
    market: InputMarketParams,
    assets: bigint,
    receiver: Address,
  ): BundlerCall[] {
    const {
      bundler3: { generalAdapter1 },
    } = getChainAddresses(chainId);

    return [
      {
        to: generalAdapter1,
        data: encodeFunctionData({
          abi: generalAdapter1Abi,
          functionName: "morphoWithdrawCollateral",
          args: [market, assets, receiver],
        }),
        value: 0n,
        skipRevert: false,
        callbackHash: zeroHash,
      },
    ];
  }

  /**
   * Encodes a call to the Adapter to flash loan from Morpho Blue.
   * @param asset The address of the ERC20 token to flash loan.
   * @param amount The amount of tokens to flash loan.
   * @param callbackCalls The array of calls to execute inside Morpho Blue's `onMorphoFlashLoan` callback.
   */
  export function morphoFlashLoan(
    chainId: ChainId,
    asset: Address,
    amount: bigint,
    callbackCalls: BundlerCall[],
  ): BundlerCall[] {
    const {
      bundler3: { generalAdapter1 },
    } = getChainAddresses(chainId);

    return [
      {
        to: generalAdapter1,
        data: encodeFunctionData({
          abi: generalAdapter1Abi,
          functionName: "morphoFlashLoan",
          args: [
            asset,
            amount,
            encodeFunctionData({
              abi: bundler3Abi,
              functionName: "reenter",
              args: [callbackCalls],
            }),
          ],
        }),
        value: 0n,
        skipRevert: false,
        callbackHash: keccak256(`${generalAdapter1}${reenterSelectorHash}`),
      },
    ];
  }

  /**
   * Encodes a call to the Adapter to trigger a public reallocation on the PublicAllocator.
   * @param vault The vault to reallocate.
   * @param fee The vault public reallocation fee.
   * @param withdrawals The array of withdrawals to perform, before supplying everything to the supply market.
   * @param supplyMarketParams The market params to reallocate to.
   */
  export function metaMorphoReallocateTo(
    chainId: ChainId,
    vault: Address,
    fee: bigint,
    withdrawals: InputReallocation[],
    supplyMarketParams: InputMarketParams,
  ): BundlerCall[] {
    const { publicAllocator } = getChainAddresses(chainId);

    return [
      {
        to: publicAllocator,
        data: encodeFunctionData({
          abi: publicAllocatorAbi,
          functionName: "reallocateTo",
          args: [vault, withdrawals, supplyMarketParams],
        }),
        value: fee,
        skipRevert: false,
        callbackHash: zeroHash,
      },
    ];
  }

  /* Universal Rewards Distributor */

  /**
   * Encodes a call to the Adapter to claim rewards from the Universal Rewards Distributor.
   * @param distributor The address of the distributor to claim rewards from.
   * @param account The address to claim rewards for.
   * @param reward The address of the reward token to claim.
   * @param amount The amount of rewards to claim.
   * @param proof The Merkle proof to claim the rewards.
   * @param skipRevert Whether to allow the claim to revert without making the whole multicall revert.
   */
  export function urdClaim(
    distributor: Address,
    account: Address,
    reward: Address,
    amount: bigint,
    proof: Hex[],
    skipRevert = true,
  ): BundlerCall[] {
    return [
      {
        to: distributor,
        data: encodeFunctionData({
          abi: universalRewardsDistributorAbi,
          functionName: "claim",
          args: [account, reward, amount, proof],
        }),
        value: 0n,
        skipRevert,
        callbackHash: zeroHash,
      },
    ];
  }

  /* Wrapped Native */

  /**
   * Encodes a call to the Adapter to wrap native tokens (ETH to WETH on ethereum, MATIC to WMATIC on polygon, etc).
   * @param amount The amount of native tokens to wrap (in wei).
   * @param recipient The address to send tokens to.
   */
  export function wrapNative(
    chainId: ChainId,
    amount: bigint,
    recipient?: Address,
  ): BundlerCall[] {
    const {
      bundler3: { generalAdapter1 },
    } = getChainAddresses(chainId);

    recipient ??= generalAdapter1;

    return [
      {
        to: generalAdapter1,
        data: encodeFunctionData({
          abi: generalAdapter1Abi,
          functionName: "wrapNative",
          args: [amount, recipient],
        }),
        value: 0n,
        skipRevert: false,
        callbackHash: zeroHash,
      },
    ];
  }

  /**
   * Encodes a call to the Adapter to unwrap native tokens (WETH to ETH on ethereum, WMATIC to MATIC on polygon, etc).
   * @param amount The amount of native tokens to unwrap (in wei).
   * @param recipient The address to send tokens to.
   */
  export function unwrapNative(
    chainId: ChainId,
    amount: bigint,
    recipient?: Address,
  ): BundlerCall[] {
    const {
      bundler3: { generalAdapter1 },
    } = getChainAddresses(chainId);

    recipient ??= generalAdapter1;

    return [
      {
        to: generalAdapter1,
        data: encodeFunctionData({
          abi: generalAdapter1Abi,
          functionName: "unwrapNative",
          args: [amount, recipient],
        }),
        value: 0n,
        skipRevert: false,
        callbackHash: zeroHash,
      },
    ];
  }

  /* stETH */

  /**
   * Encodes a call to the Adapter to stake native tokens using Lido (ETH to stETH on ethereum).
   * @param amount The amount of native tokens to stake (in wei).
   * @param maxSharePrice The maximum amount of wei to pay for minting 1 share (scaled by RAY).
   * @param referral The referral address to use.
   * @param recipient The address to send stETH to.
   */
  export function stakeEth(
    chainId: ChainId,
    amount: bigint,
    maxSharePrice: bigint,
    referral: Address,
    recipient?: Address,
  ): BundlerCall[] {
    const {
      bundler3: { generalAdapter1 },
    } = getChainAddresses(chainId);

    recipient ??= generalAdapter1;

    return [
      {
        to: generalAdapter1,
        data: encodeFunctionData({
          abi: ethereumGeneralAdapter1Abi,
          functionName: "stakeEth",
          args: [amount, maxSharePrice, referral, recipient],
        }),
        value: 0n,
        skipRevert: false,
        callbackHash: zeroHash,
      },
    ];
  }

  /* Wrapped stETH */

  /**
   * Encodes a call to the Adapter to wrap stETH (stETH to wstETH on ethereum).
   * @param amount The amount of stETH to wrap (in wei).
   * @param recipient The address to send wstETH to.
   */
  export function wrapStEth(
    chainId: ChainId,
    amount: bigint,
    recipient?: Address,
  ): BundlerCall[] {
    const {
      bundler3: { generalAdapter1 },
    } = getChainAddresses(chainId);

    recipient ??= generalAdapter1;

    return [
      {
        to: generalAdapter1,
        data: encodeFunctionData({
          abi: ethereumGeneralAdapter1Abi,
          functionName: "wrapStEth",
          args: [amount, recipient],
        }),
        value: 0n,
        skipRevert: false,
        callbackHash: zeroHash,
      },
    ];
  }

  /**
   * Encodes a call to the Adapter to unwrap wstETH (wstETH to stETH on ethereum).
   * @param amount The amount of wstETH to unwrap (in wei).
   * @param recipient The address to send stETH to.
   */
  export function unwrapStEth(
    chainId: ChainId,
    amount: bigint,
    recipient?: Address,
  ): BundlerCall[] {
    const {
      bundler3: { generalAdapter1 },
    } = getChainAddresses(chainId);

    recipient ??= generalAdapter1;

    return [
      {
        to: generalAdapter1,
        data: encodeFunctionData({
          abi: ethereumGeneralAdapter1Abi,
          functionName: "unwrapStEth",
          args: [amount, recipient],
        }),
        value: 0n,
        skipRevert: false,
        callbackHash: zeroHash,
      },
    ];
  }

  /* AaveV2 */

  /**
   * Encodes a call to the Adapter to repay a debt on AaveV2.
   * @param asset The debt asset to repay.
   * @param amount The amount of debt to repay.
   * @param rateMode The interest rate mode used by the debt to repay.
   */
  export function aaveV2Repay(
    chainId: ChainId,
    asset: Address,
    amount: bigint,
    onBehalf: Address,
    rateMode = 1n,
  ): BundlerCall[] {
    const {
      bundler3: { aaveV2MigrationAdapter },
    } = getChainAddresses(chainId);
    if (aaveV2MigrationAdapter == null)
      throw new BundlerErrors.UnexpectedAction("aaveV2Repay", chainId);

    return [
      {
        to: aaveV2MigrationAdapter,
        data: encodeFunctionData({
          abi: aaveV2MigrationAdapterAbi,
          functionName: "aaveV2Repay",
          args: [asset, amount, rateMode, onBehalf],
        }),
        value: 0n,
        skipRevert: false,
        callbackHash: zeroHash,
      },
    ];
  }

  /**
   * Encodes a call to the Adapter to withdrawn from AaveV2.
   * @param asset The asset to withdraw.
   * @param amount The amount of asset to withdraw.
   */
  export function aaveV2Withdraw(
    chainId: ChainId,
    asset: Address,
    amount: bigint,
    recipient?: Address,
  ): BundlerCall[] {
    const {
      bundler3: { aaveV2MigrationAdapter },
    } = getChainAddresses(chainId);
    if (aaveV2MigrationAdapter == null)
      throw new BundlerErrors.UnexpectedAction("aaveV2Withdraw", chainId);

    recipient ??= aaveV2MigrationAdapter;

    return [
      {
        to: aaveV2MigrationAdapter,
        data: encodeFunctionData({
          abi: aaveV2MigrationAdapterAbi,
          functionName: "aaveV2Withdraw",
          args: [asset, amount, recipient],
        }),
        value: 0n,
        skipRevert: false,
        callbackHash: zeroHash,
      },
    ];
  }

  /* AaveV3 */

  /**
   * Encodes a call to the Adapter to repay a debt on AaveV3.
   * @param asset The debt asset to repay.
   * @param amount The amount of debt to repay.
   * @param rateMode The interest rate mode used by the debt to repay.
   */
  export function aaveV3Repay(
    chainId: ChainId,
    asset: Address,
    amount: bigint,
    onBehalf: Address,
    rateMode = 1n,
  ): BundlerCall[] {
    const {
      bundler3: { aaveV3CoreMigrationAdapter }, // TODO: choose between core & prime
    } = getChainAddresses(chainId);

    return [
      {
        to: aaveV3CoreMigrationAdapter,
        data: encodeFunctionData({
          abi: aaveV3MigrationAdapterAbi,
          functionName: "aaveV3Repay",
          args: [asset, amount, rateMode, onBehalf],
        }),
        value: 0n,
        skipRevert: false,
        callbackHash: zeroHash,
      },
    ];
  }

  /**
   * Encodes a call to the Adapter to withdrawn from AaveV3.
   * @param asset The asset to withdraw.
   * @param amount The amount of asset to withdraw.
   */
  export function aaveV3Withdraw(
    chainId: ChainId,
    asset: Address,
    amount: bigint,
    recipient?: Address,
  ): BundlerCall[] {
    const {
      bundler3: { aaveV3CoreMigrationAdapter }, // TODO: choose between core & prime
    } = getChainAddresses(chainId);

    recipient ??= aaveV3CoreMigrationAdapter;

    return [
      {
        to: aaveV3CoreMigrationAdapter,
        data: encodeFunctionData({
          abi: aaveV3MigrationAdapterAbi,
          functionName: "aaveV3Withdraw",
          args: [asset, amount, recipient],
        }),
        value: 0n,
        skipRevert: false,
        callbackHash: zeroHash,
      },
    ];
  }

  /* AaveV3 Optimizer */

  /**
   * Encodes a call to the Adapter to repay a debt on Morpho's AaveV3Optimizer.
   * @param underlying The underlying debt asset to repay.
   * @param amount The amount of debt to repay.
   * @param maxIterations The maximum amount of iterations to use for the repayment.
   */
  export function aaveV3OptimizerRepay(
    chainId: ChainId,
    underlying: Address,
    amount: bigint,
    onBehalf: Address,
  ): BundlerCall[] {
    const {
      bundler3: { aaveV3OptimizerMigrationAdapter },
    } = getChainAddresses(chainId);
    if (aaveV3OptimizerMigrationAdapter == null)
      throw new BundlerErrors.UnexpectedAction("aaveV3OptimizerRepay", chainId);

    return [
      {
        to: aaveV3OptimizerMigrationAdapter,
        data: encodeFunctionData({
          abi: aaveV3OptimizerMigrationAdapterAbi,
          functionName: "aaveV3OptimizerRepay",
          args: [underlying, amount, onBehalf],
        }),
        value: 0n,
        skipRevert: false,
        callbackHash: zeroHash,
      },
    ];
  }

  /**
   * Encodes a call to the Adapter to withdraw from Morpho's AaveV3Optimizer.
   * @param underlying The underlying asset to withdraw.
   * @param amount The amount to withdraw.
   * @param maxIterations The maximum amount of iterations to use for the withdrawal.
   */
  export function aaveV3OptimizerWithdraw(
    chainId: ChainId,
    underlying: Address,
    amount: bigint,
    maxIterations: bigint,
    recipient?: Address,
  ): BundlerCall[] {
    const {
      bundler3: { aaveV3OptimizerMigrationAdapter },
    } = getChainAddresses(chainId);
    if (aaveV3OptimizerMigrationAdapter == null)
      throw new BundlerErrors.UnexpectedAction(
        "aaveV3OptimizerWithdraw",
        chainId,
      );

    recipient ??= aaveV3OptimizerMigrationAdapter;

    return [
      {
        to: aaveV3OptimizerMigrationAdapter,
        data: encodeFunctionData({
          abi: aaveV3OptimizerMigrationAdapterAbi,
          functionName: "aaveV3OptimizerWithdraw",
          args: [underlying, amount, maxIterations, recipient],
        }),
        value: 0n,
        skipRevert: false,
        callbackHash: zeroHash,
      },
    ];
  }

  /**
   * Encodes a call to the Adapter to withdraw collateral from Morpho's AaveV3Optimizer.
   * @param underlying The underlying asset to withdraw.
   * @param amount The amount to withdraw.
   */
  export function aaveV3OptimizerWithdrawCollateral(
    chainId: ChainId,
    underlying: Address,
    amount: bigint,
    recipient?: Address,
  ): BundlerCall[] {
    const {
      bundler3: { aaveV3OptimizerMigrationAdapter },
    } = getChainAddresses(chainId);
    if (aaveV3OptimizerMigrationAdapter == null)
      throw new BundlerErrors.UnexpectedAction(
        "aaveV3OptimizerWithdrawCollateral",
        chainId,
      );

    recipient ??= aaveV3OptimizerMigrationAdapter;

    return [
      {
        to: aaveV3OptimizerMigrationAdapter,
        data: encodeFunctionData({
          abi: aaveV3OptimizerMigrationAdapterAbi,
          functionName: "aaveV3OptimizerWithdrawCollateral",
          args: [underlying, amount, recipient],
        }),
        value: 0n,
        skipRevert: false,
        callbackHash: zeroHash,
      },
    ];
  }

  /**
   * Encodes a call to the Adapter to approve the Bundler as the sender's manager on Morpho's AaveV3Optimizer.
   * @param isApproved Whether the manager is approved.
   * @param nonce The nonce used to sign.
   * @param deadline The timestamp until which the signature is valid.
   * @param signature The Ethers signature to submit.
   * @param skipRevert Whether to allow the signature to revert without making the whole multicall revert.
   */
  export function aaveV3OptimizerApproveManagerWithSig(
    chainId: ChainId,
    owner: Address,
    isApproved: boolean,
    nonce: bigint,
    deadline: bigint,
    signature: Hex,
    manager?: Address,
    skipRevert = true,
  ): BundlerCall[] {
    const {
      aaveV3Optimizer,
      bundler3: { aaveV3OptimizerMigrationAdapter },
    } = getChainAddresses(chainId);
    if (aaveV3Optimizer == null || aaveV3OptimizerMigrationAdapter == null)
      throw new BundlerErrors.UnexpectedAction(
        "aaveV3OptimizerApproveManagerWithSig",
        chainId,
      );

    manager ??= aaveV3OptimizerMigrationAdapter;

    const { r, s, yParity } = parseSignature(signature);

    return [
      {
        to: aaveV3Optimizer,
        data: encodeFunctionData({
          abi: [
            {
              inputs: [
                { name: "delegator", type: "address" },
                { name: "manager", type: "address" },
                { name: "isAllowed", type: "bool" },
                { name: "nonce", type: "uint256" },
                { name: "deadline", type: "uint256" },
                {
                  components: [
                    { name: "v", type: "uint8" },
                    { name: "r", type: "bytes32" },
                    { name: "s", type: "bytes32" },
                  ],
                  internalType: "struct Types.Signature",
                  name: "signature",
                  type: "tuple",
                },
              ],
              name: "approveManagerWithSig",
              outputs: [],
              stateMutability: "nonpayable",
              type: "function",
            },
          ],
          functionName: "approveManagerWithSig",
          args: [
            owner,
            manager,
            isApproved,
            nonce,
            deadline,
            { v: yParity + 27, r, s },
          ],
        }),
        value: 0n,
        skipRevert,
        callbackHash: zeroHash,
      },
    ];
  }

  /* CompoundV2 */

  /**
   * Encodes a call to the Adapter to repay a debt on CompoundV2.
   * @param cToken The cToken on which to repay the debt.
   * @param amount The amount of debt to repay.
   */
  export function compoundV2Repay(
    chainId: ChainId,
    cToken: Address,
    amount: bigint,
    recipient?: Address,
  ): BundlerCall[] {
    const {
      cEth,
      bundler3: { compoundV2MigrationAdapter },
    } = getChainAddresses(chainId);
    if (cEth == null || compoundV2MigrationAdapter == null)
      throw new BundlerErrors.UnexpectedAction("compoundV2Repay", chainId);

    const isEth = cToken === cEth;

    recipient ??= compoundV2MigrationAdapter;

    return [
      {
        to: compoundV2MigrationAdapter,
        data: isEth
          ? encodeFunctionData({
              abi: compoundV2MigrationAdapterAbi,
              functionName: "compoundV2RepayEth",
              args: [amount, recipient],
            })
          : encodeFunctionData({
              abi: compoundV2MigrationAdapterAbi,
              functionName: "compoundV2RepayErc20",
              args: [cToken, amount, recipient],
            }),
        value: isEth ? amount : 0n,
        skipRevert: false,
        callbackHash: zeroHash,
      },
    ];
  }

  /**
   * Encodes a call to the Adapter to withdraw collateral from CompoundV2.
   * @param cToken The cToken on which to withdraw.
   * @param amount The amount to withdraw.
   */
  export function compoundV2Redeem(
    chainId: ChainId,
    cToken: Address,
    amount: bigint,
    recipient?: Address,
  ): BundlerCall[] {
    const {
      cEth,
      bundler3: { compoundV2MigrationAdapter },
    } = getChainAddresses(chainId);
    if (cEth == null || compoundV2MigrationAdapter == null)
      throw new BundlerErrors.UnexpectedAction("compoundV2Repay", chainId);

    const isEth = cToken === cEth;

    recipient ??= compoundV2MigrationAdapter;

    return [
      {
        to: compoundV2MigrationAdapter,
        data: isEth
          ? encodeFunctionData({
              abi: compoundV2MigrationAdapterAbi,
              functionName: "compoundV2RedeemEth",
              args: [amount, recipient],
            })
          : encodeFunctionData({
              abi: compoundV2MigrationAdapterAbi,
              functionName: "compoundV2RedeemErc20",
              args: [cToken, amount, recipient],
            }),
        value: 0n,
        skipRevert: false,
        callbackHash: zeroHash,
      },
    ];
  }

  /* CompoundV3 */

  /**
   * Encodes a call to the Adapter to repay a debt on CompoundV3.
   * @param instance The CompoundV3 instance on which to repay the debt.
   * @param amount The amount of debt to repay.
   */
  export function compoundV3Repay(
    chainId: ChainId,
    instance: Address,
    amount: bigint,
    onBehalf: Address,
  ): BundlerCall[] {
    const {
      bundler3: { compoundV3MigrationAdapter },
    } = getChainAddresses(chainId);

    return [
      {
        to: compoundV3MigrationAdapter,
        data: encodeFunctionData({
          abi: compoundV3MigrationAdapterAbi,
          functionName: "compoundV3Repay",
          args: [instance, amount, onBehalf],
        }),
        value: 0n,
        skipRevert: false,
        callbackHash: zeroHash,
      },
    ];
  }

  /**
   * Encodes a call to the Adapter to withdraw collateral from CompoundV3.
   * @param instance The CompoundV3 instance on which to withdraw.
   * @param amount The amount to withdraw.
   */
  export function compoundV3WithdrawFrom(
    chainId: ChainId,
    instance: Address,
    asset: Address,
    amount: bigint,
    recipient?: Address,
  ): BundlerCall[] {
    const {
      bundler3: { compoundV3MigrationAdapter },
    } = getChainAddresses(chainId);

    recipient ??= compoundV3MigrationAdapter;

    return [
      {
        to: compoundV3MigrationAdapter,
        data: encodeFunctionData({
          abi: compoundV3MigrationAdapterAbi,
          functionName: "compoundV3WithdrawFrom",
          args: [instance, asset, amount, recipient],
        }),
        value: 0n,
        skipRevert: false,
        callbackHash: zeroHash,
      },
    ];
  }

  /**
   * Encodes a call to the Adapter to allow the Bundler to act on the sender's position on CompoundV3.
   * @param instance The CompoundV3 instance on which to submit the signature.
   * @param isAllowed Whether the manager is allowed.
   * @param nonce The nonce used to sign.
   * @param expiry The timestamp until which the signature is valid.
   * @param signature The Ethers signature to submit.
   * @param skipRevert Whether to allow the signature to revert without making the whole multicall revert.
   */
  export function compoundV3AllowBySig(
    chainId: ChainId,
    instance: Address,
    owner: Address,
    isAllowed: boolean,
    nonce: bigint,
    expiry: bigint,
    signature: Hex,
    manager?: Address,
    skipRevert = true,
  ): BundlerCall[] {
    const {
      bundler3: { compoundV3MigrationAdapter },
    } = getChainAddresses(chainId);
    const { r, s, yParity } = parseSignature(signature);

    manager ??= compoundV3MigrationAdapter;

    return [
      {
        to: instance,
        data: encodeFunctionData({
          abi: [
            {
              inputs: [
                { name: "owner", type: "address" },
                { name: "manager", type: "address" },
                { name: "isAllowed_", type: "bool" },
                { name: "nonce", type: "uint256" },
                { name: "expiry", type: "uint256" },
                { name: "v", type: "uint8" },
                { name: "r", type: "bytes32" },
                { name: "s", type: "bytes32" },
              ],
              name: "allowBySig",
              outputs: [],
              stateMutability: "nonpayable",
              type: "function",
            },
          ],
          functionName: "allowBySig",
          args: [owner, manager, isAllowed, nonce, expiry, yParity + 27, r, s],
        }),
        value: 0n,
        skipRevert,
        callbackHash: zeroHash,
      },
    ];
  }
}

export default BundlerAction;
