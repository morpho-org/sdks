import type { DefaultError, QueryKey } from "@tanstack/react-query";
import type { Config } from "wagmi";
import type { UseQueryParameters, UseQueryReturnType } from "wagmi/query";

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

export type IterableElement<T> = T extends Iterable<infer U> ? U : never;

export interface UseIndexedQueriesReturnType<
  Index extends PropertyKey,
  QueryReturnType extends UseQueryReturnType,
> {
  data: Record<Index, QueryReturnType["data"]>;
  error: Record<Index, QueryReturnType["error"]>;
  isFetching: Record<Index, QueryReturnType["isFetching"]>;
  isFetchingAny: boolean;
}

export interface UseCompositeQueriesReturnType<
  Index1 extends PropertyKey,
  Index2 extends PropertyKey,
  QueryReturnType extends UseQueryReturnType,
> {
  data: Record<Index1, Record<Index2, QueryReturnType["data"]>>;
  error: Record<Index1, Record<Index2, QueryReturnType["error"]>>;
  isFetching: Record<Index1, Record<Index2, QueryReturnType["isFetching"]>>;
  isFetchingAny: boolean;
}
