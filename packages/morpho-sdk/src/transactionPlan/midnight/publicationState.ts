import type { Tree } from "@morpho-org/midnight-sdk";
import {
  type Client,
  type EIP1193Parameters,
  type EIP1193RequestFn,
  type EIP1193RequestOptions,
  numberToHex,
} from "viem";
import { getBlock, getBlockNumber } from "viem/actions";
import type { ChainCheck } from "../../actions/requirements/chainCheck.js";
import { fetchMidnightMakerOfferStatesWithChainCheck } from "../../entities/midnight/publication.js";
import { ExpiredDeadlineError } from "../../types/index.js";

/**
 * Reads maker publication state for a TransactionPlan at a block it pins first, and returns that
 * block so later reads can use it. With a `bundleDeadline`, it rejects the deadline against the
 * pinned block's timestamp before any contract read.
 * @param params - Client, chain, maker tree and optional bundle deadline.
 * @param chainCheck - The invocation's chain check, run before the first read.
 * @returns Per-offer states plus the timestamp and number of the pinned block.
 * @throws {ChainIdMismatchError} when the client's RPC reports another chain.
 * @throws {ExpiredDeadlineError} when `bundleDeadline` is at or before the pinned block timestamp while every offer is live.
 * @throws {viem.BaseError} when block, contract, or oracle-code reads fail.
 * @internal
 */
export async function fetchMidnightMakerOfferStatesBeforeDeadline(
  params: {
    readonly client: Client;
    readonly chainId: number;
    readonly tree: Tree<"priceV1"> | Tree<"rateV1">;
    readonly bundleDeadline?: bigint;
  },
  chainCheck: ChainCheck,
): Promise<
  Awaited<ReturnType<typeof fetchMidnightMakerOfferStatesWithChainCheck>> & {
    readonly blockNumber: bigint;
  }
> {
  const { client, chainId, tree, bundleDeadline } = params;
  await chainCheck();
  const blockNumber = await getBlockNumber(client);
  const pinnedBlock = numberToHex(blockNumber);
  let header: { readonly value: unknown } | undefined;
  const forward = client.request as EIP1193RequestFn;
  const request = async (
    args: EIP1193Parameters,
    options?: EIP1193RequestOptions,
  ): Promise<unknown> => {
    if (
      args.method !== "eth_getBlockByNumber" ||
      !Array.isArray(args.params) ||
      args.params[0] !== pinnedBlock
    ) {
      return forward(args, options);
    }
    header ??= { value: await forward(args, options) };
    return header.value;
  };
  const pinnedClient: Client = {
    ...client,
    request: request as Client["request"],
  };
  if (bundleDeadline !== undefined) {
    const { timestamp } = await getBlock(pinnedClient, { blockNumber });
    // Let offer validation keep its typed error when an offer has already expired.
    if (
      bundleDeadline <= timestamp &&
      tree.offers.every(({ expiry }) => expiry > timestamp)
    ) {
      throw new ExpiredDeadlineError(bundleDeadline, timestamp);
    }
  }
  const { states, now } = await fetchMidnightMakerOfferStatesWithChainCheck(
    { client: pinnedClient, chainId, tree, blockNumber },
    chainCheck,
  );
  return { states, now, blockNumber };
}
