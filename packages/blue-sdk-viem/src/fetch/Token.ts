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
import { FetchOptions } from "../types";

export const decodeBytes32String = (hexOrStr: string) => {
  if (isHex(hexOrStr)) return hexToString(hexOrStr, { size: 32 });

  return hexOrStr;
};

export async function fetchToken(
  address: Address,
  client: Client,
  { chainId, overrides = {} }: FetchOptions = {},
) {
  chainId = ChainUtils.parseSupportedChainId(
    chainId ?? (await getChainId(client)),
  );

  if (address === NATIVE_ADDRESS) return Token.native(chainId);

  const [decimals, symbol, name] = await Promise.all([
    readContract(client, {
      ...overrides,
      address,
      abi: erc20Abi,
      functionName: "decimals",
    }),
    readContract(client, {
      ...overrides,
      address,
      abi: erc20Abi,
      functionName: "symbol",
    }).catch(() =>
      readContract(client, {
        ...overrides,
        address,
        abi: bytes32Erc20Abi,
        functionName: "symbol",
      }).then(decodeBytes32String),
    ),
    readContract(client, {
      ...overrides,
      address,
      abi: erc20Abi,
      functionName: "name",
    }).catch(() =>
      readContract(client, {
        ...overrides,
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

  const { wstEth, stEth } = getChainAddresses(chainId);

  switch (address) {
    case wstEth: {
      if (stEth) {
        const stEthPerWstEth = await readContract(client, {
          ...overrides,
          address: wstEth as Address,
          abi: wstEthAbi,
          functionName: "stEthPerToken",
        });

        return new ExchangeRateWrappedToken(token, stEth, stEthPerWstEth);
      }
      break;
    }
  }

  const unwrapToken = getUnwrappedToken(address, chainId);
  if (unwrapToken)
    return new ConstantWrappedToken(token, unwrapToken, token.decimals);

  return new Token(token);
}
