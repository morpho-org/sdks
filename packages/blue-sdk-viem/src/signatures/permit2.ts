import {
  type Address,
  type ChainId,
  MathLib,
  getChainAddresses,
} from "@morpho-org/blue-sdk";
import type { TypedDataDefinition } from "viem";

export interface Permit2PermitArgs {
  erc20: Address;
  allowance: bigint;
  nonce: number;
  deadline: bigint;
  spender: Address;
  expiration?: number;
}

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
