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
import {
  Account,
  Address,
  Chain,
  PublicClient,
  RpcSchema,
  Transport,
  erc20Abi,
  maxUint256,
} from "viem";
import {
  erc2612Abi,
  permissionedErc20WrapperAbi,
  permit2Abi,
  whitelistControllerAggregatorV2Abi,
  wrappedBackedTokenAbi,
} from "../abis";
import { ViewOverrides } from "../types";

export async function fetchHolding<
  transport extends Transport,
  chain extends Chain | undefined,
  account extends Account | undefined,
  rpcSchema extends RpcSchema | undefined,
>(
  user: Address,
  token: Address,
  client: PublicClient<transport, chain, account, rpcSchema>,
  {
    chainId,
    overrides = {},
  }: { chainId?: ChainId; overrides?: ViewOverrides } = {},
) {
  chainId = ChainUtils.parseSupportedChainId(
    chainId ?? (await client.getChainId()),
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
      balance: await client.getBalance({ ...overrides, address: user }),
    });

  // const erc20 = ERC20__factory.connect(token, runner);
  // const permit2 = Permit2__factory.connect(chainAddresses.permit2, runner);
  // const erc2612 = ERC2612__factory.connect(token, runner);

  const [
    balance,
    erc20Allowances,
    permit2Allowances,
    erc2612Nonce,
    whitelistControllerAggregator,
    hasErc20WrapperPermission,
  ] = await Promise.all([
    client.readContract({
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
            await client.readContract({
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
            await client
              .readContract({
                ...overrides,
                abi: permit2Abi,
                address: chainAddresses.permit2 as Address,
                functionName: "allowance",
                args: [user, token, chainAddresses[label] as Address],
              })
              .then(([amount, expiration, nonce]) => ({
                amount,
                expiration: BigInt(expiration),
                nonce: BigInt(nonce),
              })),
          ] as const,
      ),
    ),
    client
      .readContract({
        ...overrides,
        abi: erc2612Abi,
        address: token,
        functionName: "nonces",
        args: [user],
      })
      .catch(() => undefined),
    permissionedBackedTokens[chainId].has(token)
      ? client.readContract({
          ...overrides,
          abi: wrappedBackedTokenAbi,
          address: token,
          functionName: "whitelistControllerAggregator",
        })
      : undefined,
    client
      .readContract({
        ...overrides,
        abi: permissionedErc20WrapperAbi,
        address: token,
        functionName: "hasPermission",
        args: [user],
      })
      .catch(() =>
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
    holding.canTransfer = await client
      .readContract({
        ...overrides,
        abi: whitelistControllerAggregatorV2Abi,
        address: whitelistControllerAggregator,
        functionName: "isWhitelisted",
        args: [user],
      })
      .catch(() => undefined);

  return holding;
}
