import type { Holding } from "@morpho-org/blue-sdk";
import type { Address, Client } from "viem";
import { getChainId } from "viem/actions";
import type { DeploylessFetchParameters } from "../types";
import { fetchHolding } from "./Holding";

export async function fetchHoldings(
  user: Address,
  tokens: readonly Address[],
  client: Client,
  { chainId, ...parameters }: DeploylessFetchParameters = {},
) {
  chainId ??= await getChainId(client);

  const holdings = await Promise.all(
    tokens.map((token) =>
      fetchHolding(user, token, client, { ...parameters, chainId }),
    ),
  );

  return tokens.reduce<Record<Address, Holding>>((acc, token, i) => {
    acc[token] = holdings[i]!;
    return acc;
  }, {});
}
