import {
  NATIVE_ADDRESS,
  getChainAddresses,
  permissionedBackedTokens,
  permissionedWrapperTokens,
} from "@morpho-org/blue-sdk";
import { type Address, type Client, zeroAddress } from "viem";
import { getChainId, readContract } from "viem/actions";

import { abi, code } from "../queries/GetHoldings";
import type { DeploylessFetchParameters } from "../types";
import { fetchHolding, transformDeploylessHoldingRead } from "./Holding";

export const optionalBoolean = [undefined, false, true] as const;

export async function fetchHoldings(
  reqs: { user: Address; token: Address }[],
  client: Client,
  { deployless = true, ...parameters }: DeploylessFetchParameters = {},
) {
  const chainId = (parameters.chainId ??= await getChainId(client));

  if (deployless) {
    const nativeTokenReqs = reqs.filter(
      ({ token }) => token === NATIVE_ADDRESS,
    );
    const nonNativeTokenReqs = reqs.filter(
      ({ token }) => token !== NATIVE_ADDRESS,
    );

    const {
      morpho,
      permit2 = zeroAddress,
      bundler3: { generalAdapter1 },
    } = getChainAddresses(parameters.chainId);

    try {
      const [nonNativeHoldings, ...nativeHoldings] = await Promise.all([
        readContract(client, {
          ...parameters,
          abi,
          code,
          functionName: "query",
          args: [
            nonNativeTokenReqs.map(({ user, token }) => ({
              token,
              user,
              isWrappedBackedToken:
                !!permissionedBackedTokens[chainId]?.has(token),
              isErc20Permissioned:
                !!permissionedWrapperTokens[chainId]?.has(token),
            })),
            morpho,
            permit2,
            generalAdapter1,
          ],
        }),
        ...nativeTokenReqs.map(({ user, token }) =>
          fetchHolding(user, token, client, parameters),
        ),
      ]);

      let i = 0;
      let j = 0;
      return reqs.map((req) =>
        req.token === NATIVE_ADDRESS
          ? nativeHoldings[i++]!
          : transformDeploylessHoldingRead(req, nonNativeHoldings[j++]!),
      );
    } catch {
      // Fallback to multicall if deployless call fails.
    }
  }

  return Promise.all(
    reqs.map(({ user, token }) =>
      fetchHolding(user, token, client, parameters),
    ),
  );
}
