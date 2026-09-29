import {
  type IMarketParams,
  type MarketId,
  MarketUtils,
} from "@morpho-org/blue-sdk";
import { isAddressEqual, zeroAddress } from "viem";
import { MarketParamsIdMismatchError } from "../error.js";

/**
 * Checks that fetched market params hash to the requested Morpho market id.
 * All-zero params are accepted because Morpho returns them for markets that
 * have not yet been created.
 *
 * @internal
 * @param id - Requested market id.
 * @param params - Market params returned by Morpho.
 * @returns Nothing when the ids match or the params represent an uncreated market.
 * @throws {MarketParamsIdMismatchError} when nonzero params hash to another market id.
 * @example
 * ```ts
 * import { MarketUtils } from "@morpho-org/blue-sdk";
 * import { validateMarketParamsId } from "./marketParamsId.js";
 *
 * const params = {
 *   loanToken: "0x0000000000000000000000000000000000000001",
 *   collateralToken: "0x0000000000000000000000000000000000000002",
 *   oracle: "0x0000000000000000000000000000000000000003",
 *   irm: "0x0000000000000000000000000000000000000004",
 *   lltv: 860_000_000_000_000_000n,
 * } as const;
 * const id = MarketUtils.getMarketId(params);
 * validateMarketParamsId(id, params);
 * ```
 */
export function validateMarketParamsId(
  id: MarketId,
  params: IMarketParams,
): void {
  const receivedId = MarketUtils.getMarketId(params);
  if (receivedId === id.toLowerCase()) return;

  if (
    [params.loanToken, params.collateralToken, params.oracle, params.irm].every(
      (address) => isAddressEqual(address, zeroAddress),
    ) &&
    BigInt(params.lltv) === 0n
  )
    return;

  throw new MarketParamsIdMismatchError(id, receivedId);
}
