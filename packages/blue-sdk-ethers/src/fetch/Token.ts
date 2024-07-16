import {
  Contract,
  ContractRunner,
  Interface,
  Provider,
  decodeBytes32String,
  isHexString,
} from "ethers";
import { WStEth__factory } from "ethers-types";
import { ERC20__factory } from "ethers-types";
import { ViewOverrides } from "ethers-types/dist/common";
import { ERC20, ERC20Interface } from "ethers-types/dist/token/ERC20/ERC20";

import {
  Address,
  ChainId,
  ChainUtils,
  ConstantWrappedToken,
  ExchangeRateWrappedToken,
  NATIVE_ADDRESS,
  Token,
  addresses,
  getChainAddresses,
  getUnwrappedToken,
} from "@morpho-org/blue-sdk";

export const isBytes32ERC20Metadata = (address: string, chainId: ChainId) => {
  switch (chainId) {
    case ChainId.EthMainnet:
      return address === addresses[ChainId.EthMainnet].mkr;
    default:
      return false;
  }
};

export const decodeString = (bytes32OrStr: string) => {
  if (isHexString(bytes32OrStr, 32)) return decodeBytes32String(bytes32OrStr);

  return bytes32OrStr;
};

const _bytes32ERC20Abi = [
  ...ERC20__factory.abi.filter(
    (fragment) =>
      !("name" in fragment) ||
      (fragment.name !== "name" && fragment.name !== "symbol"),
  ),
  {
    inputs: [],
    name: "symbol",
    outputs: [
      {
        name: "symbol",
        type: "bytes32",
      },
    ],
    stateMutability: "view",
    type: "function",
  },

  {
    inputs: [],
    name: "name",
    outputs: [
      {
        name: "name",
        type: "bytes32",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const;

export class Bytes32ERC20__factory {
  static readonly abi = _bytes32ERC20Abi;

  static createInterface() {
    return new Interface(_bytes32ERC20Abi) as ERC20Interface;
  }
  static connect(address: string, runner?: ContractRunner | null) {
    const erc20 = new Contract(
      address,
      _bytes32ERC20Abi,
      runner,
    ) as unknown as ERC20;

    const name = erc20.name.bind(erc20);
    erc20.name = Object.assign(
      (...args: Parameters<typeof name>) => name(...args).then(decodeString),
      name,
    );

    const symbol = erc20.symbol.bind(erc20);
    erc20.symbol = Object.assign(
      (...args: Parameters<typeof symbol>) =>
        symbol(...args).then(decodeString),
      symbol,
    );

    return erc20;
  }
}

export class ERC20Metadata__factory {
  static connect(
    address: string,
    chainId: ChainId,
    runner?: ContractRunner | null,
  ) {
    if (isBytes32ERC20Metadata(address, chainId))
      return Bytes32ERC20__factory.connect(address, runner);

    const erc20 = ERC20__factory.connect(address, runner);

    const name = erc20.name.bind(erc20);
    erc20.name = Object.assign(
      (...args: Parameters<typeof name>) =>
        name(...args).catch(() =>
          Bytes32ERC20__factory.connect(address, runner).name(...args),
        ),
      name,
    );

    const symbol = erc20.symbol.bind(erc20);
    erc20.symbol = Object.assign(
      (...args: Parameters<typeof symbol>) =>
        symbol(...args).catch(() =>
          Bytes32ERC20__factory.connect(address, runner).symbol(...args),
        ),
      symbol,
    );

    return erc20;
  }
}

export async function fetchToken(
  address: Address,
  runner: { provider: Provider },
  {
    chainId,
    overrides = {},
  }: { chainId?: ChainId; overrides?: ViewOverrides } = {},
) {
  chainId = ChainUtils.parseSupportedChainId(
    chainId ?? (await runner.provider.getNetwork()).chainId,
  );

  if (address === NATIVE_ADDRESS) return Token.native(chainId);

  const erc20 = ERC20Metadata__factory.connect(address, chainId, runner);

  const [decimals, symbol, name] = await Promise.all([
    erc20.decimals(overrides),
    erc20.symbol(overrides),
    erc20.name(overrides),
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
        const wstEthToken = WStEth__factory.connect(wstEth!, runner);
        const stEthPerWstEth = await wstEthToken.stEthPerToken(overrides);
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

declare module "@morpho-org/blue-sdk" {
  namespace Token {
    let fetch: typeof fetchToken;
  }
}

Token.fetch = fetchToken;
