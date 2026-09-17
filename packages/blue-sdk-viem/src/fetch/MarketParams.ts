import {
  getChainAddresses,
  type MarketId,
  MarketParams,
  UnknownMarketParamsError,
} from "@morpho-org/blue-sdk";
import { _try } from "@morpho-org/morpho-ts";
import type { Client } from "viem";
import { getChainId } from "viem/actions";
import { blueAbi } from "../abis.js";
import { readContractRestructured } from "../utils.js";

/**
 * Fetches immutable Morpho Blue market params by market id.
 *
 * Reads the local `MarketParams` registry first, then falls back to
 * `Morpho.idToMarketParams(id)` at the latest block when the id is not registered locally.
 *
 * @param id - Market id whose params should be resolved.
 * @param client - Viem client used for the fallback on-chain read.
 * @returns The resolved `MarketParams` entity.
 * @example
 * ```ts
 * import type { MarketId, MarketParams } from "@morpho-org/blue-sdk";
 * import { fetchMarketParams } from "@morpho-org/blue-sdk-viem";
 * import { createPublicClient, http } from "viem";
 * import { mainnet } from "viem/chains";
 *
 * const client = createPublicClient({ chain: mainnet, transport: http() });
 * const marketId =
 *   "0xdba352c33d64fc9bff091d505dbfcbc6c41b89986c2193b22a90031e9dac7f76" as MarketId;
 *
 * const params: MarketParams = await fetchMarketParams(marketId, client);
 * ```
 */
export async function fetchMarketParams(id: MarketId, client: Client) {
  let config = _try(() => MarketParams.get(id), UnknownMarketParamsError);

  if (!config) {
    const { blue } = getChainAddresses(await getChainId(client));

    config = new MarketParams(
      await readContractRestructured(client, {
        address: blue,
        abi: blueAbi,
        functionName: "idToMarketParams",
        args: [id],
        // Always fetch at latest block because config is immutable.
        blockTag: "latest",
      }),
    );
  }

  return config;
}
