import {
  type Address,
  type ChainId,
  type Token,
  getChainAddresses,
} from "@morpho-org/blue-sdk";
import type { TypedDataDefinition } from "viem";

export interface PermitArgs {
  erc20: Token;
  owner: Address;
  spender: Address;
  allowance: bigint;
  nonce: bigint;
  deadline: bigint;
}

const permitTypes = {
  Permit: [
    { name: "owner", type: "address" },
    { name: "spender", type: "address" },
    { name: "value", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

/**
 * Permit signature for ERC20 tokens, following EIP-2612.
 * Docs: https://eips.ethereum.org/EIPS/eip-2612
 */
export const getPermitTypedData = (
  { deadline, owner, nonce, spender, erc20, allowance }: PermitArgs,
  chainId: ChainId,
): TypedDataDefinition<typeof permitTypes, "Permit"> => {
  const { usdc } = getChainAddresses(chainId);

  const domain = erc20.eip712Domain ?? {
    name: erc20.name,
    version: erc20.address === usdc ? "2" : "1",
    chainId,
    verifyingContract: erc20.address,
  };

  return {
    domain,
    types: permitTypes,
    message: {
      owner,
      spender,
      value: allowance,
      nonce,
      deadline,
    },
    primaryType: "Permit",
  };
};

export interface DaiPermitArgs {
  owner: Address;
  spender: Address;
  allowance: bigint;
  nonce: bigint;
  deadline: bigint;
}

const daiPermitTypes = {
  Permit: [
    { name: "holder", type: "address" },
    { name: "spender", type: "address" },
    { name: "nonce", type: "uint256" },
    { name: "expiry", type: "uint256" },
    { name: "allowed", type: "bool" },
  ],
} as const;

export const getDaiPermitTypedData = (
  { deadline, owner, nonce, spender, allowance }: DaiPermitArgs,
  chainId: ChainId,
): TypedDataDefinition<typeof daiPermitTypes, "Permit"> => {
  const { dai } = getChainAddresses(chainId);

  const domain = {
    name: "Dai Stablecoin",
    version: "1",
    chainId,
    verifyingContract: dai,
  };

  return {
    domain,
    types: daiPermitTypes,
    message: {
      holder: owner,
      spender,
      allowed: allowance > 0n,
      nonce,
      expiry: deadline,
    },
    primaryType: "Permit",
  };
};
