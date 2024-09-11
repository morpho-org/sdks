import {
  ChainUtils,
  ERC20_ALLOWANCE_RECIPIENTS,
  Holding,
  NATIVE_ADDRESS,
  PERMIT2_ALLOWANCE_RECIPIENTS,
  addresses,
  getChainAddresses,
  permissionedBackedTokens,
  permissionedWrapperTokens,
} from "@morpho-org/blue-sdk";
import { Address, Client, erc20Abi, maxUint256 } from "viem";
import { getBalance, getChainId, readContract } from "viem/actions";

import { fromEntries } from "@morpho-org/morpho-ts";
import {
  erc2612Abi,
  permissionedErc20WrapperAbi,
  permit2Abi,
  whitelistControllerAggregatorV2Abi,
  wrappedBackedTokenAbi,
} from "../abis";
import { abi, code } from "../queries/GetHolding";
import { FetchParameters } from "../types";

export enum Boolean {
  Undefined,
  False,
  True,
}

export async function fetchHolding(
  user: Address,
  token: Address,
  client: Client,
  {
    deployless = true,
    ...parameters
  }: FetchParameters & {
    deployless?: boolean;
  } = {},
) {
  parameters.chainId = ChainUtils.parseSupportedChainId(
    parameters.chainId ?? (await getChainId(client)),
  );

  if (token === NATIVE_ADDRESS)
    return new Holding({
      user,
      token,
      erc20Allowances: fromEntries(
        ERC20_ALLOWANCE_RECIPIENTS.map((label) => [label, maxUint256]),
      ),
      permit2Allowances: fromEntries(
        PERMIT2_ALLOWANCE_RECIPIENTS.map((label) => [
          label,
          {
            amount: 0n,
            expiration: 0n,
            nonce: 0n,
          },
        ]),
      ),
      balance: await getBalance(client, {
        ...(parameters as any),
        address: user,
      }),
    });

  if (deployless) {
    const { morpho, permit2, bundler } = addresses[parameters.chainId];
    try {
      const {
        balance,
        erc20Allowances,
        permit2Allowances,
        isErc2612,
        erc2612Nonce,
        canTransfer,
      } = await readContract(client, {
        ...parameters,
        abi,
        code,
        functionName: "query",
        args: [
          token,
          user,
          morpho,
          permit2,
          bundler,
          permissionedBackedTokens[parameters.chainId].has(token),
          permissionedWrapperTokens[parameters.chainId].has(token),
        ],
      });

      return new Holding({
        user,
        token,
        erc20Allowances,
        permit2Allowances,
        erc2612Nonce: isErc2612 ? erc2612Nonce : undefined,
        balance,
        canTransfer,
      });
    } catch {
      // Fallback to multicall if deployless call fails.
    }
  }

  const chainAddresses = getChainAddresses(parameters.chainId);

  const [
    balance,
    erc20Allowances,
    permit2Allowances,
    erc2612Nonce,
    whitelistControllerAggregator,
    hasErc20WrapperPermission,
  ] = await Promise.all([
    readContract(client, {
      ...parameters,
      abi: erc20Abi,
      address: token,
      functionName: "balanceOf",
      args: [user],
    }),
    Promise.all(
      ERC20_ALLOWANCE_RECIPIENTS.map(
        async (label) =>
          [
            label,
            await readContract(client, {
              ...parameters,
              abi: erc20Abi,
              address: token,
              functionName: "allowance",
              args: [user, chainAddresses[label] as Address],
            }),
          ] as const,
      ),
    ),
    Promise.all(
      PERMIT2_ALLOWANCE_RECIPIENTS.map(
        async (label) =>
          [
            label,
            await readContract(client, {
              ...parameters,
              abi: permit2Abi,
              address: chainAddresses.permit2 as Address,
              functionName: "allowance",
              args: [user, token, chainAddresses[label] as Address],
            }).then(([amount, expiration, nonce]) => ({
              amount,
              expiration: BigInt(expiration),
              nonce: BigInt(nonce),
            })),
          ] as const,
      ),
    ),
    readContract(client, {
      ...parameters,
      abi: erc2612Abi,
      address: token,
      functionName: "nonces",
      args: [user],
    }).catch(() => undefined),
    permissionedBackedTokens[parameters.chainId].has(token)
      ? readContract(client, {
          ...parameters,
          abi: wrappedBackedTokenAbi,
          address: token,
          functionName: "whitelistControllerAggregator",
        })
      : undefined,
    readContract(client, {
      ...parameters,
      abi: permissionedErc20WrapperAbi,
      address: token,
      functionName: "hasPermission",
      args: [user],
    }).catch(() => !permissionedWrapperTokens[parameters.chainId!].has(token)),
  ]);

  const holding = new Holding({
    user,
    token,
    erc20Allowances: fromEntries(erc20Allowances),
    permit2Allowances: fromEntries(permit2Allowances),
    erc2612Nonce,
    balance,
    canTransfer: hasErc20WrapperPermission,
  });

  if (whitelistControllerAggregator)
    holding.canTransfer = await readContract(client, {
      ...parameters,
      abi: whitelistControllerAggregatorV2Abi,
      address: whitelistControllerAggregator,
      functionName: "isWhitelisted",
      args: [user],
    }).catch(() => false);

  return holding;
}
