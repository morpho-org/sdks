import {
  type Address,
  type ChainId,
  getChainAddresses,
  type Token,
} from "@morpho-org/blue-sdk";
import { isAddressEqual, type TypedDataDefinition } from "viem";
import {
  InvalidPermitDomainChainIdError,
  InvalidPermitDomainVerifyingContractError,
  UnsupportedPermitDomainExtensionsError,
} from "../error.js";

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
 * Fails closed when fetched EIP-5267 metadata is not bound to the token and chain.
 * Consumers should use another approval path instead of signing an unsafe domain.
 * Docs: https://eips.ethereum.org/EIPS/eip-2612
 * @param args The permit message fields and ERC20 token metadata.
 * @param chainId The expected chain ID for the permit domain.
 * @returns Typed data ready to pass to a wallet for signing.
 * @throws InvalidPermitDomainChainIdError when fetched EIP-5267 metadata targets another chain or omits `chainId`.
 * @throws InvalidPermitDomainVerifyingContractError when fetched EIP-5267 metadata targets another token or omits `verifyingContract`.
 * @throws UnsupportedPermitDomainExtensionsError when fetched EIP-5267 metadata advertises extension fields unsupported by this helper.
 * @example
 * import { getPermitTypedData } from "@morpho-org/blue-sdk-viem";
 *
 * const typedData = getPermitTypedData(
 *   {
 *     erc20: token,
 *     owner,
 *     spender,
 *     allowance: 1_000000n,
 *     nonce,
 *     deadline,
 *   },
 *   ChainId.EthMainnet,
 * );
 * const signature = await walletClient.signTypedData(typedData);
 */
export const getPermitTypedData = (
  { deadline, owner, nonce, spender, erc20, allowance }: PermitArgs,
  chainId: ChainId,
): TypedDataDefinition<typeof permitTypes, "Permit"> => {
  const { usdc, eurc } = getChainAddresses(chainId);

  const eip5267Domain = erc20.eip5267Domain;

  if (eip5267Domain?.extensions.length) {
    throw new UnsupportedPermitDomainExtensionsError(
      erc20.address,
      eip5267Domain.extensions,
    );
  }

  const domain = eip5267Domain?.eip712Domain;

  if (domain != null) {
    if (domain.chainId !== chainId) {
      throw new InvalidPermitDomainChainIdError(
        erc20.address,
        chainId,
        domain.chainId,
      );
    }

    if (
      domain.verifyingContract == null ||
      !isAddressEqual(domain.verifyingContract, erc20.address)
    ) {
      throw new InvalidPermitDomainVerifyingContractError(
        erc20.address,
        domain.verifyingContract,
      );
    }
  }

  const permitDomain = domain ?? {
    name: erc20.name,
    version: erc20.address === usdc || erc20.address === eurc ? "2" : "1",
    chainId,
    verifyingContract: erc20.address,
  };

  return {
    domain: permitDomain,
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
