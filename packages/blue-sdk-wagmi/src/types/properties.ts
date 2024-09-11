import { DefaultError, QueryKey } from "@tanstack/react-query";
import { Config } from "wagmi";
import { UseQueryParameters } from "wagmi/query";

export type ConfigParameter<config extends Config = Config> = {
  config?: Config | config | undefined;
};

export type QueryParameter<
  queryFnData = unknown,
  error = DefaultError,
  data = queryFnData,
  queryKey extends QueryKey = QueryKey,
> = {
  query?:
    | Omit<
        UseQueryParameters<queryFnData, error, data, queryKey>,
        "queryFn" | "queryHash" | "queryKey" | "queryKeyHashFn" | "throwOnError"
      >
    | undefined;
};
