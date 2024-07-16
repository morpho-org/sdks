import {
  Address,
  ChainId,
  Token,
  addresses,
  getChainAddresses,
} from "@morpho-org/blue-sdk";

import { SignatureMessage } from "./types";
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

  const domain = {
    name: erc20.name,
    version: erc20.address === usdc ? "2" : "1",
    chainId: chainId.toString(),
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

export const WITH_SIMPLE_PERMIT: {
  [id in ChainId]: (Address | undefined)[];
} = {
  [ChainId.EthMainnet]: [
    addresses[ChainId.EthMainnet].wbIB01,
    addresses[ChainId.EthMainnet].wbC3M,
    addresses[ChainId.EthMainnet].wstEth,
    addresses[ChainId.EthMainnet].sDai,
    addresses[ChainId.EthMainnet].osEth,
    addresses[ChainId.EthMainnet].usdc,
    addresses[ChainId.EthMainnet].dai,
  ],
  [ChainId.EthGoerliTestnet]: [
    "0x0aCd15Fb54034492c392596B56ED415bD07e70d7", // Fake DAI
    "0xD8134205b0328F5676aaeFb3B2a0DC15f4029d8C", // Real sDAI
  ],
  [ChainId.BaseMainnet]: [
    addresses[ChainId.BaseMainnet].usdc,
    addresses[ChainId.BaseMainnet].verUsdc,
  ],
};

export const hasSimplePermit = (chainId: ChainId, address: Address) =>
  WITH_SIMPLE_PERMIT[chainId]?.includes(address);
