import {
  type Address,
  type Client,
  type ReadContractReturnType,
  erc20Abi,
  erc20Abi_bytes32,
  hexToString,
  isHex,
  zeroAddress,
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
import { erc5267Abi, wstEthAbi } from "../abis";
import { abi, code } from "../queries/GetToken";
import type { DeploylessFetchParameters } from "../types";

export const decodeBytes32String = (hexOrStr: string) => {
  if (isHex(hexOrStr)) return hexToString(hexOrStr, { size: 32 });

  return hexOrStr;
};

export const transformDeploylessTokenRead =
  (chainId: number) =>
  (address: Address, token: ReadContractReturnType<typeof abi, "query">) => {
    const eip5267Domain = token.hasEip5267Domain
      ? new Eip5267Domain(token.eip5267Domain)
      : undefined;

    const { wstEth, stEth } = getChainAddresses(chainId);

    const isWstEth = address === wstEth;
    if (isWstEth && stEth != null)
      return new ExchangeRateWrappedToken(
        { ...token, address, eip5267Domain },
        stEth,
        token.stEthPerWstEth,
      );

    const unwrappedToken = getUnwrappedToken(address, chainId);
    if (unwrappedToken)
      return new ConstantWrappedToken(
        { ...token, address, eip5267Domain },
        unwrappedToken,
        token.decimals,
      );

    return new Token({ ...token, address, eip5267Domain });
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
      const token = await readContract(client, {
        ...parameters,
        abi,
        code,
        functionName: "query",
        args: [address, wstEth ?? zeroAddress],
      });

      return transformDeploylessTokenRead(parameters.chainId)(address, token);
    } catch {
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
