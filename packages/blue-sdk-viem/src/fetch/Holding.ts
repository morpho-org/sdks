import {
  ChainId,
  ChainUtils,
  ERC20_ALLOWANCE_RECIPIENTS,
  Holding,
  NATIVE_ADDRESS,
  PERMIT2_ALLOWANCE_RECIPIENTS,
  getChainAddresses,
  permissionedBackedTokens,
  permissionedWrapperTokens,
} from "@morpho-org/blue-sdk";
import { fromEntries } from "@morpho-org/morpho-ts";
import { Address, Client, erc20Abi, maxUint256 } from "viem";
import { getBalance, getChainId, readContract } from "viem/actions";
import {
  erc2612Abi,
  permissionedErc20WrapperAbi,
  permit2Abi,
  whitelistControllerAggregatorV2Abi,
  wrappedBackedTokenAbi,
} from "../abis";
import { ViewOverrides } from "../types";

export async function fetchHolding(
  user: Address,
  token: Address,
  client: Client,
  {
    chainId,
    overrides = {},
  }: { chainId?: ChainId; overrides?: ViewOverrides } = {},
) {
  chainId = ChainUtils.parseSupportedChainId(
    chainId ?? (await getChainId(client)),
  );

  const chainAddresses = getChainAddresses(chainId);

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
      balance: await getBalance(client, { ...overrides, address: user }),
    });

  const [
    balance,
    erc20Allowances,
    permit2Allowances,
    erc2612Nonce,
    whitelistControllerAggregator,
    hasErc20WrapperPermission,
  ] = await Promise.all([
    readContract(client, {
      ...overrides,
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
              ...overrides,
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
              ...overrides,
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
      ...overrides,
      abi: erc2612Abi,
      address: token,
      functionName: "nonces",
      args: [user],
    }).catch(() => undefined),
    permissionedBackedTokens[chainId].has(token)
      ? readContract(client, {
          ...overrides,
          abi: wrappedBackedTokenAbi,
          address: token,
          functionName: "whitelistControllerAggregator",
        })
      : undefined,
    readContract(client, {
      ...overrides,
      abi: permissionedErc20WrapperAbi,
      address: token,
      functionName: "hasPermission",
      args: [user],
    }).catch(() =>
      permissionedWrapperTokens[chainId].has(token) ? false : undefined,
    ),
  ]);

  const holding = new Holding({
    user,
    token,
    erc20Allowances: fromEntries(erc20Allowances),
    permit2Allowances: fromEntries(permit2Allowances),
    erc2612Nonce,
    balance,
    canTransfer: hasErc20WrapperPermission ?? true,
  });

  if (whitelistControllerAggregator)
    holding.canTransfer = await readContract(client, {
      ...overrides,
      abi: whitelistControllerAggregatorV2Abi,
      address: whitelistControllerAggregator,
      functionName: "isWhitelisted",
      args: [user],
    }).catch(() => undefined);

  return holding;
}
