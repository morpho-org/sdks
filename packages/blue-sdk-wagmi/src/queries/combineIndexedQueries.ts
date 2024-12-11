import { isDefined } from "@morpho-org/morpho-ts";
import type { DefaultError, UseQueryResult } from "@tanstack/react-query";

export type DottedPropertyKeys<T> = T extends object | null | undefined
  ? {
      [K in keyof T & string]: T[K] extends PropertyKey
        ? K
        : T[K] extends object | null | undefined
          ? `${K}.${DottedPropertyKeys<T[K]>}`
          : never;
    }[keyof T & string]
  : "";

export type NestedRecord<Index extends PropertyKey[], T> = Index extends []
  ? T
  : {
      [K in Index[0]]: NestedRecord<
        Index extends [infer _, ...infer Rest] ? Rest : never,
        T
      >;
    };

export type CombineIndexedQueriesReturnType<
  TData = unknown,
  TError = DefaultError,
  Index extends PropertyKey[] = PropertyKey[],
> = {
  data: NestedRecord<Index, TData>;
  error: TError | null;
  isFetching: boolean;
};

export function combineIndexedQueries<
  TData,
  Index extends PropertyKey[],
  TError = DefaultError,
  QueryResult extends UseQueryResult<TData, TError> = UseQueryResult<
    TData,
    TError
  >,
>(
  getIndex: (
    data: NonNullable<TData>,
  ) => Index extends (infer V)[] ? (V | null | undefined)[] : never,
) {
  return (
    results: QueryResult[],
  ): CombineIndexedQueriesReturnType<TData, TError, Index> => {
    const combined = {
      data: {} as NestedRecord<Index, TData>,
      error: results.map(({ error }) => error).find(isDefined) ?? null,
      isFetching: results.some(({ isFetching }) => isFetching),
    };

    for (const { data } of results) {
      if (data == null) continue;

      const index = getIndex(data);

      let { data: levelData } = combined;
      for (const subIndex of index.slice(0, -1)) {
        // @ts-ignore
        levelData = levelData[subIndex] ??= {};
      }

      const lastSubIndex = index[index.length - 1]!;

      // @ts-ignore
      levelData[lastSubIndex] = data;
    }

    return combined;
  };
}
