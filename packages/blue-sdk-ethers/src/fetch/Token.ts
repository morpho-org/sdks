import {
  Contract,
  type ContractRunner,
  Interface,
  type Provider,
  decodeBytes32String,
  isHexString,
} from "ethers";
import { ERC20Permit__factory, WStEth__factory } from "ethers-types";
import { ERC20__factory } from "ethers-types";
import type {
  ERC20,
  ERC20Interface,
} from "ethers-types/dist/token/ERC20/ERC20";

import {
  type Address,
  ChainId,
  ConstantWrappedToken,
  Eip5267Domain,
  ExchangeRateWrappedToken,
  NATIVE_ADDRESS,
  Token,
  addressesRegistry,
  getChainAddresses,
  getUnwrappedToken,
} from "@morpho-org/blue-sdk";
import type { FetchOptions } from "../types";

export const isBytes32ERC20Metadata = (address: string, chainId: ChainId) => {
  switch (chainId) {
    case ChainId.EthMainnet:
      return address === addressesRegistry[ChainId.EthMainnet].mkr;
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

export namespace Bytes32ERC20__factory {
  export const abi = _bytes32ERC20Abi;

  export function createInterface() {
    return new Interface(_bytes32ERC20Abi) as ERC20Interface;
  }

  export function connect(address: string, runner?: ContractRunner | null) {
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

export namespace ERC20Metadata__factory {
  export function connect(
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
  { chainId, overrides = {} }: FetchOptions = {},
) {
  chainId ??= Number((await runner.provider.getNetwork()).chainId);

  if (address === NATIVE_ADDRESS) return Token.native(chainId);

  const erc20 = ERC20Metadata__factory.connect(address, chainId, runner);
  const erc20Permit = ERC20Permit__factory.connect(address, runner);

  const [decimals, symbol, name, eip5267Domain] = await Promise.all([
    erc20.decimals(overrides).catch(() => undefined),
    erc20.symbol(overrides).catch(() => undefined),
    erc20.name(overrides).catch(() => undefined),
    erc20Permit
      .eip712Domain(overrides)
      .then(
        ({
          fields,
          name,
          version,
          chainId,
          verifyingContract,
          salt,
          extensions,
        }) =>
          new Eip5267Domain({
            fields: fields as `0x${string}`,
            name,
            version,
            chainId,
            verifyingContract: verifyingContract as Address,
            salt: salt as `0x${string}`,
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
