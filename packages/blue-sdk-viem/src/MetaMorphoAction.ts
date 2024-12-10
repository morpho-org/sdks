import type { MarketId, MarketParams } from "@morpho-org/blue-sdk";
import { type Address, type Hex, encodeFunctionData } from "viem";
import { metaMorphoAbi } from "./abis";

export type MetaMorphoCall = Hex;

type InputMarketParams = Pick<
  MarketParams,
  "loanToken" | "collateralToken" | "oracle" | "irm" | "lltv"
>;

export interface InputAllocation {
  marketParams: InputMarketParams;
  assets: bigint;
}

export namespace MetaMorphoAction {
  /* CONFIGURATION */

  /**
   * Encodes a call to a MetaMorpho vault to set the curator.
   * @param newCurator The address of the new curator.
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
   */
  export function acceptTimelock(): MetaMorphoCall {
    return encodeFunctionData({
      abi: metaMorphoAbi,
      functionName: "acceptTimelock",
    });
  }

  /**
   * Encodes a call to a MetaMorpho vault to revoke the pending timelock.
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
   */
  export function acceptGuardian(): MetaMorphoCall {
    return encodeFunctionData({
      abi: metaMorphoAbi,
      functionName: "acceptGuardian",
    });
  }

  /**
   * Encodes a call to a MetaMorpho vault to revoke the pending guardian.
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
   */
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
   */
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
