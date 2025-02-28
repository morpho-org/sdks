import {
  ERC20_ALLOWANCE_RECIPIENTS,
  Holding,
  NATIVE_ADDRESS,
  getChainAddresses,
  permissionedBackedTokens,
  permissionedWrapperTokens,
} from "@morpho-org/blue-sdk";
import {
  type Address,
  type Client,
  erc20Abi,
  maxUint256,
  zeroAddress,
} from "viem";
import { getBalance, getChainId, readContract } from "viem/actions";

import { fromEntries, getValue } from "@morpho-org/morpho-ts";
import {
  erc2612Abi,
  permissionedErc20WrapperAbi,
  permit2Abi,
  whitelistControllerAggregatorV2Abi,
  wrappedBackedTokenAbi,
} from "../abis";
import { abi, code } from "../queries/GetHolding";
import type { DeploylessFetchParameters } from "../types";

export const optionalBoolean = [undefined, false, true] as const;

export async function fetchHolding(
  user: Address,
  token: Address,
  client: Client,
  { deployless = true, ...parameters }: DeploylessFetchParameters = {},
) {
  parameters.chainId ??= await getChainId(client);

  if (token === NATIVE_ADDRESS)
    return new Holding({
      user,
      token,
      erc20Allowances: fromEntries(
        ERC20_ALLOWANCE_RECIPIENTS.map((label) => [label, maxUint256]),
      ),
      permit2BundlerAllowance: {
        amount: 0n,
        expiration: 0n,
        nonce: 0n,
      },
      balance: await getBalance(client, {
        // biome-ignore lint/suspicious/noExplicitAny: flattened union type
        ...(parameters as any),
        address: user,
      }),
    });

  if (deployless) {
    const {
      morpho,
      permit2 = zeroAddress,
      bundler3: { bundler3, generalAdapter1 },
    } = getChainAddresses(parameters.chainId);

    try {
      const {
        balance,
        erc20Allowances: {
          generalAdapter1: generalAdapter1Erc20Allowance,
          ...erc20Allowances
        },
        permit2BundlerAllowance,
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
          bundler3,
          generalAdapter1,
          !!permissionedBackedTokens[parameters.chainId]?.has(token),
          !!permissionedWrapperTokens[parameters.chainId]?.has(token),
        ],
      });

      return new Holding({
        user,
        token,
        erc20Allowances: {
          "bundler3.generalAdapter1": generalAdapter1Erc20Allowance,
          ...erc20Allowances,
        },
        permit2BundlerAllowance,
        erc2612Nonce: isErc2612 ? erc2612Nonce : undefined,
        balance,
        canTransfer: optionalBoolean[canTransfer],
      });
    } catch {
      // Fallback to multicall if deployless call fails.
    }
  }

  const chainAddresses = getChainAddresses(parameters.chainId);

  const [
    balance,
    erc20Allowances,
    permit2BundlerAllowance,
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
      ERC20_ALLOWANCE_RECIPIENTS.map(async (label) => {
        const spender = getValue(chainAddresses, label);
        if (spender == null) return [label, 0n] as const;

        return [
          label,
          await readContract(client, {
            ...parameters,
            abi: erc20Abi,
            address: token,
            functionName: "allowance",
            args: [user, spender],
          }),
        ] as const;
      }),
    ),
    chainAddresses.permit2 != null
      ? readContract(client, {
          ...parameters,
          abi: permit2Abi,
          address: chainAddresses.permit2,
          functionName: "allowance",
          args: [user, token, chainAddresses.bundler3.bundler3],
        }).then(([amount, expiration, nonce]) => ({
          amount,
          expiration: BigInt(expiration),
          nonce: BigInt(nonce),
        }))
      : { amount: 0n, expiration: 0n, nonce: 0n },
    readContract(client, {
      ...parameters,
      abi: erc2612Abi,
      address: token,
      functionName: "nonces",
      args: [user],
    }).catch(() => undefined),
    permissionedBackedTokens[parameters.chainId]?.has(token)
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
    }).catch(() => !permissionedWrapperTokens[parameters.chainId!]?.has(token)),
  ]);

  const holding = new Holding({
    user,
    token,
    erc20Allowances: fromEntries(erc20Allowances),
    permit2BundlerAllowance,
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
    }).catch(() => undefined);

  return holding;
}
