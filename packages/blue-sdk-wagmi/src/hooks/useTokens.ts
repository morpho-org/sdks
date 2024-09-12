import { Token } from "@morpho-org/blue-sdk";
import { useQueries } from "@tanstack/react-query";
import { Address } from "viem";
import { Config, ResolvedRegister, useConfig } from "wagmi";
import { structuralSharing } from "wagmi/query";
import {
  TokenParameters,
  fetchTokenQueryOptions,
} from "../queries/fetchToken.js";
import { useChainId } from "./useChainId.js";
import { UseTokenParameters, UseTokenReturnType } from "./useToken.js";

export type UseTokensParameters<
  config extends Config = Config,
  selectData = Token,
> = {
  tokens: Iterable<Address | undefined>;
} & Omit<UseTokenParameters<config, selectData>, keyof TokenParameters>;

export type UseTokensReturnType<selectData = Token> =
  UseTokenReturnType<selectData>[];

export function useTokens<
  config extends Config = ResolvedRegister["config"],
  selectData = Token,
>({
  tokens,
  query = {},
  ...parameters
}: UseTokensParameters<config, selectData>): UseTokensReturnType<selectData> {
  const config = useConfig(parameters);
  const chainId = useChainId(parameters);

  return useQueries({
    queries: Array.from(tokens, (token) => ({
      ...query,
      ...fetchTokenQueryOptions(config, {
        ...parameters,
        token,
        chainId,
      }),
      enabled: token != null && query.enabled,
      structuralSharing: query.structuralSharing ?? structuralSharing,
    })),
  });
}
