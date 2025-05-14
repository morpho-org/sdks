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
  paraswapAdapterAbi,
  universalRewardsDistributorAbi,
} from "./abis.js";

import {
  ChainId,
  type InputMarketParams,
  getChainAddresses,
} from "@morpho-org/blue-sdk";
import {
  blueAbi,
  erc2612Abi,
  permit2Abi,
  publicAllocatorAbi,
} from "@morpho-org/blue-sdk-viem";
import type { ParaswapOffsets } from "@morpho-org/simulation-sdk";
import {
  type Address,
  type Hex,
  encodeAbiParameters,
  encodeFunctionData,
  keccak256,
  maxUint256,
  parseSignature,
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

const reenterAbiInputs = bundler3Abi.find(
  (item) => item.name === "reenter",
)!.inputs;

/**
 * Namespace to easily encode calls to the Bundler contract, using viem.
 */
export namespace BundlerAction {
  export function encodeBundle(chainId: ChainId, actions: Action[]) {
    const {
      bundler3: { bundler3, generalAdapter1 },
    } = getChainAddresses(chainId);

    let value = 0n;

    for (const { type, args } of actions) {
      if (type !== "nativeTransfer") continue;

      const [owner, recipient, amount] = args;

      if (
        owner !== bundler3 &&
        owner !== generalAdapter1 &&
        (recipient === bundler3 || recipient === generalAdapter1)
      )
        value += amount;
    }

    const encodedActions = actions.flatMap(
      BundlerAction.encode.bind(null, chainId),
    );

    return {
      to: bundler3,
      value,
      data: encodeFunctionData({
        abi: bundler3Abi,
        functionName: "multicall",
        args: [encodedActions],
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
        return BundlerAction.erc20Transfer(...args);
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
        const [sender, asset, amount, deadline, signature, skipRevert] = args;
        if (signature == null) throw new BundlerErrors.MissingSignature();

        return BundlerAction.permit(
          chainId,
          sender,
          asset,
          amount,
          deadline,
          signature,
          skipRevert,
        );
      }
      case "permitDai": {
        const [sender, nonce, expiry, allowed, signature, skipRevert] = args;
        if (signature == null) throw new BundlerErrors.MissingSignature();

        return BundlerAction.permitDai(
          chainId,
          sender,
          nonce,
          expiry,
          allowed,
          signature,
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
          skipRevert,
        ] = args;

        return BundlerAction.morphoSupply(
          chainId,
          market,
          assets,
          shares,
          slippageAmount,
          onBehalf,
          onMorphoSupply.flatMap(BundlerAction.encode.bind(null, chainId)),
          skipRevert,
        );
      }
      case "morphoSupplyCollateral": {
        const [market, amount, onBehalf, onMorphoSupplyCollateral, skipRevert] =
          args;

        return BundlerAction.morphoSupplyCollateral(
          chainId,
          market,
          amount,
          onBehalf,
          onMorphoSupplyCollateral.flatMap(
            BundlerAction.encode.bind(null, chainId),
          ),
          skipRevert,
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
          skipRevert,
        ] = args;

        return BundlerAction.morphoRepay(
          chainId,
          market,
          assets,
          shares,
          slippageAmount,
          onBehalf,
          onMorphoRepay.flatMap(BundlerAction.encode.bind(null, chainId)),
          skipRevert,
        );
      }
      case "morphoWithdraw": {
        return BundlerAction.morphoWithdraw(chainId, ...args);
      }
      case "morphoWithdrawCollateral": {
        return BundlerAction.morphoWithdrawCollateral(chainId, ...args);
      }
      case "morphoFlashLoan": {
        const [token, assets, onMorphoFlashLoan, skipRevert] = args;

        return BundlerAction.morphoFlashLoan(
          chainId,
          token,
          assets,
          onMorphoFlashLoan.flatMap(BundlerAction.encode.bind(null, chainId)),
          skipRevert,
        );
      }

      /* PublicAllocator */
      case "reallocateTo": {
        return BundlerAction.publicAllocatorReallocateTo(chainId, ...args);
      }

      /* Paraswap */
      case "paraswapBuy": {
        return BundlerAction.paraswapBuy(chainId, ...args);
      }
      case "paraswapSell": {
        return BundlerAction.paraswapSell(chainId, ...args);
      }
      case "paraswapBuyMorphoDebt": {
        return BundlerAction.paraswapBuyMorphoDebt(chainId, ...args);
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
          aaveV3Optimizer,
          owner,
          isApproved,
          nonce,
          deadline,
          signature,
          skipRevert,
        ] = args;
        if (signature == null) throw new BundlerErrors.MissingSignature();

        return BundlerAction.aaveV3OptimizerApproveManagerWithSig(
          chainId,
          aaveV3Optimizer,
          owner,
          isApproved,
          nonce,
          deadline,
          signature,
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
          skipRevert,
        ] = args;

        if (signature == null) throw new BundlerErrors.MissingSignature();

        return BundlerAction.compoundV3AllowBySig(
          chainId,
          instance,
          owner,
          isAllowed,
          nonce,
          expiry,
          signature,
          skipRevert,
        );
      }

      /* MORPHO token */
      case "morphoWrapperDepositFor": {
        return BundlerAction.morphoWrapperDepositFor(chainId, ...args);
      }
    }

    throw Error(`unhandled action encoding: ${type}`);
  }

  /* ERC20 */

  /**
   * Encodes a call to the GeneralAdapter1 to transfer native tokens (ETH on ethereum, MATIC on polygon, etc).
   * @param chainId The chain id for which to encode the call.
   * @param owner The owner of native tokens.
   * @param recipient The address to send native tokens to.
   * @param amount The amount of native tokens to send (in wei).
   * @param skipRevert Whether to allow the transfer to revert without making the whole bundler revert. Defaults to false.
   */
  export function nativeTransfer(
    chainId: ChainId,
    owner: Address,
    recipient: Address,
    amount: bigint,
    skipRevert = false,
  ): BundlerCall[] {
    const {
      bundler3: { bundler3, generalAdapter1 },
    } = getChainAddresses(chainId);

    if (recipient === bundler3) return [];

    if (owner === generalAdapter1)
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

    return [
      {
        to: recipient,
        data: "0x",
        value: amount,
        skipRevert,
        callbackHash: zeroHash,
      },
    ];
  }

  /**
   * Encodes a call to the requested adapter to transfer ERC20 tokens.
   * @param chainId The chain id for which to encode the call.
   * @param asset The address of the ERC20 token to transfer.
   * @param recipient The address to send tokens to.
   * @param amount The amount of tokens to send.
   * @param adapter The address of the adapter to use.
   * @param skipRevert Whether to allow the transfer to revert without making the whole bundler revert. Defaults to false.
   */
  export function erc20Transfer(
    asset: Address,
    recipient: Address,
    amount: bigint,
    adapter: Address,
    skipRevert = false,
  ): BundlerCall[] {
    return [
      {
        to: adapter,
        data: encodeFunctionData({
          abi: coreAdapterAbi,
          functionName: "erc20Transfer",
          args: [asset, recipient, amount],
        }),
        value: 0n,
        skipRevert,
        callbackHash: zeroHash,
      },
    ];
  }

  /**
   * Encodes a call to the GeneralAdapter1 to transfer ERC20 tokens with `transferFrom`.
   * @param chainId The chain id for which to encode the call.
   * @param asset The address of the ERC20 token to transfer.
   * @param amount The amount of tokens to send.
   * @param recipient The recipient of ERC20 tokens.
   * @param skipRevert Whether to allow the transfer to revert without making the whole bundler revert. Defaults to false.
   */
  export function erc20TransferFrom(
    chainId: ChainId,
    asset: Address,
    amount: bigint,
    recipient: Address,
    skipRevert = false,
  ): BundlerCall[] {
    const {
      bundler3: { generalAdapter1 },
    } = getChainAddresses(chainId);

    return [
      {
        to: generalAdapter1,
        data: encodeFunctionData({
          abi: generalAdapter1Abi,
          functionName: "erc20TransferFrom",
          args: [asset, recipient, amount],
        }),
        value: 0n,
        skipRevert,
        callbackHash: zeroHash,
      },
    ];
  }

  /* Permit */

  /**
   * Encodes a call to the GeneralAdapter1 to permit an ERC20 token.
   * @param chainId The chain id for which to encode the call.
   * @param owner The address which owns the tokens.
   * @param asset The address of the ERC20 token to permit.
   * @param amount The amount of tokens to permit.
   * @param deadline The timestamp until which the signature is valid.
   * @param signature The Ethers signature to permit the tokens.
   * @param skipRevert Whether to allow the permit to revert without making the whole bundle revert. Defaults to true.
   */
  export function permit(
    chainId: ChainId,
    owner: Address,
    asset: Address,
    amount: bigint,
    deadline: bigint,
    signature: Hex,
    skipRevert = true,
  ): BundlerCall[] {
    const {
      bundler3: { generalAdapter1 },
    } = getChainAddresses(chainId);
    const { r, s, yParity } = parseSignature(signature);

    return [
      {
        to: asset,
        data: encodeFunctionData({
          abi: erc2612Abi,
          functionName: "permit",
          args: [
            owner,
            // Never permit any other address than the GeneralAdapter1 otherwise
            // there are no guarantees that the signature can't be used independently.
            generalAdapter1,
            amount,
            deadline,
            yParity + 27,
            r,
            s,
          ],
        }),
        value: 0n,
        skipRevert,
        callbackHash: zeroHash,
      },
    ];
  }

  /**
   * Encodes a call to the GeneralAdapter1 to permit DAI.
   * @param chainId The chain id for which to encode the call.
   * @param owner The address which owns the tokens.
   * @param nonce The permit nonce used.
   * @param expiry The timestamp until which the signature is valid.
   * @param allowed The amount of DAI to permit.
   * @param signature The Ethers signature to permit the tokens.
   * @param skipRevert Whether to allow the permit to revert without making the whole bundle revert.
   */
  export function permitDai(
    chainId: ChainId,
    owner: Address,
    nonce: bigint,
    expiry: bigint,
    allowed: boolean,
    signature: Hex,
    skipRevert = true,
  ): BundlerCall[] {
    const {
      dai,
      bundler3: { generalAdapter1 },
    } = getChainAddresses(chainId);
    if (dai == null)
      throw new BundlerErrors.UnexpectedAction("permitDai", chainId);

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
          args: [
            owner,
            // Never permit any other address than the GeneralAdapter1 otherwise
            // there are no guarantees that the signature can't be used independently.
            generalAdapter1,
            nonce,
            expiry,
            allowed,
            yParity + 27,
            r,
            s,
          ],
        }),
        value: 0n,
        skipRevert,
        callbackHash: zeroHash,
      },
    ];
  }

  /* Permit2 */

  /**
   * Encodes a call to permit the chain's GeneralAdapter1 ERC20 tokens via Permit2.
   * @param chainId The chain id for which to encode the call.
   * @param owner The owner of ERC20 tokens.
   * @param permitSingle The permit details to submit to Permit2.
   * @param signature The Ethers signature to permit the tokens.
   * @param skipRevert Whether to allow the permit to revert without making the whole bundle revert. Defaults to true.
   */
  export function approve2(
    chainId: ChainId,
    owner: Address,
    permitSingle: Permit2PermitSingle,
    signature: Hex,
    skipRevert = true,
  ): BundlerCall[] {
    const {
      permit2,
      bundler3: { generalAdapter1 },
    } = getChainAddresses(chainId);
    if (permit2 == null)
      throw new BundlerErrors.UnexpectedAction("approve2", chainId);

    return [
      {
        to: permit2,
        data: encodeFunctionData({
          abi: permit2Abi,
          functionName: "permit",
          args: [
            owner,
            {
              ...permitSingle,
              // Never permit any other address than the GeneralAdapter1 otherwise
              // there are no guarantees that the signature can't be used independently.
              spender: generalAdapter1,
            },
            signature,
          ],
        }),
        value: 0n,
        skipRevert,
        callbackHash: zeroHash,
      },
    ];
  }

  /**
   * Encodes a call to the GeneralAdapter1 to transfer ERC20 tokens via Permit2.
   * @param chainId The chain id for which to encode the call.
   * @param asset The address of the ERC20 token to transfer.
   * @param owner The owner of ERC20 tokens.
   * @param amount The amount of tokens to send.
   * @param recipient The recipient of ERC20 tokens.
   * @param skipRevert Whether to allow the transfer to revert without making the whole bundler revert. Defaults to false.
   */
  export function transferFrom2(
    chainId: ChainId,
    asset: Address,
    amount: bigint,
    recipient: Address,
    skipRevert = false,
  ): BundlerCall[] {
    const {
      bundler3: { generalAdapter1 },
    } = getChainAddresses(chainId);

    return [
      {
        to: generalAdapter1,
        data: encodeFunctionData({
          abi: generalAdapter1Abi,
          functionName: "permit2TransferFrom",
          args: [asset, recipient, amount],
        }),
        value: 0n,
        skipRevert,
        callbackHash: zeroHash,
      },
    ];
  }

  /**
   * Encodes a call to the GeneralAdapter1 to wrap legacy MORPHO tokens.
   * @param chainId The chain id for which to encode the call.
   * @param recipient The recipient of MORPHO tokens.
   * @param amount The amount of tokens to wrap.
   * @param skipRevert Whether to allow the wrap to revert without making the whole bundler revert. Defaults to false.
   */
  export function morphoWrapperDepositFor(
    chainId: ChainId,
    recipient: Address,
    amount: bigint,
    skipRevert = false,
  ): BundlerCall[] {
    if (chainId !== ChainId.EthMainnet)
      throw new Error("MORPHO wrapping is only available on ethereum mainnet");
    const {
      bundler3: { generalAdapter1 },
    } = getChainAddresses(chainId);

    return [
      {
        to: generalAdapter1,
        data: encodeFunctionData({
          abi: ethereumGeneralAdapter1Abi,
          functionName: "morphoWrapperDepositFor",
          args: [recipient, amount],
        }),
        value: 0n,
        skipRevert,
        callbackHash: zeroHash,
      },
    ];
  }

  /* ERC20 Wrapper */

  /**
   * Encodes a call to the GeneralAdapter1 to wrap ERC20 tokens via the provided ERC20Wrapper.
   * @param chainId The chain id for which to encode the call.
   * @param wrapper The address of the ERC20 wrapper token.
   * @param underlying The address of the underlying ERC20 token.
   * @param amount The amount of tokens to send.
   * @param skipRevert Whether to allow the transfer to revert without making the whole bundler revert. Defaults to false.
   */
  export function erc20WrapperDepositFor(
    chainId: ChainId,
    wrapper: Address,
    underlying: Address,
    amount: bigint,
    skipRevert = false,
  ): BundlerCall[] {
    const {
      bundler3: { generalAdapter1, erc20WrapperAdapter },
    } = getChainAddresses(chainId);

    if (erc20WrapperAdapter == null)
      throw new BundlerErrors.UnexpectedAction(
        "erc20WrapperDepositFor",
        chainId,
      );

    return [
      {
        to: generalAdapter1,
        data: encodeFunctionData({
          abi: generalAdapter1Abi,
          functionName: "erc20Transfer",
          args: [underlying, erc20WrapperAdapter, maxUint256],
        }),
        value: 0n,
        skipRevert,
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
        skipRevert,
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
        skipRevert,
        callbackHash: zeroHash,
      },
    ];
  }

  /**
   * Encodes a call to the GeneralAdapter1 to unwrap ERC20 tokens from the provided ERC20Wrapper.
   * @param chainId The chain id for which to encode the call.
   * @param wrapper The address of the ERC20 wrapper token.
   * @param account The address to send the underlying ERC20 tokens.
   * @param amount The amount of tokens to send.
   * @param skipRevert Whether to allow the transfer to revert without making the whole bundler revert. Defaults to false.
   */
  export function erc20WrapperWithdrawTo(
    chainId: ChainId,
    wrapper: Address,
    receiver: Address,
    amount: bigint,
    skipRevert = false,
  ): BundlerCall[] {
    const {
      bundler3: { generalAdapter1, erc20WrapperAdapter },
    } = getChainAddresses(chainId);

    if (erc20WrapperAdapter == null)
      throw new BundlerErrors.UnexpectedAction(
        "erc20WrapperWithdrawTo",
        chainId,
      );

    return [
      {
        to: generalAdapter1,
        data: encodeFunctionData({
          abi: generalAdapter1Abi,
          functionName: "erc20Transfer",
          args: [wrapper, erc20WrapperAdapter, maxUint256],
        }),
        value: 0n,
        skipRevert,
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
        skipRevert,
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
        skipRevert,
        callbackHash: zeroHash,
      },
    ];
  }

  /* ERC4626 */

  /**
   * Encodes a call to the GeneralAdapter1 to mint shares of the provided ERC4626 vault.
   * @param chainId The chain id for which to encode the call.
   * @param erc4626 The address of the ERC4626 vault.
   * @param shares The amount of shares to mint.
   * @param maxSharePrice The maximum amount of assets to pay to get 1 share (scaled by RAY).
   * @param receiver The address to send the shares to.
   * @param skipRevert Whether to allow the transfer to revert without making the whole bundler revert. Defaults to false.
   */
  export function erc4626Mint(
    chainId: ChainId,
    erc4626: Address,
    shares: bigint,
    maxSharePrice: bigint,
    receiver: Address,
    skipRevert = false,
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
        skipRevert,
        callbackHash: zeroHash,
      },
    ];
  }

  /**
   * Encodes a call to the GeneralAdapter1 to deposit assets into the provided ERC4626 vault.
   * @param chainId The chain id for which to encode the call.
   * @param erc4626 The address of the ERC4626 vault.
   * @param assets The amount of assets to deposit.
   * @param maxSharePrice The maximum amount of assets to pay to get 1 share (scaled by RAY).
   * @param receiver The address to send the shares to.
   * @param skipRevert Whether to allow the transfer to revert without making the whole bundler revert. Defaults to false.
   */
  export function erc4626Deposit(
    chainId: ChainId,
    erc4626: Address,
    assets: bigint,
    maxSharePrice: bigint,
    receiver: Address,
    skipRevert = false,
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
        skipRevert,
        callbackHash: zeroHash,
      },
    ];
  }

  /**
   * Encodes a call to the GeneralAdapter1 to withdraw assets from the provided ERC4626 vault.
   * @param chainId The chain id for which to encode the call.
   * @param erc4626 The address of the ERC4626 vault.
   * @param assets The amount of assets to withdraw.
   * @param minSharePrice The minimum number of assets to receive per share (scaled by RAY).
   * @param receiver The address to send the assets to.
   * @param owner The address on behalf of which the assets are withdrawn.
   * @param skipRevert Whether to allow the transfer to revert without making the whole bundler revert. Defaults to false.
   */
  export function erc4626Withdraw(
    chainId: ChainId,
    erc4626: Address,
    assets: bigint,
    minSharePrice: bigint,
    receiver: Address,
    owner: Address,
    skipRevert = false,
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
        skipRevert,
        callbackHash: zeroHash,
      },
    ];
  }

  /**
   * Encodes a call to the GeneralAdapter1 to redeem shares from the provided ERC4626 vault.
   * @param chainId The chain id for which to encode the call.
   * @param erc4626 The address of the ERC4626 vault.
   * @param shares The amount of shares to redeem.
   * @param minSharePrice The minimum number of assets to receive per share (scaled by RAY).
   * @param receiver The address to send the assets to.
   * @param owner The address on behalf of which the assets are withdrawn.
   * @param skipRevert Whether to allow the transfer to revert without making the whole bundler revert. Defaults to false.
   */
  export function erc4626Redeem(
    chainId: ChainId,
    erc4626: Address,
    shares: bigint,
    minSharePrice: bigint,
    receiver: Address,
    owner: Address,
    skipRevert = false,
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
        skipRevert,
        callbackHash: zeroHash,
      },
    ];
  }

  /* Morpho */

  /**
   * Encodes a call to authorize an account on Morpho Blue.
   * @param chainId The chain id for which to encode the call.
   * @param authorization The authorization details to submit to Morpho Blue.
   * @param signature The Ethers signature to authorize the account.
   * @param skipRevert Whether to allow the authorization call to revert without making the whole bundle revert. Defaults to true.
   */
  export function morphoSetAuthorizationWithSig(
    chainId: ChainId,
    authorization: Authorization,
    signature: Hex,
    skipRevert = true,
  ): BundlerCall[] {
    const {
      morpho,
      bundler3: { bundler3 },
    } = getChainAddresses(chainId);
    const { r, s, yParity } = parseSignature(signature);

    if (authorization.authorized === bundler3)
      throw new BundlerErrors.UnexpectedSignature(authorization.authorized);

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
   * Encodes a call to the GeneralAdapter1 to supply to a Morpho Blue market.
   * @param chainId The chain id for which to encode the call.
   * @param market The market params to supply to.
   * @param assets The amount of assets to supply.
   * @param shares The amount of supply shares to mint.
   * @param slippageAmount The maximum (resp. minimum) amount of assets (resp. supply shares) to supply (resp. mint) (protects the sender from unexpected slippage).
   * @param onBehalf The address to supply on behalf of.
   * @param callbackCalls The array of calls to execute inside Morpho Blue's `onMorphoSupply` callback.
   * @param skipRevert Whether to allow the transfer to revert without making the whole bundler revert. Defaults to false.
   */
  export function morphoSupply(
    chainId: ChainId,
    market: InputMarketParams,
    assets: bigint,
    shares: bigint,
    slippageAmount: bigint,
    onBehalf: Address,
    callbackCalls: BundlerCall[],
    skipRevert = false,
  ): BundlerCall[] {
    const {
      bundler3: { generalAdapter1 },
    } = getChainAddresses(chainId);

    const reenter = callbackCalls.length > 0;
    const reenterData = reenter
      ? encodeAbiParameters(reenterAbiInputs, [callbackCalls])
      : "0x";

    return [
      {
        to: generalAdapter1,
        data: encodeFunctionData({
          abi: generalAdapter1Abi,
          functionName: "morphoSupply",
          args: [market, assets, shares, slippageAmount, onBehalf, reenterData],
        }),
        value: 0n,
        skipRevert,
        callbackHash: reenter ? keccak256(reenterData) : zeroHash,
      },
    ];
  }

  /**
   * Encodes a call to the GeneralAdapter1 to supply collateral to a Morpho Blue market.
   * @param chainId The chain id for which to encode the call.
   * @param market The market params to supply to.
   * @param assets The amount of assets to supply.
   * @param onBehalf The address to supply on behalf of.
   * @param callbackCalls The array of calls to execute inside Morpho Blue's `onMorphoSupplyCollateral` callback.
   * @param skipRevert Whether to allow the transfer to revert without making the whole bundler revert. Defaults to false.
   */
  export function morphoSupplyCollateral(
    chainId: ChainId,
    market: InputMarketParams,
    assets: bigint,
    onBehalf: Address,
    callbackCalls: BundlerCall[],
    skipRevert = false,
  ): BundlerCall[] {
    const {
      bundler3: { generalAdapter1 },
    } = getChainAddresses(chainId);

    const reenter = callbackCalls.length > 0;
    const reenterData = reenter
      ? encodeAbiParameters(reenterAbiInputs, [callbackCalls])
      : "0x";

    return [
      {
        to: generalAdapter1,
        data: encodeFunctionData({
          abi: generalAdapter1Abi,
          functionName: "morphoSupplyCollateral",
          args: [market, assets, onBehalf, reenterData],
        }),
        value: 0n,
        skipRevert,
        callbackHash: reenter ? keccak256(reenterData) : zeroHash,
      },
    ];
  }

  /**
   * Encodes a call to the GeneralAdapter1 to borrow from a Morpho Blue market.
   * @param chainId The chain id for which to encode the call.
   * @param market The market params to borrow from.
   * @param assets The amount of assets to borrow.
   * @param shares The amount of borrow shares to mint.
   * @param slippageAmount The minimum (resp. maximum) amount of assets (resp. borrow shares) to borrow (resp. mint) (protects the sender from unexpected slippage).
   * @param receiver The address to send borrowed tokens to.
   * @param skipRevert Whether to allow the transfer to revert without making the whole bundler revert. Defaults to false.
   */
  export function morphoBorrow(
    chainId: ChainId,
    market: InputMarketParams,
    assets: bigint,
    shares: bigint,
    slippageAmount: bigint,
    receiver: Address,
    skipRevert = false,
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
        skipRevert,
        callbackHash: zeroHash,
      },
    ];
  }

  /**
   * Encodes a call to the GeneralAdapter1 to repay to a Morpho Blue market.
   * @param chainId The chain id for which to encode the call.
   * @param market The market params to repay to.
   * @param assets The amount of assets to repay.
   * @param shares The amount of borrow shares to redeem.
   * @param slippageAmount The maximum (resp. minimum) amount of assets (resp. borrow shares) to repay (resp. redeem) (protects the sender from unexpected slippage).
   * @param onBehalf The address to repay on behalf of.
   * @param callbackCalls The array of calls to execute inside Morpho Blue's `onMorphoSupply` callback.
   * @param skipRevert Whether to allow the transfer to revert without making the whole bundler revert. Defaults to false.
   */
  export function morphoRepay(
    chainId: ChainId,
    market: InputMarketParams,
    assets: bigint,
    shares: bigint,
    slippageAmount: bigint,
    onBehalf: Address,
    callbackCalls: BundlerCall[],
    skipRevert = false,
  ): BundlerCall[] {
    const {
      bundler3: { generalAdapter1 },
    } = getChainAddresses(chainId);

    const reenter = callbackCalls.length > 0;
    const reenterData = reenter
      ? encodeAbiParameters(reenterAbiInputs, [callbackCalls])
      : "0x";

    return [
      {
        to: generalAdapter1,
        data: encodeFunctionData({
          abi: generalAdapter1Abi,
          functionName: "morphoRepay",
          args: [market, assets, shares, slippageAmount, onBehalf, reenterData],
        }),
        value: 0n,
        skipRevert,
        callbackHash: reenter ? keccak256(reenterData) : zeroHash,
      },
    ];
  }

  /**
   * Encodes a call to the GeneralAdapter1 to withdraw from a Morpho Blue market.
   * @param chainId The chain id for which to encode the call.
   * @param market The market params to withdraw from.
   * @param assets The amount of assets to withdraw.
   * @param shares The amount of supply shares to redeem.
   * @param slippageAmount The minimum (resp. maximum) amount of assets (resp. supply shares) to withdraw (resp. redeem) (protects the sender from unexpected slippage).
   * @param receiver The address to send withdrawn tokens to.
   * @param skipRevert Whether to allow the transfer to revert without making the whole bundler revert. Defaults to false.
   */
  export function morphoWithdraw(
    chainId: ChainId,
    market: InputMarketParams,
    assets: bigint,
    shares: bigint,
    slippageAmount: bigint,
    receiver: Address,
    skipRevert = false,
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
        skipRevert,
        callbackHash: zeroHash,
      },
    ];
  }

  /**
   * Encodes a call to the GeneralAdapter1 to withdraw collateral from a Morpho Blue market.
   * @param chainId The chain id for which to encode the call.
   * @param market The market params to withdraw from.
   * @param assets The amount of assets to withdraw.
   * @param receiver The address to send withdrawn tokens to.
   * @param skipRevert Whether to allow the transfer to revert without making the whole bundler revert. Defaults to false.
   */
  export function morphoWithdrawCollateral(
    chainId: ChainId,
    market: InputMarketParams,
    assets: bigint,
    receiver: Address,
    skipRevert = false,
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
        skipRevert,
        callbackHash: zeroHash,
      },
    ];
  }

  /**
   * Encodes a call to the GeneralAdapter1 to flash loan from Morpho Blue.
   * @param chainId The chain id for which to encode the call.
   * @param token The address of the ERC20 token to flash loan.
   * @param assets The amount of tokens to flash loan.
   * @param callbackCalls The array of calls to execute inside Morpho Blue's `onMorphoFlashLoan` callback.
   * @param skipRevert Whether to allow the transfer to revert without making the whole bundler revert. Defaults to false.
   */
  export function morphoFlashLoan(
    chainId: ChainId,
    token: Address,
    assets: bigint,
    callbackCalls: BundlerCall[],
    skipRevert = false,
  ): BundlerCall[] {
    const {
      bundler3: { generalAdapter1 },
    } = getChainAddresses(chainId);

    const reenter = callbackCalls.length > 0;
    const reenterData = reenter
      ? encodeAbiParameters(reenterAbiInputs, [callbackCalls])
      : "0x";

    return [
      {
        to: generalAdapter1,
        data: encodeFunctionData({
          abi: generalAdapter1Abi,
          functionName: "morphoFlashLoan",
          args: [token, assets, reenterData],
        }),
        value: 0n,
        skipRevert,
        callbackHash: reenter ? keccak256(reenterData) : zeroHash,
      },
    ];
  }

  /**
   * Encodes a call to trigger a public reallocation on the PublicAllocator.
   * @param chainId The chain id for which to encode the call.
   * @param vault The vault to reallocate.
   * @param fee The vault public reallocation fee.
   * @param withdrawals The array of withdrawals to perform, before supplying everything to the supply market.
   * @param supplyMarketParams The market params to reallocate to.
   * @param skipRevert Whether to allow the transfer to revert without making the whole bundler revert. Defaults to false.
   */
  export function publicAllocatorReallocateTo(
    chainId: ChainId,
    vault: Address,
    fee: bigint,
    withdrawals: InputReallocation[],
    supplyMarketParams: InputMarketParams,
    skipRevert = false,
  ): BundlerCall[] {
    const { publicAllocator } = getChainAddresses(chainId);
    if (publicAllocator == null)
      throw new BundlerErrors.UnexpectedAction("reallocateTo", chainId);

    return [
      {
        to: publicAllocator,
        data: encodeFunctionData({
          abi: publicAllocatorAbi,
          functionName: "reallocateTo",
          args: [vault, withdrawals, supplyMarketParams],
        }),
        value: fee,
        skipRevert,
        callbackHash: zeroHash,
      },
    ];
  }

  /**
   * Encodes a call to the ParaswapAdapter to buy an exact amount of tokens via Paraswap.
   * @param chainId The chain id for which to encode the call.
   * @param augustus The address of the Augustus router to use.
   * @param callData The encoded call data to execute.
   * @param srcToken The address of the source token.
   * @param dstToken The address of the destination token.
   * @param offsets The offsets in callData of the exact buy amount (`exactAmount`), maximum sell amount (`limitAmount`) and quoted sell amount (`quotedAmount`).
   * @param receiver The address to send the tokens to.
   * @param skipRevert Whether to allow the swap to revert without making the whole bundle revert. Defaults to false.
   */
  export function paraswapBuy(
    chainId: ChainId,
    augustus: Address,
    callData: Hex,
    srcToken: Address,
    dstToken: Address,
    offsets: ParaswapOffsets,
    receiver: Address,
    skipRevert = false,
  ): BundlerCall[] {
    const {
      bundler3: { paraswapAdapter },
    } = getChainAddresses(chainId);

    if (paraswapAdapter == null)
      throw new BundlerErrors.UnexpectedAction("paraswapBuy", chainId);

    return [
      {
        to: paraswapAdapter,
        data: encodeFunctionData({
          abi: paraswapAdapterAbi,
          functionName: "buy",
          args: [augustus, callData, srcToken, dstToken, 0n, offsets, receiver],
        }),
        value: 0n,
        skipRevert,
        callbackHash: zeroHash,
      },
    ];
  }

  /**
   * Encodes a call to the ParaswapAdapter to sell an exact amount of tokens via Paraswap.
   * @param chainId The chain id for which to encode the call.
   * @param augustus The address of the Augustus router to use.
   * @param callData The encoded call data to execute.
   * @param srcToken The address of the source token.
   * @param dstToken The address of the destination token.
   * @param sellEntireBalance Whether to sell the entire balance of the source token.
   * @param offsets The offsets in callData of the exact sell amount (`exactAmount`), minimum buy amount (`limitAmount`) and quoted buy amount (`quotedAmount`).
   * @param receiver The address to send the tokens to.
   * @param skipRevert Whether to allow the swap to revert without making the whole bundle revert. Defaults to false.
   */
  export function paraswapSell(
    chainId: ChainId,
    augustus: Address,
    callData: Hex,
    srcToken: Address,
    dstToken: Address,
    sellEntireBalance: boolean,
    offsets: ParaswapOffsets,
    receiver: Address,
    skipRevert = false,
  ): BundlerCall[] {
    const {
      bundler3: { paraswapAdapter },
    } = getChainAddresses(chainId);

    if (paraswapAdapter == null)
      throw new BundlerErrors.UnexpectedAction("paraswapSell", chainId);

    return [
      {
        to: paraswapAdapter,
        data: encodeFunctionData({
          abi: paraswapAdapterAbi,
          functionName: "sell",
          args: [
            augustus,
            callData,
            srcToken,
            dstToken,
            sellEntireBalance,
            offsets,
            receiver,
          ],
        }),
        value: 0n,
        skipRevert,
        callbackHash: zeroHash,
      },
    ];
  }

  /**
   * Encodes a call to the ParaswapAdapter to buy the exact debt of a position via Paraswap.
   * @param chainId The chain id for which to encode the call.
   * @param augustus The address of the Augustus router to use.
   * @param callData The encoded call data to execute.
   * @param srcToken The address of the source token.
   * @param marketParams The market params of the market with the debt assets to buy.
   * @param offsets The offsets in callData of the exact buy amount (`exactAmount`), maximum sell amount (`limitAmount`) and quoted sell amount (`quotedAmount`).
   * @param onBehalf The address to buy the debt on behalf of.
   * @param receiver The address to send the tokens to.
   * @param skipRevert Whether to allow the swap to revert without making the whole bundle revert. Defaults to false.
   */
  export function paraswapBuyMorphoDebt(
    chainId: ChainId,
    augustus: Address,
    callData: Hex,
    srcToken: Address,
    marketParams: InputMarketParams,
    offsets: ParaswapOffsets,
    onBehalf: Address,
    receiver: Address,
    skipRevert = false,
  ): BundlerCall[] {
    const {
      bundler3: { paraswapAdapter },
    } = getChainAddresses(chainId);

    if (paraswapAdapter == null)
      throw new BundlerErrors.UnexpectedAction(
        "paraswapBuyMorphoDebt",
        chainId,
      );

    return [
      {
        to: paraswapAdapter,
        data: encodeFunctionData({
          abi: paraswapAdapterAbi,
          functionName: "buyMorphoDebt",
          args: [
            augustus,
            callData,
            srcToken,
            marketParams,
            offsets,
            onBehalf,
            receiver,
          ],
        }),
        value: 0n,
        skipRevert,
        callbackHash: zeroHash,
      },
    ];
  }

  /* Universal Rewards Distributor */

  /**
   * Encodes a call to the Universal Rewards Distributor to claim rewards.
   * @param chainId The chain id for which to encode the call.
   * @param distributor The address of the distributor to claim rewards from.
   * @param account The address to claim rewards for.
   * @param reward The address of the reward token to claim.
   * @param amount The amount of rewards to claim.
   * @param proof The Merkle proof to claim the rewards.
   * @param skipRevert Whether to allow the claim to revert without making the whole bundle revert. Defaults to true.
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
   * Encodes a call to the GeneralAdapter1 to wrap native tokens (ETH to WETH on ethereum, MATIC to WMATIC on polygon, etc).
   * @param chainId The chain id for which to encode the call.
   * @param amount The amount of native tokens to wrap (in wei).
   * @param recipient The address to send tokens to.
   * @param skipRevert Whether to allow the transfer to revert without making the whole bundler revert. Defaults to false.
   */
  export function wrapNative(
    chainId: ChainId,
    amount: bigint,
    recipient: Address,
    skipRevert = false,
  ): BundlerCall[] {
    const {
      bundler3: { generalAdapter1 },
    } = getChainAddresses(chainId);

    return [
      {
        to: generalAdapter1,
        data: encodeFunctionData({
          abi: generalAdapter1Abi,
          functionName: "wrapNative",
          args: [amount, recipient],
        }),
        value: 0n,
        skipRevert,
        callbackHash: zeroHash,
      },
    ];
  }

  /**
   * Encodes a call to the GeneralAdapter1 to unwrap native tokens (WETH to ETH on ethereum, WMATIC to MATIC on polygon, etc).
   * @param chainId The chain id for which to encode the call.
   * @param amount The amount of native tokens to unwrap (in wei).
   * @param recipient The address to send tokens to.
   * @param skipRevert Whether to allow the transfer to revert without making the whole bundler revert. Defaults to false.
   */
  export function unwrapNative(
    chainId: ChainId,
    amount: bigint,
    recipient: Address,
    skipRevert = false,
  ): BundlerCall[] {
    const {
      bundler3: { generalAdapter1 },
    } = getChainAddresses(chainId);

    return [
      {
        to: generalAdapter1,
        data: encodeFunctionData({
          abi: generalAdapter1Abi,
          functionName: "unwrapNative",
          args: [amount, recipient],
        }),
        value: 0n,
        skipRevert,
        callbackHash: zeroHash,
      },
    ];
  }

  /* stETH */

  /**
   * Encodes a call to the GeneralAdapter1 to stake native tokens using Lido (ETH to stETH on ethereum).
   * @param chainId The chain id for which to encode the call.
   * @param amount The amount of native tokens to stake (in wei).
   * @param maxSharePrice The maximum amount of wei to pay for minting 1 share (scaled by RAY).
   * @param referral The referral address to use.
   * @param recipient The address to send stETH to.
   * @param skipRevert Whether to allow the transfer to revert without making the whole bundler revert. Defaults to false.
   */
  export function stakeEth(
    chainId: ChainId,
    amount: bigint,
    maxSharePrice: bigint,
    referral: Address,
    recipient: Address,
    skipRevert = false,
  ): BundlerCall[] {
    const {
      bundler3: { generalAdapter1 },
    } = getChainAddresses(chainId);

    return [
      {
        to: generalAdapter1,
        data: encodeFunctionData({
          abi: ethereumGeneralAdapter1Abi,
          functionName: "stakeEth",
          args: [amount, maxSharePrice, referral, recipient],
        }),
        value: 0n,
        skipRevert,
        callbackHash: zeroHash,
      },
    ];
  }

  /* Wrapped stETH */

  /**
   * Encodes a call to the GeneralAdapter1 to wrap stETH (stETH to wstETH on ethereum).
   * @param chainId The chain id for which to encode the call.
   * @param amount The amount of stETH to wrap (in wei).
   * @param recipient The address to send wstETH to.
   * @param skipRevert Whether to allow the transfer to revert without making the whole bundler revert. Defaults to false.
   */
  export function wrapStEth(
    chainId: ChainId,
    amount: bigint,
    recipient: Address,
    skipRevert = false,
  ): BundlerCall[] {
    const {
      bundler3: { generalAdapter1 },
    } = getChainAddresses(chainId);

    return [
      {
        to: generalAdapter1,
        data: encodeFunctionData({
          abi: ethereumGeneralAdapter1Abi,
          functionName: "wrapStEth",
          args: [amount, recipient],
        }),
        value: 0n,
        skipRevert,
        callbackHash: zeroHash,
      },
    ];
  }

  /**
   * Encodes a call to the GeneralAdapter1 to unwrap wstETH (wstETH to stETH on ethereum).
   * @param chainId The chain id for which to encode the call.
   * @param amount The amount of wstETH to unwrap (in wei).
   * @param recipient The address to send stETH to.
   * @param skipRevert Whether to allow the transfer to revert without making the whole bundler revert. Defaults to false.
   */
  export function unwrapStEth(
    chainId: ChainId,
    amount: bigint,
    recipient: Address,
    skipRevert = false,
  ): BundlerCall[] {
    const {
      bundler3: { generalAdapter1 },
    } = getChainAddresses(chainId);

    return [
      {
        to: generalAdapter1,
        data: encodeFunctionData({
          abi: ethereumGeneralAdapter1Abi,
          functionName: "unwrapStEth",
          args: [amount, recipient],
        }),
        value: 0n,
        skipRevert,
        callbackHash: zeroHash,
      },
    ];
  }

  /* AaveV2 */

  /**
   * Encodes a call to the AaveV2MigrationAdapter to repay a debt on AaveV2.
   * @param chainId The chain id for which to encode the call.
   * @param asset The debt asset to repay.
   * @param amount The amount of debt to repay.
   * @param onBehalf The address on behalf of which to repay.
   * @param rateMode The interest rate mode used by the debt to repay.
   * @param skipRevert Whether to allow the transfer to revert without making the whole bundler revert. Defaults to false.
   */
  export function aaveV2Repay(
    chainId: ChainId,
    asset: Address,
    amount: bigint,
    onBehalf: Address,
    rateMode = 1n,
    skipRevert = false,
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
        skipRevert,
        callbackHash: zeroHash,
      },
    ];
  }

  /**
   * Encodes a call to the AaveV2MigrationAdapter to withdraw from AaveV2.
   * @param chainId The chain id for which to encode the call.
   * @param asset The asset to withdraw.
   * @param amount The amount of asset to withdraw.
   * @param recipient The recipient of ERC20 tokens.
   * @param skipRevert Whether to allow the transfer to revert without making the whole bundler revert. Defaults to false.
   */
  export function aaveV2Withdraw(
    chainId: ChainId,
    asset: Address,
    amount: bigint,
    recipient: Address,
    skipRevert = false,
  ): BundlerCall[] {
    const {
      bundler3: { aaveV2MigrationAdapter },
    } = getChainAddresses(chainId);
    if (aaveV2MigrationAdapter == null)
      throw new BundlerErrors.UnexpectedAction("aaveV2Withdraw", chainId);

    return [
      {
        to: aaveV2MigrationAdapter,
        data: encodeFunctionData({
          abi: aaveV2MigrationAdapterAbi,
          functionName: "aaveV2Withdraw",
          args: [asset, amount, recipient],
        }),
        value: 0n,
        skipRevert,
        callbackHash: zeroHash,
      },
    ];
  }

  /* AaveV3 */

  /**
   * Encodes a call to the AaveV3CoreMigrationAdapter to repay a debt on AaveV3.
   * @param chainId The chain id for which to encode the call.
   * @param asset The debt asset to repay.
   * @param amount The amount of debt to repay.
   * @param onBehalf The address on behalf of which to repay.
   * @param rateMode The interest rate mode used by the debt to repay.
   * @param skipRevert Whether to allow the transfer to revert without making the whole bundler revert. Defaults to false.
   */
  export function aaveV3Repay(
    chainId: ChainId,
    asset: Address,
    amount: bigint,
    onBehalf: Address,
    rateMode = 1n,
    skipRevert = false,
  ): BundlerCall[] {
    const {
      bundler3: { aaveV3CoreMigrationAdapter }, // TODO: choose between core & prime
    } = getChainAddresses(chainId);
    if (aaveV3CoreMigrationAdapter == null)
      throw new BundlerErrors.UnexpectedAction("aaveV3Repay", chainId);

    return [
      {
        to: aaveV3CoreMigrationAdapter,
        data: encodeFunctionData({
          abi: aaveV3MigrationAdapterAbi,
          functionName: "aaveV3Repay",
          args: [asset, amount, rateMode, onBehalf],
        }),
        value: 0n,
        skipRevert,
        callbackHash: zeroHash,
      },
    ];
  }

  /**
   * Encodes a call to the AaveV3CoreMigrationAdapter to withdrawn from AaveV3.
   * @param chainId The chain id for which to encode the call.
   * @param asset The asset to withdraw.
   * @param amount The amount of asset to withdraw.
   * @param recipient The recipient of ERC20 tokens.
   * @param skipRevert Whether to allow the transfer to revert without making the whole bundler revert. Defaults to false.
   */
  export function aaveV3Withdraw(
    chainId: ChainId,
    asset: Address,
    amount: bigint,
    recipient: Address,
    skipRevert = false,
  ): BundlerCall[] {
    const {
      bundler3: { aaveV3CoreMigrationAdapter }, // TODO: choose between core & prime
    } = getChainAddresses(chainId);
    if (aaveV3CoreMigrationAdapter == null)
      throw new BundlerErrors.UnexpectedAction("aaveV3Withdraw", chainId);

    return [
      {
        to: aaveV3CoreMigrationAdapter,
        data: encodeFunctionData({
          abi: aaveV3MigrationAdapterAbi,
          functionName: "aaveV3Withdraw",
          args: [asset, amount, recipient],
        }),
        value: 0n,
        skipRevert,
        callbackHash: zeroHash,
      },
    ];
  }

  /* AaveV3 Optimizer */

  /**
   * Encodes a call to the AaveV3OptimizerMigrationAdapter to repay a debt on Morpho's AaveV3Optimizer.
   * @param chainId The chain id for which to encode the call.
   * @param underlying The underlying debt asset to repay.
   * @param amount The amount of debt to repay.
   * @param onBehalf The address on behalf of which to repay.
   * @param skipRevert Whether to allow the transfer to revert without making the whole bundler revert. Defaults to false.
   */
  export function aaveV3OptimizerRepay(
    chainId: ChainId,
    underlying: Address,
    amount: bigint,
    onBehalf: Address,
    skipRevert = false,
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
        skipRevert,
        callbackHash: zeroHash,
      },
    ];
  }

  /**
   * Encodes a call to the AaveV3OptimizerMigrationAdapter to withdraw from Morpho's AaveV3Optimizer.
   * @param chainId The chain id for which to encode the call.
   * @param underlying The underlying asset to withdraw.
   * @param amount The amount to withdraw.
   * @param maxIterations The maximum amount of iterations to use for the withdrawal.
   * @param recipient The recipient of ERC20 tokens.
   * @param skipRevert Whether to allow the transfer to revert without making the whole bundler revert. Defaults to false.
   */
  export function aaveV3OptimizerWithdraw(
    chainId: ChainId,
    underlying: Address,
    amount: bigint,
    maxIterations: bigint,
    recipient: Address,
    skipRevert = false,
  ): BundlerCall[] {
    const {
      bundler3: { aaveV3OptimizerMigrationAdapter },
    } = getChainAddresses(chainId);
    if (aaveV3OptimizerMigrationAdapter == null)
      throw new BundlerErrors.UnexpectedAction(
        "aaveV3OptimizerWithdraw",
        chainId,
      );

    return [
      {
        to: aaveV3OptimizerMigrationAdapter,
        data: encodeFunctionData({
          abi: aaveV3OptimizerMigrationAdapterAbi,
          functionName: "aaveV3OptimizerWithdraw",
          args: [underlying, amount, maxIterations, recipient],
        }),
        value: 0n,
        skipRevert,
        callbackHash: zeroHash,
      },
    ];
  }

  /**
   * Encodes a call to the AaveV3OptimizerMigrationAdapter to withdraw collateral from Morpho's AaveV3Optimizer.
   * @param chainId The chain id for which to encode the call.
   * @param underlying The underlying asset to withdraw.
   * @param amount The amount to withdraw.
   * @param recipient The recipient of ERC20 tokens.
   * @param skipRevert Whether to allow the transfer to revert without making the whole bundler revert. Defaults to false.
   */
  export function aaveV3OptimizerWithdrawCollateral(
    chainId: ChainId,
    underlying: Address,
    amount: bigint,
    recipient: Address,
    skipRevert = false,
  ): BundlerCall[] {
    const {
      bundler3: { aaveV3OptimizerMigrationAdapter },
    } = getChainAddresses(chainId);
    if (aaveV3OptimizerMigrationAdapter == null)
      throw new BundlerErrors.UnexpectedAction(
        "aaveV3OptimizerWithdrawCollateral",
        chainId,
      );

    return [
      {
        to: aaveV3OptimizerMigrationAdapter,
        data: encodeFunctionData({
          abi: aaveV3OptimizerMigrationAdapterAbi,
          functionName: "aaveV3OptimizerWithdrawCollateral",
          args: [underlying, amount, recipient],
        }),
        value: 0n,
        skipRevert,
        callbackHash: zeroHash,
      },
    ];
  }

  /**
   * Encodes a call to the AaveV3 optimizer to approve the chain's AaveV3OptimizerMigrationAdapter.
   * as the sender's manager on Morpho's AaveV3Optimizer.
   * @param chainId The chain id for which to encode the call.
   * @param owner The owner of the AaveV3Optimizer position.
   * @param isApproved Whether the manager is approved.
   * @param nonce The nonce used to sign.
   * @param deadline The timestamp until which the signature is valid.
   * @param signature The Ethers signature to submit.
   * @param skipRevert Whether to allow the signature to revert without making the whole bundle revert. Defaults to true.
   */
  export function aaveV3OptimizerApproveManagerWithSig(
    chainId: ChainId,
    aaveV3Optimizer: Address,
    owner: Address,
    isApproved: boolean,
    nonce: bigint,
    deadline: bigint,
    signature: Hex,
    skipRevert = true,
  ): BundlerCall[] {
    const {
      bundler3: { aaveV3OptimizerMigrationAdapter },
    } = getChainAddresses(chainId);
    if (aaveV3OptimizerMigrationAdapter == null)
      throw new BundlerErrors.UnexpectedAction(
        "aaveV3OptimizerApproveManagerWithSig",
        chainId,
      );

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
            aaveV3OptimizerMigrationAdapter,
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
   * Encodes a call to the CompoundV2MigrationAdapter to repay a debt on CompoundV2.
   * @param chainId The chain id for which to encode the call.
   * @param cToken The cToken on which to repay the debt.
   * @param amount The amount of debt to repay.
   * @param onBehalf The account on behalf of which to repay.
   * @param skipRevert Whether to allow the transfer to revert without making the whole bundler revert. Defaults to false.
   */
  export function compoundV2Repay(
    chainId: ChainId,
    cToken: Address,
    amount: bigint,
    isEth: boolean,
    onBehalf: Address,
    skipRevert = false,
  ): BundlerCall[] {
    const {
      bundler3: { compoundV2MigrationAdapter },
    } = getChainAddresses(chainId);
    if (compoundV2MigrationAdapter == null)
      throw new BundlerErrors.UnexpectedAction("compoundV2Repay", chainId);

    return [
      {
        to: compoundV2MigrationAdapter,
        data: isEth
          ? encodeFunctionData({
              abi: compoundV2MigrationAdapterAbi,
              functionName: "compoundV2RepayEth",
              args: [amount, onBehalf],
            })
          : encodeFunctionData({
              abi: compoundV2MigrationAdapterAbi,
              functionName: "compoundV2RepayErc20",
              args: [cToken, amount, onBehalf],
            }),
        value: isEth ? amount : 0n,
        skipRevert,
        callbackHash: zeroHash,
      },
    ];
  }

  /**
   * Encodes a call to the CompoundV2MigrationAdapter to withdraw collateral from CompoundV2.
   * @param chainId The chain id for which to encode the call.
   * @param cToken The cToken on which to withdraw.
   * @param amount The amount to withdraw.
   * @param recipient The recipient of ERC20 tokens.
   * @param skipRevert Whether to allow the transfer to revert without making the whole bundler revert. Defaults to false.
   */
  export function compoundV2Redeem(
    chainId: ChainId,
    cToken: Address,
    amount: bigint,
    isEth: boolean,
    recipient: Address,
    skipRevert = false,
  ): BundlerCall[] {
    const {
      bundler3: { compoundV2MigrationAdapter },
    } = getChainAddresses(chainId);
    if (compoundV2MigrationAdapter == null)
      throw new BundlerErrors.UnexpectedAction("compoundV2Repay", chainId);

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
        skipRevert,
        callbackHash: zeroHash,
      },
    ];
  }

  /* CompoundV3 */

  /**
   * Encodes a call to the CompoundV3MigrationAdapter to repay a debt on CompoundV3.
   * @param chainId The chain id for which to encode the call.
   * @param instance The CompoundV3 instance on which to repay the debt.
   * @param amount The amount of debt to repay.
   * @param onBehalf The address on behalf of which to repay.
   * @param skipRevert Whether to allow the transfer to revert without making the whole bundler revert. Defaults to false.
   */
  export function compoundV3Repay(
    chainId: ChainId,
    instance: Address,
    amount: bigint,
    onBehalf: Address,
    skipRevert = false,
  ): BundlerCall[] {
    const {
      bundler3: { compoundV3MigrationAdapter },
    } = getChainAddresses(chainId);
    if (compoundV3MigrationAdapter == null)
      throw new BundlerErrors.UnexpectedAction("compoundV3Repay", chainId);

    return [
      {
        to: compoundV3MigrationAdapter,
        data: encodeFunctionData({
          abi: compoundV3MigrationAdapterAbi,
          functionName: "compoundV3Repay",
          args: [instance, amount, onBehalf],
        }),
        value: 0n,
        skipRevert,
        callbackHash: zeroHash,
      },
    ];
  }

  /**
   * Encodes a call to the CompoundV3MigrationAdapter to withdraw collateral from CompoundV3.
   * @param chainId The chain id for which to encode the call.
   * @param instance The CompoundV3 instance on which to withdraw.
   * @param asset The asset to withdraw.
   * @param amount The amount to withdraw.
   * @param recipient The recipient of ERC20 tokens.
   * @param skipRevert Whether to allow the transfer to revert without making the whole bundler revert. Defaults to false.
   */
  export function compoundV3WithdrawFrom(
    chainId: ChainId,
    instance: Address,
    asset: Address,
    amount: bigint,
    recipient: Address,
    skipRevert = false,
  ): BundlerCall[] {
    const {
      bundler3: { compoundV3MigrationAdapter },
    } = getChainAddresses(chainId);
    if (compoundV3MigrationAdapter == null)
      throw new BundlerErrors.UnexpectedAction(
        "compoundV3WithdrawFrom",
        chainId,
      );

    return [
      {
        to: compoundV3MigrationAdapter,
        data: encodeFunctionData({
          abi: compoundV3MigrationAdapterAbi,
          functionName: "compoundV3WithdrawFrom",
          args: [instance, asset, amount, recipient],
        }),
        value: 0n,
        skipRevert,
        callbackHash: zeroHash,
      },
    ];
  }

  /**
   * Encodes a call to the CompoundV3 instance to allow the chain's CompoundV3MigrationAdapter.
   * to act on the sender's position on CompoundV3.
   * @param chainId The chain id for which to encode the call.
   * @param instance The CompoundV3 instance on which to submit the signature.
   * @param owner The owner of the CompoundV3 position.
   * @param isAllowed Whether the manager is allowed.
   * @param nonce The nonce used to sign.
   * @param expiry The timestamp until which the signature is valid.
   * @param signature The Ethers signature to submit.
   * @param skipRevert Whether to allow the signature to revert without making the whole bundle revert. Defaults to true.
   */
  export function compoundV3AllowBySig(
    chainId: ChainId,
    instance: Address,
    owner: Address,
    isAllowed: boolean,
    nonce: bigint,
    expiry: bigint,
    signature: Hex,
    skipRevert = true,
  ): BundlerCall[] {
    const {
      bundler3: { compoundV3MigrationAdapter },
    } = getChainAddresses(chainId);
    if (compoundV3MigrationAdapter == null)
      throw new BundlerErrors.UnexpectedAction("compoundV3AllowBySig", chainId);

    const { r, s, yParity } = parseSignature(signature);

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
          args: [
            owner,
            compoundV3MigrationAdapter,
            isAllowed,
            nonce,
            expiry,
            yParity + 27,
            r,
            s,
          ],
        }),
        value: 0n,
        skipRevert,
        callbackHash: zeroHash,
      },
    ];
  }
}
