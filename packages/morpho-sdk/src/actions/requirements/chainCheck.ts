import type { Client } from "viem";
import { validateClientChainId } from "./validateClientChainId.js";

/** A lazy chain validation shared only within one invocation. @internal */
export type ChainCheck = () => Promise<void>;

/** Creates an invocation-local check, retaining both success and failure. @internal */
export const createChainCheck = (
  client: Client,
  chainId: number,
): ChainCheck => {
  let pending: Promise<void> | undefined;
  return () => (pending ??= validateClientChainId(client, chainId));
};
