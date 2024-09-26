import {
  Address,
  ChainId,
  MathLib,
  getChainAddresses,
} from "@morpho-org/blue-sdk";

import { HashTypedDataParameters, hashTypedData } from "viem";
import { SignatureMessage } from "./types";

export interface Permit2Args {
  erc20: Address;
  allowance: bigint;
  nonce: bigint;
  deadline: bigint;
  spender: Address;
  expiration?: bigint;
}

export interface Permit2TransferFromArgs {
  erc20: Address;
  allowance: bigint;
  spender: Address;
  nonce: bigint;
  deadline: bigint;
}

export const getPermit2TransferFromMessage = (
  args: Permit2TransferFromArgs,
  chainId: ChainId,
): SignatureMessage => {
  const domain = {
    name: "Permit2",
    chainId,
    verifyingContract: getChainAddresses(chainId).permit2,
  };
  const types = {
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
  const message = {
    permitted: {
      token: args.erc20,
      amount: MathLib.min(args.allowance, MathLib.MAX_UINT_160),
    },
    spender: args.spender,
    nonce: args.nonce,
    deadline: args.deadline,
  };

  const data: HashTypedDataParameters = {
    domain,
    types,
    message,
    primaryType: "PermitTransferFrom",
  };

  return { data, hash: hashTypedData(data) };
};

export const getPermit2Message = (
  args: Permit2Args,
  chainId: ChainId,
): SignatureMessage => {
  const domain = {
    name: "Permit2",
    chainId: chainId,
    verifyingContract: getChainAddresses(chainId).permit2,
  };
  const types = {
    PermitSingle: [
      {
        name: "details",
        type: "PermitDetails",
      },
      {
        name: "spender",
        type: "address",
      },
      {
        name: "sigDeadline",
        type: "uint256",
      },
    ],
    PermitDetails: [
      {
        name: "token",
        type: "address",
      },
      {
        name: "amount",
        type: "uint160",
      },
      {
        name: "expiration",
        type: "uint48",
      },
      {
        name: "nonce",
        type: "uint48",
      },
    ],
  };
  const message = {
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
  };

  const data: HashTypedDataParameters = {
    domain,
    types,
    message,
    primaryType: "PermitSingle",
  };

  return { data, hash: hashTypedData(data) };
};
