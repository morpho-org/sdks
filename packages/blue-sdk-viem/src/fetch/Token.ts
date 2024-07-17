import {
  Account,
  Address,
  Chain,
  ParseAccount,
  PublicClient,
  RpcSchema,
  Transport,
  erc20Abi,
  hexToString,
  isHex,
} from "viem";

import {
  ChainId,
  ChainUtils,
  ConstantWrappedToken,
  ExchangeRateWrappedToken,
  NATIVE_ADDRESS,
  Token,
  getChainAddresses,
  getUnwrappedToken,
} from "@morpho-org/blue-sdk";
import { wstEthAbi } from "../abis";
import { ViewOverrides } from "../types";

export const decodeString = (hexOrStr: string) => {
  if (isHex(hexOrStr)) return hexToString(hexOrStr);

  return hexOrStr;
};

export async function fetchToken<
  transport extends Transport,
  chain extends Chain | undefined = undefined,
  accountOrAddress extends Account | Address | undefined = undefined,
  rpcSchema extends RpcSchema | undefined = undefined,
>(
  address: Address,
  client: PublicClient<
    transport,
    chain,
    ParseAccount<accountOrAddress>,
    rpcSchema
  >,
  {
    chainId,
    overrides = {},
  }: { chainId?: ChainId; overrides?: ViewOverrides } = {},
) {
  chainId = ChainUtils.parseSupportedChainId(
    chainId ?? (await client.getChainId()),
  );

  if (address === NATIVE_ADDRESS) return Token.native(chainId);

  const [decimals, symbol, name] = await Promise.all([
    client.readContract({
      ...overrides,
      address,
      abi: erc20Abi,
      functionName: "decimals",
    }),
    client
      .readContract({
        ...overrides,
        address,
        abi: erc20Abi,
        functionName: "symbol",
      })
      .then(decodeString),
    client
      .readContract({
        ...overrides,
        address,
        abi: erc20Abi,
        functionName: "name",
      })
      .then(decodeString),
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
        const stEthPerWstEth = await client.readContract({
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
