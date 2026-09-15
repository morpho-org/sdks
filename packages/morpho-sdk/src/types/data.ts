import type { FetchParameters as BlueFetchParameters } from "@morpho-org/blue-sdk-viem";

/** Account, block selector, and state overrides accepted by entity reads. */
export type FetchParameters = Omit<BlueFetchParameters, "chainId">;
