import {
  Address,
  ChainId,
  Token,
  getChainAddresses,
} from "@morpho-org/blue-sdk";

import { HashTypedDataParameters, hashTypedData } from "viem";
import { SignatureMessage } from "./types";

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

  const domain = {
    name: erc20.name,
    version: erc20.address === usdc ? "2" : "1",
    chainId,
    verifyingContract: erc20.address,
  };

  const data: HashTypedDataParameters =
    erc20.address === dai
      ? {
          domain,
          types: {
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
          message: {
            holder: owner,
            spender,
            allowed: allowance > 0n,
            nonce,
            expiry: deadline,
          },
          primaryType: "Permit",
        }
      : {
          domain,
          types: {
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
          },
          message: {
            owner,
            spender,
            value: allowance,
            nonce,
            deadline,
          },
          primaryType: "Permit",
        };

  return { data, hash: hashTypedData(data) };
};
