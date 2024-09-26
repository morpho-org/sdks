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
> = { data: NestedRecord<Index, TData> } & (
  | {
      error: null;
      isError: false;
      isFetching: boolean;
      isPending: false;
      isSuccess: boolean;
    }
  | {
      error: TError;
      isError: true;
      isFetching: boolean;
      isPending: false;
      isSuccess: false;
    }
  | {
      error: null;
      isError: false;
      isFetching: true;
      isPending: false;
      isSuccess: false;
    }
  | {
      error: null;
      isError: false;
      isFetching: false;
      isPending: true;
      isSuccess: false;
    }
);

export function combineIndexedQueries<
  TData,
  TError = DefaultError,
  Index extends PropertyKey[] = PropertyKey[],
  QueryResult extends UseQueryResult<TData, TError> = UseQueryResult<
    TData,
    TError
  >,
>(getIndex: (data: TData) => Index) {
  return function (results: QueryResult[]) {
    const indexedData = {} as NestedRecord<Index, TData>;

    for (const { data } of results) {
      if (data == null) continue;

      const index = getIndex(data);
      if (index.length === 0) continue;

      let levelData = indexedData;
      for (let i = 0; i < index.length - 1; i++)
        // @ts-ignore
        levelData = levelData[index[i]!] ??= {};
      // @ts-ignore
      levelData[index[index.length - 1]!] = data;
    }

    return {
      data: indexedData,
      error: results.find((result) => result.error)?.error ?? null,
      isError: results.some((result) => result.isError),
      isFetching: results.some((result) => result.isFetching),
      isPending: results.every((result) => result.isPending),
      isSuccess: results.every((result) => result.isSuccess),
    } as CombineIndexedQueriesReturnType<TData, TError, Index>;
  };
}
