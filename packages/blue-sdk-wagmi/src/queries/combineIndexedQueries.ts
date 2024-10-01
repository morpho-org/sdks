import { DefaultError, UseQueryResult } from "@tanstack/react-query";

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
  error: NestedRecord<Index, NonNullable<TError>>;
  isFetching: NestedRecord<Index, true>;
  isFetchingAny: boolean;
};

export function combineIndexedQueries<
  TData,
  TError = DefaultError,
  Index extends PropertyKey[] = PropertyKey[],
  QueryResult extends UseQueryResult<TData, TError> = UseQueryResult<
    TData,
    TError
  >,
>(getIndex: (data: TData) => Index) {
  return function (
    results: QueryResult[],
  ): CombineIndexedQueriesReturnType<TData, TError, Index> {
    const combined = {
      data: {} as NestedRecord<Index, TData>,
      error: {} as NestedRecord<Index, NonNullable<TError>>,
      isFetching: {} as NestedRecord<Index, true>,
      isFetchingAny: results.some(({ isFetching }) => isFetching),
    };

    for (const { data, error, isFetching } of results) {
      if (data == null) continue;

      const index = getIndex(data);
      if (index.length === 0) continue;

      const isError = error != null;

      let {
        data: levelData,
        error: levelError,
        isFetching: levelIsFetching,
      } = combined;
      for (const subIndex of index.slice(0, -1)) {
        // @ts-ignore
        levelData = levelData[subIndex] ??= {};
        if (isError)
          // @ts-ignore
          levelError = levelError[subIndex] ??= {};
        if (isFetching)
          // @ts-ignore
          levelIsFetching = levelIsFetching[subIndex] ??= {};
      }

      const lastSubIndex = index[index.length - 1]!;

      // @ts-ignore
      levelData[lastSubIndex] = data;
      if (isError)
        // @ts-ignore
        levelError[lastSubIndex] = error;
      if (isFetching)
        // @ts-ignore
        levelIsFetching[lastSubIndex] = isFetching;
    }

    return combined;
  };
}
