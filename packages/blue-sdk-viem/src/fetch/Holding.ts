import {
  ChainUtils,
  ERC20_ALLOWANCE_RECIPIENTS,
  getChainAddresses,
  Holding,
  NATIVE_ADDRESS,
  permissionedBackedTokens,
  permissionedWrapperTokens,
} from "@morpho-org/blue-sdk";
import { fromEntries, getValue } from "@morpho-org/morpho-ts";
import {
  type Address,
  type Client,
  erc20Abi,
  maxUint256,
  zeroAddress,
} from "viem";
import { getBalance, getChainId, readContract } from "viem/actions";
import {
  erc2612Abi,
  permissionedErc20WrapperAbi,
  permit2Abi,
  whitelistControllerAggregatorV2Abi,
  wrappedBackedTokenAbi,
} from "../abis.js";
import { abi, code } from "../queries/GetHolding.js";
import type { DeploylessFetchParameters } from "../types.js";

/** Lookup table used to decode optional deployless boolean results. */
export const optionalBoolean = [undefined, false, true] as const;

/**
 * Fetches a user's token holding, allowances, permit nonce, and transfer permission state.
 *
 * Reads native balances directly for `NATIVE_ADDRESS`. For ERC20 tokens, uses the deployless
 * `GetHolding` query by default and falls back to individual ERC20, Permit2, ERC-2612, Backed, and
 * permissioned-wrapper contract reads when allowed.
 *
 * @param user - Address whose holding is fetched.
 * @param token - Token address, or `NATIVE_ADDRESS` for the native asset.
 * @param client - Viem client used for deployless reads or multicalls.
 * @param parameters.account - Optional account passed to viem calls.
 * @param parameters.blockNumber - Optional block number for historical reads.
 * @param parameters.blockTag - Optional block tag for historical reads.
 * @param parameters.stateOverride - Optional viem state override.
 * @param parameters.chainId - Optional chain id; defaults to `getChainId(client)`.
 * @param parameters.deployless - Optional deployless read mode; defaults to `true`.
 * @returns The hydrated `Holding` entity for `user` and `token`.
 * @example
 * ```ts
 * import { NATIVE_ADDRESS, type Holding } from "@morpho-org/blue-sdk";
 * import { fetchHolding } from "@morpho-org/blue-sdk-viem";
 * import { createPublicClient, http } from "viem";
 * import { mainnet } from "viem/chains";
 *
 * const client = createPublicClient({ chain: mainnet, transport: http() });
 * const user = "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb";
 *
 * const holding: Holding = await fetchHolding(user, NATIVE_ADDRESS, client);
 * ```
 */
// biome-ignore lint/complexity/useMaxParams: TODO refactor to ≤2 params
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
      balance: ChainUtils.hasReliableNativeBalance(parameters.chainId!)
        ? await getBalance(client, {
            // biome-ignore lint/suspicious/noExplicitAny: flattened union type
            ...(parameters as any),
            address: user,
          })
        : 0n,
    });

  if (deployless) {
    const {
      morpho,
      permit2 = zeroAddress,
      bundler3: { generalAdapter1 },
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
    } catch (error) {
      if (deployless === "force") throw error;
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
          args: [user, token, chainAddresses.bundler3.generalAdapter1],
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
