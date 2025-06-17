import { GraphQLClient } from "graphql-request";

import { BLUE_API_GRAPHQL_URL } from "@morpho-org/morpho-ts";

import type { InputMaybe, OrderDirection } from "@morpho-org/blue-api-sdk";
import type { MarketId } from "@morpho-org/blue-sdk";
import { getSdk } from "./sdk.js";

export * from "./sdk.js";
export * from "./types.js";

export const apiSdk: ReturnType<typeof getSdk> = getSdk(
  new GraphQLClient(BLUE_API_GRAPHQL_URL),
);

type QueryVariables = Record<string, unknown>;

export type PaginationVariables<V extends QueryVariables> = V & {
  first?: number;
  skip?: number;
  orderDirection?: InputMaybe<OrderDirection>;
};

export interface PageInfo {
  count: number;
  countTotal: number;
  limit: number;
  skip: number;
}

export interface PageResult<T> {
  items: T[] | null;
  pageInfo: PageInfo | null;
}

export async function paginatedQuery<T, V extends QueryVariables = {}>(
  fetchPage: (vars: PaginationVariables<V>) => Promise<PageResult<T>>,
  {
    pageSize,
    orderBy,
    orderDirection,
    args,
  }: {
    pageSize: number;
    orderBy?: string;
    orderDirection?: InputMaybe<OrderDirection>;
    args: PaginationVariables<V>;
  },
): Promise<T[]> {
  // 1) Fetch the first page serially to get total count
  const firstVars: PaginationVariables<V> = {
    ...args,
    first: pageSize,
    ...(orderBy != null ? { orderBy } : {}),
    ...(orderDirection != null ? { orderDirection } : {}),
    skip: 0,
  };
  const firstPage = await fetchPage(firstVars);
  const countTotal = firstPage.pageInfo?.countTotal ?? 0;

  if (firstPage.items == null) {
    console.warn(`paginatedQuery: received null items on first page`);
  }
  if (firstPage.pageInfo == null) {
    console.warn(`paginatedQuery: received null pageInfo on first page`);
  }

  const allItems: T[] = firstPage.items ?? [];

  // 2) Calculate how many additional pages we need
  const totalPages = Math.ceil(countTotal / pageSize);
  if (totalPages <= 1) {
    return allItems;
  }

  // 3) Kick off all remaining page fetches in parallel
  const pagePromises: Promise<PageResult<T>>[] = [];
  for (let pageIndex = 1; pageIndex < totalPages; pageIndex++) {
    pagePromises.push(fetchPage({ ...firstVars, skip: pageIndex * pageSize }));
  }

  // 4) Wait for them all
  const otherPages = await Promise.all(pagePromises);

  // 5) Flatten, warning on nulls
  otherPages.forEach((page, idx) => {
    const { items } = page;
    const pageNum = idx + 2; // human-friendly page number
    if (items == null) {
      console.warn(
        `paginateGraphQLConcurrent: received null items on page ${pageNum}`,
      );
    } else {
      allItems.push(...items);
    }
  });

  // 6) Return full list + last pageInfo (from the last fetch)
  return allItems;
}

export async function paginatedQueryWithChunkedMarketIds<
  T,
  V extends QueryVariables & { marketIds: MarketId[] },
>(
  fetchPage: (vars: PaginationVariables<V>) => Promise<PageResult<T>>,
  {
    maxMarketIds,
    pageSize,
    orderBy,
    orderDirection,
    args,
  }: {
    maxMarketIds: number;
    pageSize: number;
    orderBy?: string;
    orderDirection?: InputMaybe<OrderDirection>;
    args: PaginationVariables<V>;
  },
): Promise<T[]> {
  const chunks: MarketId[][] = [];
  for (let i = 0; i < args.marketIds.length; i += maxMarketIds) {
    chunks.push(args.marketIds.slice(i, i + maxMarketIds));
  }

  const results = await Promise.all(
    chunks.map((chunk) =>
      paginatedQuery<T, V>((vars) => fetchPage({ ...vars, marketIds: chunk }), {
        pageSize,
        orderBy,
        orderDirection,
        args,
      }),
    ),
  );

  return results.flat();
}
