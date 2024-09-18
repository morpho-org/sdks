import { Address, Client, erc20Abi, hexToString, isHex } from "viem";

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
import { bytes32Erc20Abi, wstEthAbi } from "../abis";
import { abi, code } from "../queries/GetToken";
import { DeploylessFetchParameters } from "../types";

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

      if (isWstEth && stEth != null)
        return new ExchangeRateWrappedToken(
          { ...token, address },
          stEth,
          token.stEthPerWstEth,
        );

      const unwrapToken = getUnwrappedToken(address, parameters.chainId);
      if (unwrapToken)
        return new ConstantWrappedToken(
          { ...token, address },
          unwrapToken,
          Number(token.decimals),
        );

      return new Token({ ...token, address });
    } catch {
      // Fallback to multicall if deployless call fails.
    }
  }

  const [decimals, symbol, name] = await Promise.all([
    readContract(client, {
      ...parameters,
      address,
      abi: erc20Abi,
      functionName: "decimals",
    }),
    readContract(client, {
      ...parameters,
      address,
      abi: erc20Abi,
      functionName: "symbol",
    }).catch(() =>
      readContract(client, {
        ...parameters,
        address,
        abi: bytes32Erc20Abi,
        functionName: "symbol",
      }).then(decodeBytes32String),
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
        abi: bytes32Erc20Abi,
        functionName: "name",
      }).then(decodeBytes32String),
    ),
  ]);

  const token = {
    address,
    decimals: parseInt(decimals.toString()),
    symbol,
    name,
  };

  switch (address) {
    case wstEth: {
      if (stEth) {
        const stEthPerWstEth = await readContract(client, {
          ...parameters,
          address: wstEth as Address,
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
