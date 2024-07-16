import {
  ChainId,
  ChainUtils,
  MarketConfig,
  MarketId,
  UnknownMarketConfigError,
  _try,
  getChainAddresses,
} from "@morpho-org/blue-sdk";
import {
  Account,
  Address,
  Chain,
  ParseAccount,
  PublicClient,
  RpcSchema,
  Transport,
} from "viem";
import { blueAbi } from "../abis";

export async function fetchMarketConfig<
  transport extends Transport,
  chain extends Chain | undefined = undefined,
  accountOrAddress extends Account | Address | undefined = undefined,
  rpcSchema extends RpcSchema | undefined = undefined,
>(
  id: MarketId,
  client: PublicClient<
    transport,
    chain,
    ParseAccount<accountOrAddress>,
    rpcSchema
  >,
  { chainId }: { chainId?: ChainId } = {},
) {
  let config = _try(() => MarketConfig.get(id), UnknownMarketConfigError);

  if (!config) {
    chainId = ChainUtils.parseSupportedChainId(
      chainId ?? (await client.getChainId()),
    );

    const { morpho } = getChainAddresses(chainId);

    const [loanToken, collateralToken, oracle, irm, lltv] =
      // Always fetch at latest block because config is immutable.
      await client.readContract({
        address: morpho as Address,
        abi: blueAbi,
        functionName: "idToMarketParams",
        args: [id],
      });

    config = new MarketConfig({
      loanToken,
      collateralToken,
      oracle,
      irm,
      lltv,
    });
  }

  return config;
}

declare module "@morpho-org/blue-sdk" {
  namespace MarketConfig {
    let fetch: typeof fetchMarketConfig;
  }
}

MarketConfig.fetch = fetchMarketConfig;
