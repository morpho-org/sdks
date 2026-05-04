import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  configure,
  type Queries,
  type queries,
  type RenderHookOptions,
  type RenderOptions,
  render as rtl_render,
  renderHook as rtl_renderHook,
  waitFor as rtl_waitFor,
  type waitForOptions,
} from "@testing-library/react";
import {
  createElement,
  type FunctionComponent,
  type ReactElement,
  type ReactNode,
} from "react";
import type { Chain, Transport } from "viem";
import { type Config, WagmiProvider } from "wagmi";

configure({ asyncUtilTimeout: 5_000 });

// biome-ignore lint/suspicious/noExplicitAny: test utility
// biome-ignore lint/complexity/useMaxParams: TODO refactor to ≤2 params
export function createWrapper<TComponent extends FunctionComponent<any>>(
  Wrapper: TComponent,
  props: Parameters<TComponent>[0],
  queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: Number.POSITIVE_INFINITY,
      },
    },
  }),
) {
  return function CreatedWrapper({ children }: { children?: ReactNode }) {
    return createElement(
      Wrapper,
      props,
      createElement(QueryClientProvider, { client: queryClient }, children),
    );
  };
}

export function renderHook<
  Result,
  Props,
  Q extends Queries = typeof queries,
  chains extends readonly [Chain, ...Chain[]] = readonly [Chain, ...Chain[]],
  transports extends Record<chains[number]["id"], Transport> = Record<
    chains[number]["id"],
    Transport
  >,
  // biome-ignore lint/complexity/useMaxParams: TODO refactor to ≤2 params
>(
  config: Config<chains, transports>,
  // biome-ignore lint/nursery/noShadow: TODO rename to avoid shadowing
  render: (props: Props) => Result,
  options?: RenderHookOptions<Props, Q> & { queryClient?: QueryClient },
) {
  options?.queryClient?.clear();

  return rtl_renderHook(render, {
    wrapper: createWrapper(
      WagmiProvider,
      {
        config,
        reconnectOnMount: false,
      },
      options?.queryClient,
    ),
    ...options,
  });
}

export function render<
  Q extends Queries = typeof queries,
  chains extends readonly [Chain, ...Chain[]] = readonly [Chain, ...Chain[]],
  transports extends Record<chains[number]["id"], Transport> = Record<
    chains[number]["id"],
    Transport
  >,
  // biome-ignore lint/complexity/useMaxParams: TODO refactor to ≤2 params
>(
  config: Config<chains, transports>,
  element: ReactElement,
  options?: RenderOptions<Q> & { queryClient?: QueryClient },
) {
  options?.queryClient?.clear();

  return rtl_render(element, {
    wrapper: createWrapper(
      WagmiProvider,
      {
        config,
        reconnectOnMount: false,
      },
      options?.queryClient,
    ),
    ...options,
  });
}

export function waitFor<T>(
  callback: () => Promise<T> | T,
  options?: waitForOptions | undefined,
): Promise<T> {
  return rtl_waitFor(callback, { timeout: 10_000, ...options });
}
