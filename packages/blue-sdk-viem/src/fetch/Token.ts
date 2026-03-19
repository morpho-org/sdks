import {
  type Address,
  type Client,
  erc20Abi,
  erc20Abi_bytes32,
  hexToString,
  isHex,
} from "viem";

import {
  ConstantWrappedToken,
  Eip5267Domain,
  ExchangeRateWrappedToken,
  NATIVE_ADDRESS,
  Token,
  getChainAddresses,
  getUnwrappedToken,
} from "@morpho-org/blue-sdk";
import { getChainId, readContract } from "viem/actions";
import { erc5267Abi, wstEthAbi } from "../abis.js";
import { abi, code } from "../queries/GetToken.js";
import type { DeploylessFetchParameters } from "../types.js";

export const decodeBytes32String = (hexOrStr: string) => {
  if (isHex(hexOrStr)) return hexToString(hexOrStr, { size: 32 });

  return hexOrStr;
};

export async function fetchToken(
  address: Address,
  client: Client,
  { deployless = true, ...parameters }: DeploylessFetchParameters = {},
) {
  parameters.chainId ??= await getChainId(client);

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

      const eip5267Domain = token.hasEip5267Domain
        ? new Eip5267Domain(token.eip5267Domain)
        : undefined;
      const metadata = {
        address,
        decimals: token.decimals,
        symbol: token.hasSymbol ? token.symbol : undefined,
        name: token.hasName ? token.name : undefined,
        eip5267Domain,
      };

      if (isWstEth && stEth != null)
        return new ExchangeRateWrappedToken(
          metadata,
          stEth,
          token.stEthPerWstEth,
        );

      const unwrapToken = getUnwrappedToken(address, parameters.chainId);
      if (unwrapToken)
        return new ConstantWrappedToken(metadata, unwrapToken, token.decimals);

      return new Token(metadata);
    } catch (error) {
      if (deployless === "force") throw error;
      // Fallback to multicall if deployless call fails.
    }
  }

  const [decimals, symbol, name, eip5267Domain] = await Promise.all([
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
      abi: erc5267Abi,
      functionName: "eip712Domain",
    })
      .then(
        ([
          fields,
          name,
          version,
          chainId,
          verifyingContract,
          salt,
          extensions,
        ]) =>
          new Eip5267Domain({
            fields,
            name,
            version,
            chainId,
            verifyingContract,
            salt,
            extensions,
          }),
      )
      .catch(() => undefined),
  ]);

  const token = {
    address,
    name,
    symbol,
    decimals,
    eip5267Domain,
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
