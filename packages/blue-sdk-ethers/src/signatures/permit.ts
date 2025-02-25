import {
  type Address,
  type ChainId,
  type Token,
  getChainAddresses,
} from "@morpho-org/blue-sdk";

import type { SignatureMessage } from "./types";
import { getMessage } from "./utils";

export interface PermitArgs {
  erc20: Token;
  owner: Address;
  spender: Address;
  allowance: bigint;
  nonce: bigint;
  deadline: bigint;
}

/**
 * Permit signature for ERC20 tokens, following EIP-2612.
 * Docs: https://eips.ethereum.org/EIPS/eip-2612
 */
export const getPermitMessage = (
  { deadline, owner, nonce, spender, erc20, allowance }: PermitArgs,
  chainId: ChainId,
): SignatureMessage => {
  const { usdc, dai } = getChainAddresses(chainId);

  const domain = erc20.eip5267Domain?.eip712Domain ?? {
    name: erc20.name,
    version: erc20.address === usdc ? "2" : "1",
    chainId,
    verifyingContract: erc20.address,
  };

  if (erc20.address === dai)
    return getMessage(
      domain,
      {
        Permit: [
          {
            name: "holder",
            type: "address",
          },
          {
            name: "spender",
            type: "address",
          },
          {
            name: "nonce",
            type: "uint256",
          },
          {
            name: "expiry",
            type: "uint256",
          },
          {
            name: "allowed",
            type: "bool",
          },
        ],
      },
      {
        holder: owner,
        spender,
        allowed: allowance > 0n,
        nonce,
        expiry: deadline,
      },
    );

  const types = {
    Permit: [
      {
        name: "owner",
        type: "address",
      },
      {
        name: "spender",
        type: "address",
      },
      {
        name: "value",
        type: "uint256",
      },
      {
        name: "nonce",
        type: "uint256",
      },
      {
        name: "deadline",
        type: "uint256",
      },
    ],
  };
  const value = {
    owner,
    spender,
    value: allowance,
    nonce,
    deadline,
  };

  return getMessage(domain, types, value);
};
