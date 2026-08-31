import type { InputMarketParams, MarketId } from "@morpho-org/blue-sdk";
import { type Address, encodeFunctionData, type Hex } from "viem";
import { metaMorphoAbi } from "./abis.js";

/** ABI-encoded calldata for one MetaMorpho vault call. */
export type MetaMorphoCall = Hex;

/** Target allocation passed to `MetaMorphoAction.reallocate`. */
export interface InputAllocation {
  marketParams: InputMarketParams;
  assets: bigint;
}

/** Encoders for MetaMorpho administrative, management, and ERC-4626 calls. */
export namespace MetaMorphoAction {
  /* CONFIGURATION */

  /**
   * Encodes a call to a MetaMorpho vault to set the curator.
   * @param newCurator The address of the new curator.
   * @returns ABI-encoded MetaMorpho calldata as a `MetaMorphoCall`.
   * @example
   * ```ts
   * import { MetaMorphoAction } from "@morpho-org/blue-sdk-viem";
   *
   * const call = MetaMorphoAction.setCurator("0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb");
   * ```
   */
  export function setCurator(newCurator: Address): MetaMorphoCall {
    return encodeFunctionData({
      abi: metaMorphoAbi,
      functionName: "setCurator",
      args: [newCurator],
    });
  }

  /**
   * Encodes a call to a MetaMorpho vault to enable or disable an allocator.
   * @param newAllocator The address of the allocator.
   * @param newIsAllocator Whether the allocator should be enabled or disabled.
   * @returns ABI-encoded MetaMorpho calldata as a `MetaMorphoCall`.
   * @example
   * ```ts
   * import { MetaMorphoAction } from "@morpho-org/blue-sdk-viem";
   *
   * const call = MetaMorphoAction.setIsAllocator(
   *   "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb",
   *   true,
   * );
   * ```
   */
  export function setIsAllocator(
    newAllocator: Address,
    newIsAllocator: boolean,
  ): MetaMorphoCall {
    return encodeFunctionData({
      abi: metaMorphoAbi,
      functionName: "setIsAllocator",
      args: [newAllocator, newIsAllocator],
    });
  }

  /**
   * Encode a call to a MetaMorpho vault to set the fee recipient.
   * @param newFeeRecipient The address of the new fee recipient.
   * @returns ABI-encoded MetaMorpho calldata as a `MetaMorphoCall`.
   * @example
   * ```ts
   * import { MetaMorphoAction } from "@morpho-org/blue-sdk-viem";
   *
   * const call = MetaMorphoAction.setFeeRecipient(
   *   "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb",
   * );
   * ```
   */
  export function setFeeRecipient(newFeeRecipient: Address): MetaMorphoCall {
    return encodeFunctionData({
      abi: metaMorphoAbi,
      functionName: "setFeeRecipient",
      args: [newFeeRecipient],
    });
  }

  /**
   * Encode a call to a MetaMorpho vault to set the skim recipient.
   * @param newSkimRecipient The address of the new skim recipient.
   * @returns ABI-encoded MetaMorpho calldata as a `MetaMorphoCall`.
   * @example
   * ```ts
   * import { MetaMorphoAction } from "@morpho-org/blue-sdk-viem";
   *
   * const call = MetaMorphoAction.setSkimRecipient(
   *   "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb",
   * );
   * ```
   */
  export function setSkimRecipient(newSkimRecipient: Address): MetaMorphoCall {
    return encodeFunctionData({
      abi: metaMorphoAbi,
      functionName: "setSkimRecipient",
      args: [newSkimRecipient],
    });
  }

  /**
   * Encode a call to a MetaMorpho vault to set the fee.
   * @param fee The new fee percentage (in WAD).
   * @returns ABI-encoded MetaMorpho calldata as a `MetaMorphoCall`.
   * @example
   * ```ts
   * import { MetaMorphoAction } from "@morpho-org/blue-sdk-viem";
   *
   * const call = MetaMorphoAction.setFee(50_000_000_000_000_000n);
   * ```
   */
  export function setFee(fee: bigint): MetaMorphoCall {
    return encodeFunctionData({
      abi: metaMorphoAbi,
      functionName: "setFee",
      args: [fee],
    });
  }

  /* TIMELOCK */

  /**
   * Encodes a call to a MetaMorpho vault to submit a new timelock.
   * @param newTimelock The new timelock (in seconds).
   * @returns ABI-encoded MetaMorpho calldata as a `MetaMorphoCall`.
   * @example
   * ```ts
   * import { MetaMorphoAction } from "@morpho-org/blue-sdk-viem";
   *
   * const call = MetaMorphoAction.submitTimelock(86_400n);
   * ```
   */
  export function submitTimelock(newTimelock: bigint): MetaMorphoCall {
    return encodeFunctionData({
      abi: metaMorphoAbi,
      functionName: "submitTimelock",
      args: [newTimelock],
    });
  }

  /**
   * Encodes a call to a MetaMorpho vault to accept the pending timelock.
   * @returns ABI-encoded MetaMorpho calldata as a `MetaMorphoCall`.
   * @example
   * ```ts
   * import { MetaMorphoAction } from "@morpho-org/blue-sdk-viem";
   *
   * const call = MetaMorphoAction.acceptTimelock();
   * ```
   */
  export function acceptTimelock(): MetaMorphoCall {
    return encodeFunctionData({
      abi: metaMorphoAbi,
      functionName: "acceptTimelock",
    });
  }

  /**
   * Encodes a call to a MetaMorpho vault to revoke the pending timelock.
   * @returns ABI-encoded MetaMorpho calldata as a `MetaMorphoCall`.
   * @example
   * ```ts
   * import { MetaMorphoAction } from "@morpho-org/blue-sdk-viem";
   *
   * const call = MetaMorphoAction.revokePendingTimelock();
   * ```
   */
  export function revokePendingTimelock(): MetaMorphoCall {
    return encodeFunctionData({
      abi: metaMorphoAbi,
      functionName: "revokePendingTimelock",
    });
  }

  /* SUPPLY CAP */

  /**
   * Encodes a call to a MetaMorpho vault to submit a new supply cap.
   * @param marketParams The market params of the market of which to submit a supply cap.
   * @param newSupplyCap The new supply cap.
   * @returns ABI-encoded MetaMorpho calldata as a `MetaMorphoCall`.
   * @example
   * ```ts
   * import type { InputMarketParams } from "@morpho-org/blue-sdk";
   * import { zeroAddress } from "viem";
   * import { MetaMorphoAction } from "@morpho-org/blue-sdk-viem";
   *
   * const marketParams = {
   *   loanToken: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
   *   collateralToken: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
   *   oracle: zeroAddress,
   *   irm: "0x870aC11D48B15DB9a138Cf899d20F13F79Ba00BC",
   *   lltv: 860_000_000_000_000_000n,
   * } satisfies InputMarketParams;
   *
   * const call = MetaMorphoAction.submitCap(marketParams, 1_000_000_000_000_000_000n);
   * ```
   */
  export function submitCap(
    marketParams: InputMarketParams,
    newSupplyCap: bigint,
  ): MetaMorphoCall {
    return encodeFunctionData({
      abi: metaMorphoAbi,
      functionName: "submitCap",
      args: [marketParams, newSupplyCap],
    });
  }

  /**
   * Encodes a call to a MetaMorpho vault to accept the pending supply cap.
   * @param marketParams The market params of the market of which to accept the pending supply cap.
   * @returns ABI-encoded MetaMorpho calldata as a `MetaMorphoCall`.
   * @example
   * ```ts
   * import type { InputMarketParams } from "@morpho-org/blue-sdk";
   * import { zeroAddress } from "viem";
   * import { MetaMorphoAction } from "@morpho-org/blue-sdk-viem";
   *
   * const marketParams = {
   *   loanToken: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
   *   collateralToken: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
   *   oracle: zeroAddress,
   *   irm: "0x870aC11D48B15DB9a138Cf899d20F13F79Ba00BC",
   *   lltv: 860_000_000_000_000_000n,
   * } satisfies InputMarketParams;
   *
   * const call = MetaMorphoAction.acceptCap(marketParams);
   * ```
   */
  export function acceptCap(marketParams: InputMarketParams): MetaMorphoCall {
    return encodeFunctionData({
      abi: metaMorphoAbi,
      functionName: "acceptCap",
      args: [marketParams],
    });
  }

  /**
   * Encodes a call to a MetaMorpho vault to revoke the pending supply cap.
   * @param id The id of the market of which to revoke the pending supply cap.
   * @returns ABI-encoded MetaMorpho calldata as a `MetaMorphoCall`.
   * @example
   * ```ts
   * import type { MarketId } from "@morpho-org/blue-sdk";
   * import { MetaMorphoAction } from "@morpho-org/blue-sdk-viem";
   *
   * const marketId =
   *   "0xdba352c33d64fc9bff091d505dbfcbc6c41b89986c2193b22a90031e9dac7f76" as MarketId;
   *
   * const call = MetaMorphoAction.revokePendingCap(marketId);
   * ```
   */
  export function revokePendingCap(id: MarketId): MetaMorphoCall {
    return encodeFunctionData({
      abi: metaMorphoAbi,
      functionName: "revokePendingCap",
      args: [id],
    });
  }

  /* FORCED MARKET REMOVAL */

  /**
   * Encodes a call to a MetaMorpho vault to submit a market removal.
   * @param marketParams The market params of the market to remove.
   * @returns ABI-encoded MetaMorpho calldata as a `MetaMorphoCall`.
   * @example
   * ```ts
   * import type { InputMarketParams } from "@morpho-org/blue-sdk";
   * import { zeroAddress } from "viem";
   * import { MetaMorphoAction } from "@morpho-org/blue-sdk-viem";
   *
   * const marketParams = {
   *   loanToken: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
   *   collateralToken: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
   *   oracle: zeroAddress,
   *   irm: "0x870aC11D48B15DB9a138Cf899d20F13F79Ba00BC",
   *   lltv: 860_000_000_000_000_000n,
   * } satisfies InputMarketParams;
   *
   * const call = MetaMorphoAction.submitMarketRemoval(marketParams);
   * ```
   */
  export function submitMarketRemoval(
    marketParams: InputMarketParams,
  ): MetaMorphoCall {
    return encodeFunctionData({
      abi: metaMorphoAbi,
      functionName: "submitMarketRemoval",
      args: [marketParams],
    });
  }

  /**
   * Encodes a call to a MetaMorpho vault to accept the pending market removal.
   * @param id The id of the market of which to accept the removal.
   * @returns ABI-encoded MetaMorpho calldata as a `MetaMorphoCall`.
   * @example
   * ```ts
   * import type { MarketId } from "@morpho-org/blue-sdk";
   * import { MetaMorphoAction } from "@morpho-org/blue-sdk-viem";
   *
   * const marketId =
   *   "0xdba352c33d64fc9bff091d505dbfcbc6c41b89986c2193b22a90031e9dac7f76" as MarketId;
   *
   * const call = MetaMorphoAction.revokePendingMarketRemoval(marketId);
   * ```
   */
  export function revokePendingMarketRemoval(id: MarketId): MetaMorphoCall {
    return encodeFunctionData({
      abi: metaMorphoAbi,
      functionName: "revokePendingMarketRemoval",
      args: [id],
    });
  }

  /* GUARDIAN */

  /**
   * Encodes a call to a MetaMorpho vault to submit a new guardian.
   * @param newGuardian The address of the new guardian.
   * @returns ABI-encoded MetaMorpho calldata as a `MetaMorphoCall`.
   * @example
   * ```ts
   * import { MetaMorphoAction } from "@morpho-org/blue-sdk-viem";
   *
   * const call = MetaMorphoAction.submitGuardian(
   *   "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb",
   * );
   * ```
   */
  export function submitGuardian(newGuardian: Address): MetaMorphoCall {
    return encodeFunctionData({
      abi: metaMorphoAbi,
      functionName: "submitGuardian",
      args: [newGuardian],
    });
  }

  /**
   * Encodes a call to a MetaMorpho vault to accept the pending guardian.
   * @returns ABI-encoded MetaMorpho calldata as a `MetaMorphoCall`.
   * @example
   * ```ts
   * import { MetaMorphoAction } from "@morpho-org/blue-sdk-viem";
   *
   * const call = MetaMorphoAction.acceptGuardian();
   * ```
   */
  export function acceptGuardian(): MetaMorphoCall {
    return encodeFunctionData({
      abi: metaMorphoAbi,
      functionName: "acceptGuardian",
    });
  }

  /**
   * Encodes a call to a MetaMorpho vault to revoke the pending guardian.
   * @returns ABI-encoded MetaMorpho calldata as a `MetaMorphoCall`.
   * @example
   * ```ts
   * import { MetaMorphoAction } from "@morpho-org/blue-sdk-viem";
   *
   * const call = MetaMorphoAction.revokePendingGuardian();
   * ```
   */
  export function revokePendingGuardian(): MetaMorphoCall {
    return encodeFunctionData({
      abi: metaMorphoAbi,
      functionName: "revokePendingGuardian",
    });
  }

  /* MANAGEMENT */

  /**
   * Encodes a call to a MetaMorpho vault to skim ERC20 tokens.
   * @param erc20 The address of the ERC20 token to skim.
   * @returns ABI-encoded MetaMorpho calldata as a `MetaMorphoCall`.
   * @example
   * ```ts
   * import { MetaMorphoAction } from "@morpho-org/blue-sdk-viem";
   *
   * const call = MetaMorphoAction.skim("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48");
   * ```
   */
  export function skim(erc20: Address): MetaMorphoCall {
    return encodeFunctionData({
      abi: metaMorphoAbi,
      functionName: "skim",
      args: [erc20],
    });
  }

  /**
   * Encodes a call to a MetaMorpho vault to set the supply queue.
   * @param supplyQueue The new supply queue.
   * @returns ABI-encoded MetaMorpho calldata as a `MetaMorphoCall`.
   * @example
   * ```ts
   * import type { MarketId } from "@morpho-org/blue-sdk";
   * import { MetaMorphoAction } from "@morpho-org/blue-sdk-viem";
   *
   * const marketId =
   *   "0xdba352c33d64fc9bff091d505dbfcbc6c41b89986c2193b22a90031e9dac7f76" as MarketId;
   *
   * const call = MetaMorphoAction.setSupplyQueue([marketId]);
   * ```
   */
  export function setSupplyQueue(supplyQueue: MarketId[]): MetaMorphoCall {
    return encodeFunctionData({
      abi: metaMorphoAbi,
      functionName: "setSupplyQueue",
      args: [supplyQueue],
    });
  }

  /**
   * Encodes a call to a MetaMorpho vault to update the withdraw queue.
   * @param indexes The indexes of each market in the previous withdraw queue, in the new withdraw queue's order.
   * @returns ABI-encoded MetaMorpho calldata as a `MetaMorphoCall`.
   * @example
   * ```ts
   * import { MetaMorphoAction } from "@morpho-org/blue-sdk-viem";
   *
   * const call = MetaMorphoAction.updateWithdrawQueue([0n, 1n]);
   * ```
   */
  export function updateWithdrawQueue(indexes: bigint[]): MetaMorphoCall {
    return encodeFunctionData({
      abi: metaMorphoAbi,
      functionName: "updateWithdrawQueue",
      args: [indexes],
    });
  }

  /**
   * Encodes a call to a MetaMorpho vault to reallocate the vault's liquidity across enabled markets.
   * @param allocations The new target allocations of each market.
   * @returns ABI-encoded MetaMorpho calldata as a `MetaMorphoCall`.
   * @example
   * ```ts
   * import type { InputMarketParams } from "@morpho-org/blue-sdk";
   * import { zeroAddress } from "viem";
   * import { MetaMorphoAction } from "@morpho-org/blue-sdk-viem";
   *
   * const marketParams = {
   *   loanToken: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
   *   collateralToken: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
   *   oracle: zeroAddress,
   *   irm: "0x870aC11D48B15DB9a138Cf899d20F13F79Ba00BC",
   *   lltv: 860_000_000_000_000_000n,
   * } satisfies InputMarketParams;
   *
   * const call = MetaMorphoAction.reallocate([{ marketParams, assets: 1_000_000n }]);
   * ```
   */
  export function reallocate(allocations: InputAllocation[]): MetaMorphoCall {
    return encodeFunctionData({
      abi: metaMorphoAbi,
      functionName: "reallocate",
      args: [allocations],
    });
  }

  /* ERC4626 */

  /**
   * Encodes a call to a MetaMorpho vault to mint shares.
   * @param shares The amount of shares to mint.
   * @param receiver The address of the receiver of the shares.
   * @returns ABI-encoded MetaMorpho calldata as a `MetaMorphoCall`.
   * @example
   * ```ts
   * import { MetaMorphoAction } from "@morpho-org/blue-sdk-viem";
   *
   * const call = MetaMorphoAction.mint(
   *   1_000_000n,
   *   "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb",
   * );
   * ```
   */
  export function mint(shares: bigint, receiver: Address): MetaMorphoCall {
    return encodeFunctionData({
      abi: metaMorphoAbi,
      functionName: "mint",
      args: [shares, receiver],
    });
  }

  /**
   * Encodes a call to a MetaMorpho vault to deposit assets.
   * @param assets The amount of assets to deposit.
   * @param receiver The address of the receiver of the shares.
   * @returns ABI-encoded MetaMorpho calldata as a `MetaMorphoCall`.
   * @example
   * ```ts
   * import { MetaMorphoAction } from "@morpho-org/blue-sdk-viem";
   *
   * const call = MetaMorphoAction.deposit(
   *   1_000_000n,
   *   "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb",
   * );
   * ```
   */
  export function deposit(assets: bigint, receiver: Address): MetaMorphoCall {
    return encodeFunctionData({
      abi: metaMorphoAbi,
      functionName: "deposit",
      args: [assets, receiver],
    });
  }

  /**
   * Encodes a call to a MetaMorpho vault to withdraw assets.
   * @param assets The amount of assets to withdraw.
   * @param receiver The address of the receiver of the assets.
   * @param owner The address of the owner of the shares to redeem.
   * @returns ABI-encoded MetaMorpho calldata as a `MetaMorphoCall`.
   * @example
   * ```ts
   * import { MetaMorphoAction } from "@morpho-org/blue-sdk-viem";
   *
   * const receiver = "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb";
   * const call = MetaMorphoAction.withdraw(1_000_000n, receiver, receiver);
   * ```
   */
  // biome-ignore lint/complexity/useMaxParams: TODO refactor to ≤2 params
  export function withdraw(
    assets: bigint,
    receiver: Address,
    owner: Address,
  ): MetaMorphoCall {
    return encodeFunctionData({
      abi: metaMorphoAbi,
      functionName: "withdraw",
      args: [assets, receiver, owner],
    });
  }

  /**
   * Encodes a call to a MetaMorpho vault to redeem shares.
   * @param shares The amount of shares to redeem.
   * @param receiver The address of the receiver of the assets.
   * @param owner The address of the owner of the shares to redeem.
   * @returns ABI-encoded MetaMorpho calldata as a `MetaMorphoCall`.
   * @example
   * ```ts
   * import { MetaMorphoAction } from "@morpho-org/blue-sdk-viem";
   *
   * const receiver = "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb";
   * const call = MetaMorphoAction.redeem(1_000_000n, receiver, receiver);
   * ```
   */
  // biome-ignore lint/complexity/useMaxParams: TODO refactor to ≤2 params
  export function redeem(
    shares: bigint,
    receiver: Address,
    owner: Address,
  ): MetaMorphoCall {
    return encodeFunctionData({
      abi: metaMorphoAbi,
      functionName: "redeem",
      args: [shares, receiver, owner],
    });
  }
}

export default MetaMorphoAction;
