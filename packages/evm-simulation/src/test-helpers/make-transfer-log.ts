import type { Address } from "viem";

import type { RawLog } from "../types.js";

import { TRANSFER_TOPIC } from "../simulate/parsing/transfers.js";
import { encodeUint256 } from "./encode-uint256.js";
import { padAddress } from "./pad-address.js";

/**
 * Build a `RawLog` shaped like an ERC20 Transfer event, for use as a spec
 * fixture. Callers avoid hand-rolling topic hashes and padding every time.
 *
 * Topic 0 is the ERC20 `Transfer(address,address,uint256)` hash; `from` and
 * `to` go in topics 1 and 2 (indexed), and `amount` goes in `data`.
 */
export function makeTransferLog(params: {
  token: Address;
  from: Address;
  to: Address;
  amount: bigint;
}): RawLog {
  return {
    address: params.token,
    topics: [TRANSFER_TOPIC, padAddress(params.from), padAddress(params.to)],
    data: encodeUint256(params.amount),
  };
}
