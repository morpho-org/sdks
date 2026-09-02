import {
  type Address,
  type ChainId,
  getChainAddresses,
  MathLib,
} from "@morpho-org/blue-sdk";
import type { TypedDataDefinition } from "viem";

/** Message fields for Permit2 allowance typed data. */
export interface Permit2PermitArgs {
  erc20: Address;
  allowance: bigint;
  nonce: number;
  deadline: bigint;
  spender: Address;
  expiration?: number;
}

/** Message fields for Permit2 signature-transfer typed data. */
export interface Permit2TransferFromArgs {
  erc20: Address;
  allowance: bigint;
  spender: Address;
  nonce: bigint;
  deadline: bigint;
}

const permit2PermitTypes = {
  PermitSingle: [
    { name: "details", type: "PermitDetails" },
    { name: "spender", type: "address" },
    { name: "sigDeadline", type: "uint256" },
  ],
  PermitDetails: [
    { name: "token", type: "address" },
    { name: "amount", type: "uint160" },
    { name: "expiration", type: "uint48" },
    { name: "nonce", type: "uint48" },
  ],
};

/**
 * Builds Permit2 allowance typed data for signing.
 *
 * @param args - Permit2 allowance message fields.
 * @param chainId - Chain id whose Permit2 deployment verifies the signature.
 * @returns Typed data ready to pass to a wallet for signing.
 * @example
 * ```ts
 * import { ChainId } from "@morpho-org/blue-sdk";
 * import { getPermit2PermitTypedData } from "@morpho-org/blue-sdk-viem";
 *
 * const typedData = getPermit2PermitTypedData(
 *   {
 *     erc20: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
 *     allowance: 1_000_000n,
 *     nonce: 0,
 *     deadline: 1_900_000_000n,
 *     spender: "0x6566194141fF46b819c55E7137D8329898eCd06C",
 *   },
 *   ChainId.EthMainnet,
 * );
 * ```
 */
export const getPermit2PermitTypedData = (
  args: Permit2PermitArgs,
  chainId: ChainId,
): TypedDataDefinition<typeof permit2PermitTypes, "PermitSingle"> => {
  return {
    domain: {
      name: "Permit2",
      chainId: chainId,
      verifyingContract: getChainAddresses(chainId).permit2,
    },
    types: permit2PermitTypes,
    message: {
      details: {
        token: args.erc20,
        amount: MathLib.min(args.allowance, MathLib.MAX_UINT_160),
        // Use an unlimited expiration because it most
        // closely mimics how a standard approval works.
        expiration: MathLib.min(
          args.expiration ?? MathLib.MAX_UINT_48,
          MathLib.MAX_UINT_48,
        ),
        nonce: args.nonce,
      },
      spender: args.spender,
      sigDeadline: args.deadline,
    },
    primaryType: "PermitSingle",
  };
};

const permit2TransferFromTypes = {
  PermitTransferFrom: [
    { name: "permitted", type: "TokenPermissions" },
    { name: "spender", type: "address" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
  TokenPermissions: [
    { name: "token", type: "address" },
    { name: "amount", type: "uint256" },
  ],
};

/**
 * Builds Permit2 signature-transfer typed data for signing.
 *
 * @param args - Permit2 signature-transfer message fields.
 * @param chainId - Chain id whose Permit2 deployment verifies the signature.
 * @returns Typed data ready to pass to a wallet for signing.
 * @example
 * ```ts
 * import { ChainId } from "@morpho-org/blue-sdk";
 * import { getPermit2TransferFromTypedData } from "@morpho-org/blue-sdk-viem";
 *
 * const typedData = getPermit2TransferFromTypedData(
 *   {
 *     erc20: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
 *     allowance: 1_000_000n,
 *     spender: "0x6566194141fF46b819c55E7137D8329898eCd06C",
 *     nonce: 0n,
 *     deadline: 1_900_000_000n,
 *   },
 *   ChainId.EthMainnet,
 * );
 * ```
 */
export const getPermit2TransferFromTypedData = (
  args: Permit2TransferFromArgs,
  chainId: ChainId,
): TypedDataDefinition<
  typeof permit2TransferFromTypes,
  "PermitTransferFrom"
> => {
  return {
    domain: {
      name: "Permit2",
      chainId,
      verifyingContract: getChainAddresses(chainId).permit2,
    },
    types: permit2TransferFromTypes,
    message: {
      permitted: {
        token: args.erc20,
        amount: MathLib.min(args.allowance, MathLib.MAX_UINT_160),
      },
      spender: args.spender,
      nonce: args.nonce,
      deadline: args.deadline,
    },
    primaryType: "PermitTransferFrom",
  };
};
