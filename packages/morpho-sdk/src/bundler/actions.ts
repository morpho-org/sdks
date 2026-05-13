import {
  getChainAddresses,
  type InputMarketParams,
} from "@morpho-org/blue-sdk";
import {
  erc2612Abi,
  permit2Abi,
  publicAllocatorAbi,
} from "@morpho-org/blue-sdk-viem";
import {
  type Address,
  encodeAbiParameters,
  encodeFunctionData,
  type Hex,
  isAddressEqual,
  keccak256,
  parseSignature,
  zeroHash,
} from "viem";
import { bundler3Abi, coreAdapterAbi, generalAdapter1Abi } from "../abis.js";
import { BundlerErrors } from "../types/error.js";
import type {
  Action,
  InputReallocation,
  Permit2PermitSingle,
} from "./types.js";

export type {
  Action,
  ActionArgs,
  Actions,
  ActionType,
  Authorization,
  InputReallocation,
  Permit2PermitSingle,
  Permit2PermitSingleDetails,
} from "./types.js";

/**
 * Encoded low-level call consumed by Bundler3's `multicall`.
 */
export interface BundlerCall {
  /** Contract or account called by Bundler3. */
  readonly to: Address;

  /** ABI-encoded calldata sent to `to`. */
  readonly data: Hex;

  /** Native-token value sent with the call. */
  readonly value: bigint;

  /** Whether Bundler3 should continue when the call reverts. */
  readonly skipRevert: boolean;

  /** Expected callback hash for calls that reenter Bundler3, or zero hash. */
  readonly callbackHash: Hex;
}

const reenterAbiInputs = bundler3Abi.find(
  (item) => item.type === "function" && item.name === "reenter",
)!.inputs;

const encodeCallbackCalls = (callbackCalls: BundlerCall[]) => {
  const reenter = callbackCalls.length > 0;
  const reenterData = reenter
    ? encodeAbiParameters(reenterAbiInputs, [callbackCalls])
    : "0x";

  return {
    callbackHash: reenter ? keccak256(reenterData) : zeroHash,
    reenterData,
  } as const;
};

/**
 * Encodes the Bundler3 action subset used by `morpho-sdk` transaction builders.
 *
 * @remarks
 * The namespace covers only the Bundler3 actions required by `morpho-sdk`.
 * It does not expose operation population or simulation helpers from
 * `@morpho-org/bundler-sdk-viem`.
 */
export namespace BundlerAction {
  /**
   * Encodes a list of Bundler3 actions into a single Bundler3 multicall
   * transaction request.
   *
   * @param chainId - Chain where the bundle will execute.
   * @param actions - Ordered Bundler3 actions to encode.
   * @returns Transaction target, calldata, and native value inferred from
   * native-transfer actions.
   *
   * @example
   * ```ts
   * import { getChainAddresses } from "@morpho-org/blue-sdk";
   * import { BundlerAction } from "@morpho-org/morpho-sdk/bundler";
   *
   * const { generalAdapter1 } = getChainAddresses(1).bundler3;
   * const sender = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
   *
   * const tx = BundlerAction.encodeBundle(1, [
   *   {
   *     type: "nativeTransfer",
   *     args: [sender, generalAdapter1, 1_000000000000000000n],
   *   },
   * ]);
   * ```
   */
  export function encodeBundle(chainId: number, actions: Action[]) {
    const {
      bundler3: { bundler3, generalAdapter1 },
    } = getChainAddresses(chainId);

    let value = 0n;

    for (const { type, args } of actions) {
      if (type !== "nativeTransfer") continue;

      const [owner, recipient, amount] = args;

      if (
        !isAddressEqual(owner, bundler3) &&
        !isAddressEqual(owner, generalAdapter1) &&
        (isAddressEqual(recipient, bundler3) ||
          isAddressEqual(recipient, generalAdapter1))
      ) {
        value += amount;
      }
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

  /**
   * Encodes a single supported Bundler3 action into one or more low-level
   * Bundler3 calls.
   *
   * @param chainId - Chain where the action will execute.
   * @param action - Bundler3 action to encode.
   * @returns Encoded Bundler3 calls.
   * @throws {BundlerErrors.MissingSignature} when a signature action is unsigned.
   * @throws {BundlerErrors.UnexpectedAction} when the action is unavailable on the chain.
   *
   * @example
   * ```ts
   * import { BundlerAction } from "@morpho-org/morpho-sdk/bundler";
   *
   * const recipient = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
   *
   * const calls = BundlerAction.encode(1, {
   *   type: "wrapNative",
   *   args: [1_000000000000000000n, recipient],
   * });
   * ```
   */
  export function encode(chainId: number, action: Action): BundlerCall[] {
    const { type, args } = action;

    switch (type) {
      case "nativeTransfer": {
        return BundlerAction.nativeTransfer(chainId, ...args);
      }
      case "erc20Transfer": {
        return BundlerAction.erc20Transfer(...args);
      }
      case "erc20TransferFrom": {
        return BundlerAction.erc20TransferFrom(chainId, ...args);
      }
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
      case "erc4626Deposit": {
        return BundlerAction.erc4626Deposit(chainId, ...args);
      }
      case "erc4626Redeem": {
        return BundlerAction.erc4626Redeem(chainId, ...args);
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
      case "morphoWithdrawCollateral": {
        return BundlerAction.morphoWithdrawCollateral(chainId, ...args);
      }
      case "reallocateTo": {
        return BundlerAction.publicAllocatorReallocateTo(chainId, ...args);
      }
      case "wrapNative": {
        return BundlerAction.wrapNative(chainId, ...args);
      }
    }
  }

  /**
   * Encodes a native-token transfer for Bundler3 execution.
   *
   * @param chainId - Chain where the action will execute.
   * @param owner - Current native-token owner in the bundle.
   * @param recipient - Native-token recipient.
   * @param amount - Native-token amount in wei.
   * @param skipRevert - Whether Bundler3 should tolerate a revert.
   * @returns Encoded Bundler3 calls.
   *
   * @example
   * ```ts
   * import { BundlerAction } from "@morpho-org/morpho-sdk/bundler";
   *
   * const sender = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
   * const recipient = "0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359";
   *
   * const calls = BundlerAction.nativeTransfer(
   *   1,
   *   sender,
   *   recipient,
   *   1_000000000000000000n,
   * );
   * ```
   */
  // biome-ignore lint/complexity/useMaxParams: TODO refactor to ≤2 params
  export function nativeTransfer(
    chainId: number,
    owner: Address,
    recipient: Address,
    amount: bigint,
    skipRevert = false,
  ): BundlerCall[] {
    const {
      bundler3: { bundler3, generalAdapter1 },
    } = getChainAddresses(chainId);

    if (isAddressEqual(recipient, bundler3)) return [];

    if (isAddressEqual(owner, generalAdapter1)) {
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
   * Encodes an ERC20 transfer from the given adapter.
   *
   * @param asset - ERC20 token to transfer.
   * @param recipient - Recipient of the transferred tokens.
   * @param amount - Token amount to transfer.
   * @param adapter - Adapter that currently holds the tokens.
   * @param skipRevert - Whether Bundler3 should tolerate a revert.
   * @returns Encoded Bundler3 calls.
   *
   * @example
   * ```ts
   * import { getChainAddresses } from "@morpho-org/blue-sdk";
   * import { BundlerAction } from "@morpho-org/morpho-sdk/bundler";
   *
   * const adapter = getChainAddresses(1).bundler3.generalAdapter1;
   * const asset = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
   * const recipient = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
   *
   * const calls = BundlerAction.erc20Transfer(
   *   asset,
   *   recipient,
   *   100n,
   *   adapter,
   * );
   * ```
   */
  // biome-ignore lint/complexity/useMaxParams: TODO refactor to ≤2 params
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
   * Encodes a GeneralAdapter1 ERC20 `transferFrom`.
   *
   * @param chainId - Chain where the action will execute.
   * @param asset - ERC20 token to transfer.
   * @param amount - Token amount to transfer.
   * @param recipient - Recipient of the transferred tokens.
   * @param skipRevert - Whether Bundler3 should tolerate a revert.
   * @returns Encoded Bundler3 calls.
   *
   * @example
   * ```ts
   * import { BundlerAction } from "@morpho-org/morpho-sdk/bundler";
   *
   * const asset = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
   * const recipient = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
   *
   * const calls = BundlerAction.erc20TransferFrom(
   *   1,
   *   asset,
   *   100n,
   *   recipient,
   * );
   * ```
   */
  // biome-ignore lint/complexity/useMaxParams: TODO refactor to ≤2 params
  export function erc20TransferFrom(
    chainId: number,
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

  /**
   * Encodes an ERC20 permit for GeneralAdapter1 spending.
   *
   * @param chainId - Chain where the action will execute.
   * @param owner - Token owner signing the permit.
   * @param asset - ERC20 token being permitted.
   * @param amount - Allowance amount.
   * @param deadline - Permit deadline timestamp.
   * @param signature - Owner signature.
   * @param skipRevert - Whether Bundler3 should tolerate a revert.
   * @returns Encoded Bundler3 calls.
   *
   * @example
   * ```ts
   * import { BundlerAction } from "@morpho-org/morpho-sdk/bundler";
   *
   * const owner = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
   * const asset = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
   * const signature =
   *   "0x111111111111111111111111111111111111111111111111111111111111111122222222222222222222222222222222222222222222222222222222222222221b";
   *
   * const calls = BundlerAction.permit(
   *   1,
   *   owner,
   *   asset,
   *   100n,
   *   1_900_000_000n,
   *   signature,
   * );
   * ```
   */
  // biome-ignore lint/complexity/useMaxParams: TODO refactor to ≤2 params
  export function permit(
    chainId: number,
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
          args: [owner, generalAdapter1, amount, deadline, yParity + 27, r, s],
        }),
        value: 0n,
        skipRevert,
        callbackHash: zeroHash,
      },
    ];
  }

  /**
   * Encodes a Permit2 approval for GeneralAdapter1 spending.
   *
   * @param chainId - Chain where the action will execute.
   * @param owner - Token owner signing the Permit2 payload.
   * @param permitSingle - Permit2 allowance payload.
   * @param signature - Owner signature.
   * @param skipRevert - Whether Bundler3 should tolerate a revert.
   * @returns Encoded Bundler3 calls.
   * @throws {BundlerErrors.UnexpectedAction} when Permit2 is unavailable on the chain.
   *
   * @example
   * ```ts
   * import { BundlerAction } from "@morpho-org/morpho-sdk/bundler";
   *
   * const owner = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
   * const token = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
   * const signature =
   *   "0x111111111111111111111111111111111111111111111111111111111111111122222222222222222222222222222222222222222222222222222222222222221b";
   *
   * const calls = BundlerAction.approve2(
   *   1,
   *   owner,
   *   {
   *     details: {
   *       token,
   *       amount: 100n,
   *       expiration: 1_900_000_000,
   *       nonce: 0,
   *     },
   *     sigDeadline: 1_900_000_000n,
   *   },
   *   signature,
   * );
   * ```
   */
  // biome-ignore lint/complexity/useMaxParams: TODO refactor to ≤2 params
  export function approve2(
    chainId: number,
    owner: Address,
    permitSingle: Permit2PermitSingle,
    signature: Hex,
    skipRevert = true,
  ): BundlerCall[] {
    const {
      permit2,
      bundler3: { generalAdapter1 },
    } = getChainAddresses(chainId);
    if (permit2 == null) {
      throw new BundlerErrors.UnexpectedAction("approve2", chainId);
    }

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
   * Encodes a GeneralAdapter1 Permit2 transfer.
   *
   * @param chainId - Chain where the action will execute.
   * @param asset - ERC20 token to transfer through Permit2.
   * @param amount - Token amount to transfer.
   * @param recipient - Recipient of the transferred tokens.
   * @param skipRevert - Whether Bundler3 should tolerate a revert.
   * @returns Encoded Bundler3 calls.
   *
   * @example
   * ```ts
   * import { BundlerAction } from "@morpho-org/morpho-sdk/bundler";
   *
   * const asset = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
   * const recipient = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
   *
   * const calls = BundlerAction.transferFrom2(
   *   1,
   *   asset,
   *   100n,
   *   recipient,
   * );
   * ```
   */
  // biome-ignore lint/complexity/useMaxParams: TODO refactor to ≤2 params
  export function transferFrom2(
    chainId: number,
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
   * Encodes a GeneralAdapter1 ERC4626 deposit.
   *
   * @param chainId - Chain where the action will execute.
   * @param erc4626 - ERC4626 vault address.
   * @param assets - Asset amount to deposit.
   * @param maxSharePrice - Maximum accepted share price in RAY.
   * @param receiver - Recipient of minted vault shares.
   * @param skipRevert - Whether Bundler3 should tolerate a revert.
   * @returns Encoded Bundler3 calls.
   *
   * @example
   * ```ts
   * import { BundlerAction } from "@morpho-org/morpho-sdk/bundler";
   *
   * const vault = "0x186514400e52270cef3D80e1c6F8d10A75d47344";
   * const recipient = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
   *
   * const calls = BundlerAction.erc4626Deposit(
   *   1,
   *   vault,
   *   100n,
   *   1_000000000000000000000000000n,
   *   recipient,
   * );
   * ```
   */
  // biome-ignore lint/complexity/useMaxParams: TODO refactor to ≤2 params
  export function erc4626Deposit(
    chainId: number,
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
   * Encodes a GeneralAdapter1 ERC4626 redeem.
   *
   * @param chainId - Chain where the action will execute.
   * @param erc4626 - ERC4626 vault address.
   * @param shares - Share amount to redeem.
   * @param minSharePrice - Minimum accepted share price in RAY.
   * @param receiver - Recipient of redeemed assets.
   * @param owner - Owner of the shares being redeemed.
   * @param skipRevert - Whether Bundler3 should tolerate a revert.
   * @returns Encoded Bundler3 calls.
   *
   * @example
   * ```ts
   * import { BundlerAction } from "@morpho-org/morpho-sdk/bundler";
   *
   * const vault = "0x186514400e52270cef3D80e1c6F8d10A75d47344";
   * const recipient = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
   * const owner = recipient;
   *
   * const calls = BundlerAction.erc4626Redeem(
   *   1,
   *   vault,
   *   100n,
   *   900000000000000000000000000n,
   *   recipient,
   *   owner,
   * );
   * ```
   */
  // biome-ignore lint/complexity/useMaxParams: TODO refactor to ≤2 params
  export function erc4626Redeem(
    chainId: number,
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

  /**
   * Encodes a GeneralAdapter1 Morpho Blue supply-collateral call.
   *
   * @param chainId - Chain where the action will execute.
   * @param market - Morpho Blue market parameters.
   * @param assets - Collateral asset amount to supply.
   * @param onBehalf - Account receiving the collateral position.
   * @param callbackCalls - Calls executed in Morpho's callback.
   * @param skipRevert - Whether Bundler3 should tolerate a revert.
   * @returns Encoded Bundler3 calls.
   *
   * @example
   * ```ts
   * import { BundlerAction } from "@morpho-org/morpho-sdk/bundler";
   *
   * const loanToken = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
   * const collateralToken = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
   * const oracle = "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419";
   * const irm = "0x870aC11D48B15DB9a138Cf899d20F13F79Ba00BC";
   * const onBehalf = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
   * const marketParams = {
   *   loanToken,
   *   collateralToken,
   *   oracle,
   *   irm,
   *   lltv: 860_000000000000000000n,
   * };
   *
   * const calls = BundlerAction.morphoSupplyCollateral(
   *   1,
   *   marketParams,
   *   100n,
   *   onBehalf,
   *   [],
   * );
   * ```
   */
  // biome-ignore lint/complexity/useMaxParams: TODO refactor to ≤2 params
  export function morphoSupplyCollateral(
    chainId: number,
    market: InputMarketParams,
    assets: bigint,
    onBehalf: Address,
    callbackCalls: BundlerCall[],
    skipRevert = false,
  ): BundlerCall[] {
    const {
      bundler3: { generalAdapter1 },
    } = getChainAddresses(chainId);

    const { callbackHash, reenterData } = encodeCallbackCalls(callbackCalls);

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
        callbackHash,
      },
    ];
  }

  /**
   * Encodes a GeneralAdapter1 Morpho Blue borrow call.
   *
   * @param chainId - Chain where the action will execute.
   * @param market - Morpho Blue market parameters.
   * @param assets - Borrow asset amount.
   * @param shares - Borrow share amount.
   * @param slippageAmount - Slippage guard amount.
   * @param receiver - Recipient of borrowed assets.
   * @param skipRevert - Whether Bundler3 should tolerate a revert.
   * @returns Encoded Bundler3 calls.
   *
   * @example
   * ```ts
   * import { BundlerAction } from "@morpho-org/morpho-sdk/bundler";
   *
   * const loanToken = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
   * const collateralToken = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
   * const oracle = "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419";
   * const irm = "0x870aC11D48B15DB9a138Cf899d20F13F79Ba00BC";
   * const receiver = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
   * const marketParams = {
   *   loanToken,
   *   collateralToken,
   *   oracle,
   *   irm,
   *   lltv: 860_000000000000000000n,
   * };
   *
   * const calls = BundlerAction.morphoBorrow(
   *   1,
   *   marketParams,
   *   100n,
   *   0n,
   *   1_000000000000000000000000000n,
   *   receiver,
   * );
   * ```
   */
  // biome-ignore lint/complexity/useMaxParams: TODO refactor to ≤2 params
  export function morphoBorrow(
    chainId: number,
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
   * Encodes a GeneralAdapter1 Morpho Blue repay call.
   *
   * @param chainId - Chain where the action will execute.
   * @param market - Morpho Blue market parameters.
   * @param assets - Repay asset amount.
   * @param shares - Repay share amount.
   * @param slippageAmount - Slippage guard amount.
   * @param onBehalf - Account whose borrow is repaid.
   * @param callbackCalls - Calls executed in Morpho's callback.
   * @param skipRevert - Whether Bundler3 should tolerate a revert.
   * @returns Encoded Bundler3 calls.
   *
   * @example
   * ```ts
   * import { BundlerAction } from "@morpho-org/morpho-sdk/bundler";
   *
   * const loanToken = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
   * const collateralToken = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
   * const oracle = "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419";
   * const irm = "0x870aC11D48B15DB9a138Cf899d20F13F79Ba00BC";
   * const onBehalf = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
   * const marketParams = {
   *   loanToken,
   *   collateralToken,
   *   oracle,
   *   irm,
   *   lltv: 860_000000000000000000n,
   * };
   *
   * const calls = BundlerAction.morphoRepay(
   *   1,
   *   marketParams,
   *   100n,
   *   0n,
   *   1_000000000000000000000000000n,
   *   onBehalf,
   *   [],
   * );
   * ```
   */
  // biome-ignore lint/complexity/useMaxParams: TODO refactor to ≤2 params
  export function morphoRepay(
    chainId: number,
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

    const { callbackHash, reenterData } = encodeCallbackCalls(callbackCalls);

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
        callbackHash,
      },
    ];
  }

  /**
   * Encodes a GeneralAdapter1 Morpho Blue withdraw-collateral call.
   *
   * @param chainId - Chain where the action will execute.
   * @param market - Morpho Blue market parameters.
   * @param assets - Collateral asset amount to withdraw.
   * @param receiver - Recipient of withdrawn collateral.
   * @param skipRevert - Whether Bundler3 should tolerate a revert.
   * @returns Encoded Bundler3 calls.
   *
   * @example
   * ```ts
   * import { BundlerAction } from "@morpho-org/morpho-sdk/bundler";
   *
   * const loanToken = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
   * const collateralToken = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
   * const oracle = "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419";
   * const irm = "0x870aC11D48B15DB9a138Cf899d20F13F79Ba00BC";
   * const receiver = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
   * const marketParams = {
   *   loanToken,
   *   collateralToken,
   *   oracle,
   *   irm,
   *   lltv: 860_000000000000000000n,
   * };
   *
   * const calls = BundlerAction.morphoWithdrawCollateral(
   *   1,
   *   marketParams,
   *   100n,
   *   receiver,
   * );
   * ```
   */
  // biome-ignore lint/complexity/useMaxParams: TODO refactor to ≤2 params
  export function morphoWithdrawCollateral(
    chainId: number,
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
   * Encodes a PublicAllocator reallocation call.
   *
   * @param chainId - Chain where the action will execute.
   * @param vault - Vault to reallocate.
   * @param fee - Public allocator fee.
   * @param withdrawals - Market withdrawals performed before supply.
   * @param supplyMarketParams - Target supply market parameters.
   * @param skipRevert - Whether Bundler3 should tolerate a revert.
   * @returns Encoded Bundler3 calls.
   * @throws {BundlerErrors.UnexpectedAction} when the PublicAllocator is unavailable on the chain.
   *
   * @example
   * ```ts
   * import { BundlerAction } from "@morpho-org/morpho-sdk/bundler";
   *
   * const loanToken = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
   * const collateralToken = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
   * const oracle = "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419";
   * const irm = "0x870aC11D48B15DB9a138Cf899d20F13F79Ba00BC";
   * const vault = "0x186514400e52270cef3D80e1c6F8d10A75d47344";
   * const marketParams = {
   *   loanToken,
   *   collateralToken,
   *   oracle,
   *   irm,
   *   lltv: 860_000000000000000000n,
   * };
   *
   * const calls = BundlerAction.publicAllocatorReallocateTo(
   *   1,
   *   vault,
   *   0n,
   *   [{ marketParams, amount: 100n }],
   *   marketParams,
   * );
   * ```
   */
  // biome-ignore lint/complexity/useMaxParams: TODO refactor to ≤2 params
  export function publicAllocatorReallocateTo(
    chainId: number,
    vault: Address,
    fee: bigint,
    withdrawals: InputReallocation[],
    supplyMarketParams: InputMarketParams,
    skipRevert = false,
  ): BundlerCall[] {
    const { publicAllocator } = getChainAddresses(chainId);
    if (publicAllocator == null) {
      throw new BundlerErrors.UnexpectedAction("reallocateTo", chainId);
    }

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
   * Encodes a GeneralAdapter1 native-token wrap call.
   *
   * @param chainId - Chain where the action will execute.
   * @param amount - Native-token amount to wrap.
   * @param recipient - Recipient of wrapped native tokens.
   * @param skipRevert - Whether Bundler3 should tolerate a revert.
   * @returns Encoded Bundler3 calls.
   *
   * @example
   * ```ts
   * import { BundlerAction } from "@morpho-org/morpho-sdk/bundler";
   *
   * const recipient = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
   *
   * const calls = BundlerAction.wrapNative(
   *   1,
   *   1_000000000000000000n,
   *   recipient,
   * );
   * ```
   */
  // biome-ignore lint/complexity/useMaxParams: TODO refactor to ≤2 params
  export function wrapNative(
    chainId: number,
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
}
