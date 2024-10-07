import type { QueryClient } from "@tanstack/react-query";
import type { RenderHookOptions, RenderOptions } from "@testing-library/react";
import type { Config } from "@wagmi/core";
import type { FunctionComponent, ReactElement, ReactNode } from "react";
import type { Chain, Transport } from "viem";

// biome-ignore lint/suspicious/noExplicitAny: test utility
export async function createWrapper<TComponent extends FunctionComponent<any>>(
  Wrapper: TComponent,
  props: Parameters<TComponent>[0],
  queryClient?: QueryClient,
) {
  const { QueryClient } = await import("@tanstack/react-query");

  queryClient ??= new QueryClient();

  const { createElement } = await import("react");
  const { QueryClientProvider } = await import("@tanstack/react-query");

  return function CreatedWrapper({ children }: { children?: ReactNode }) {
    return createElement(
      Wrapper,
      props,
      createElement(QueryClientProvider, { client: queryClient }, children),
    );
  };
}

export async function renderHook<
  Props,
  Result,
  chains extends readonly [Chain, ...Chain[]] = readonly [Chain, ...Chain[]],
  transports extends Record<chains[number]["id"], Transport> = Record<
    chains[number]["id"],
    Transport
  >,
>(
  config: Config<chains, transports>,
  render: (props: Props) => Result,
  options?: RenderHookOptions<Props> & { queryClient?: QueryClient },
) {
  options?.queryClient?.clear();

  const { WagmiProvider } = await import("wagmi");
  const { renderHook } = await import("@testing-library/react");

  return renderHook(render, {
    wrapper: await createWrapper(
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

export async function createRender<
  chains extends readonly [Chain, ...Chain[]] = readonly [Chain, ...Chain[]],
  transports extends Record<chains[number]["id"], Transport> = Record<
    chains[number]["id"],
    Transport
  >,
>(
  config: Config<chains, transports>,
  element: ReactElement,
  options?: RenderOptions & { queryClient?: QueryClient },
) {
  options?.queryClient?.clear();

  const { WagmiProvider } = await import("wagmi");
  const { render } = await import("@testing-library/react");

  return render(element, {
    wrapper: await createWrapper(
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
