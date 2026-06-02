import {
  ConstantWrappedToken,
  Eip5267Domain,
  ExchangeRateWrappedToken,
  getChainAddresses,
  getUnwrappedToken,
  NATIVE_ADDRESS,
  Token,
} from "@morpho-org/blue-sdk";
import {
  type Address,
  type Client,
  erc20Abi,
  erc20Abi_bytes32,
  hexToString,
  isHex,
} from "viem";
import { getChainId, readContract } from "viem/actions";
import { erc5267Abi, wstEthAbi } from "../abis.js";
import { abi, code } from "../queries/GetToken.js";
import type { DeploylessFetchParameters } from "../types.js";

/**
 * Decodes ERC20 `bytes32` metadata results while leaving string metadata unchanged.
 *
 * @param hexOrStr - Metadata value returned by an ERC20 `name` or `symbol` read.
 * @returns The decoded string for hex input, or the original string for non-hex input.
 * @example
 * ```ts
 * import { decodeBytes32String } from "@morpho-org/blue-sdk-viem";
 *
 * const symbol = decodeBytes32String("0x5553444300000000000000000000000000000000000000000000000000000000");
 * ```
 */
export const decodeBytes32String = (hexOrStr: string) => {
  if (isHex(hexOrStr)) return hexToString(hexOrStr, { size: 32 });

  return hexOrStr;
};

/**
 * Fetches token metadata, EIP-5267 permit domain metadata, and wrapper metadata.
 *
 * Reads native token metadata locally for `NATIVE_ADDRESS`. For ERC20 tokens, uses the deployless
 * `GetToken` query by default and falls back to ERC20, EIP-5267, wstETH, and local unwrap-token
 * reads when allowed.
 *
 * @param address - Token address, or `NATIVE_ADDRESS` for the native asset.
 * @param client - Viem client used for deployless reads or multicalls.
 * @param parameters.account - Optional account passed to viem calls.
 * @param parameters.blockNumber - Optional block number for historical reads.
 * @param parameters.blockTag - Optional block tag for historical reads.
 * @param parameters.stateOverride - Optional viem state override.
 * @param parameters.chainId - Optional chain id; defaults to `getChainId(client)`.
 * @param parameters.deployless - Optional deployless read mode; defaults to `true`.
 * @returns The hydrated `Token`, `ConstantWrappedToken`, or `ExchangeRateWrappedToken` entity.
 * @example
 * ```ts
 * import type { Token } from "@morpho-org/blue-sdk";
 * import { fetchToken } from "@morpho-org/blue-sdk-viem";
 * import { createPublicClient, http } from "viem";
 * import { mainnet } from "viem/chains";
 *
 * const client = createPublicClient({ chain: mainnet, transport: http() });
 * const usdc = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
 *
 * const token: Token = await fetchToken(usdc, client);
 * ```
 */
// biome-ignore lint/complexity/useMaxParams: TODO refactor to ≤2 params
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
          // biome-ignore lint/nursery/noShadow: TODO rename to avoid shadowing
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
