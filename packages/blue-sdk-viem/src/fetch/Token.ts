import {
  type Address,
  type Client,
  erc20Abi,
  erc20Abi_bytes32,
  hexToString,
  isHex,
} from "viem";

import {
  ChainUtils,
  ConstantWrappedToken,
  ExchangeRateWrappedToken,
  NATIVE_ADDRESS,
  Token,
  getChainAddresses,
  getUnwrappedToken,
} from "@morpho-org/blue-sdk";
import { getChainId, readContract } from "viem/actions";
import { eip712DomainAbi, wstEthAbi } from "../abis";
import { abi, code } from "../queries/GetToken";
import type { DeploylessFetchParameters } from "../types";

export const decodeBytes32String = (hexOrStr: string) => {
  if (isHex(hexOrStr)) return hexToString(hexOrStr, { size: 32 });

  return hexOrStr;
};

export async function fetchToken(
  address: Address,
  client: Client,
  { deployless = true, ...parameters }: DeploylessFetchParameters = {},
) {
  parameters.chainId = ChainUtils.parseSupportedChainId(
    parameters.chainId ?? (await getChainId(client)),
  );

  if (address === NATIVE_ADDRESS) return Token.native(parameters.chainId);

  const { wstEth, stEth } = getChainAddresses(parameters.chainId);

  if (deployless) {
    try {
      const isWstEth = address === wstEth;

      const token = await readContract(client, {
        ...parameters,
        abi,
        code,
        functionName: "query",
        args: [address, isWstEth],
      });

      const eip712Domain = token.hasEip712Domain
        ? token.eip712Domain
        : undefined;

      if (isWstEth && stEth != null)
        return new ExchangeRateWrappedToken(
          { ...token, address, eip712Domain },
          stEth,
          token.stEthPerWstEth,
        );

      const unwrapToken = getUnwrappedToken(address, parameters.chainId);
      if (unwrapToken)
        return new ConstantWrappedToken(
          { ...token, address, eip712Domain },
          unwrapToken,
          token.decimals,
        );

      return new Token({ ...token, address, eip712Domain });
    } catch {
      // Fallback to multicall if deployless call fails.
    }
  }

  const [decimals, symbol, name, eip712Domain] = await Promise.all([
    readContract(client, {
      ...parameters,
      address,
      abi: erc20Abi,
      functionName: "decimals",
    }).catch(() => undefined),
    readContract(client, {
      ...parameters,
      address,
      abi: erc20Abi,
      functionName: "symbol",
    }).catch(() =>
      readContract(client, {
        ...parameters,
        address,
        abi: erc20Abi_bytes32,
        functionName: "symbol",
      })
        .then(decodeBytes32String)
        .catch(() => undefined),
    ),
    readContract(client, {
      ...parameters,
      address,
      abi: erc20Abi,
      functionName: "name",
    }).catch(() =>
      readContract(client, {
        ...parameters,
        address,
        abi: erc20Abi_bytes32,
        functionName: "name",
      })
        .then(decodeBytes32String)
        .catch(() => undefined),
    ),
    readContract(client, {
      ...parameters,
      address,
      abi: eip712DomainAbi,
      functionName: "eip712Domain",
    }).catch(() => undefined),
  ]);

  const token = {
    address,
    name,
    symbol,
    decimals,
    eip712Domain: eip712Domain && {
      chainId: eip712Domain[3],
      name: eip712Domain[1],
      verifyingContract: eip712Domain[4],
      version: eip712Domain[2],
    },
  };

  switch (address) {
    case wstEth: {
      if (stEth) {
        const stEthPerWstEth = await readContract(client, {
          ...parameters,
          address: wstEth!,
          abi: wstEthAbi,
          functionName: "stEthPerToken",
        });

        return new ExchangeRateWrappedToken(token, stEth, stEthPerWstEth);
      }
      break;
    }
  }

  const unwrapToken = getUnwrappedToken(address, parameters.chainId);
  if (unwrapToken)
    return new ConstantWrappedToken(token, unwrapToken, token.decimals);

  return new Token(token);
}
