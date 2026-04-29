import type { Address } from "viem";

import { TRANSFER_TOPIC } from "../simulate/parsing/transfers.js";
import { encodeUint256 } from "./encode-uint256.js";
import { makeTransferLog } from "./make-transfer-log.js";
import { padAddress } from "./pad-address.js";

const USER: Address = "0x1111111111111111111111111111111111111111";
const VAULT: Address = "0x2222222222222222222222222222222222222222";
const USDC: Address = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";

describe("makeTransferLog", () => {
  it("uses the ERC20 Transfer topic in topics[0]", () => {
    const log = makeTransferLog({
      token: USDC,
      from: USER,
      to: VAULT,
      amount: 1n,
    });
    expect(log.topics[0]).toBe(TRANSFER_TOPIC);
  });

  it("puts the token in `address`", () => {
    const log = makeTransferLog({
      token: USDC,
      from: USER,
      to: VAULT,
      amount: 1n,
    });
    expect(log.address).toBe(USDC);
  });

  it("pads `from` into topics[1] and `to` into topics[2]", () => {
    const log = makeTransferLog({
      token: USDC,
      from: USER,
      to: VAULT,
      amount: 1n,
    });
    expect(log.topics).toHaveLength(3);
    expect(log.topics[1]).toBe(padAddress(USER));
    expect(log.topics[2]).toBe(padAddress(VAULT));
  });

  it("encodes `amount` into data as a uint256 hex word", () => {
    const log = makeTransferLog({
      token: USDC,
      from: USER,
      to: VAULT,
      amount: 1_000_000n,
    });
    expect(log.data).toBe(encodeUint256(1_000_000n));
  });

  it("round-trips through parseTransfers without loss", async () => {
    const { parseTransfers } = await import("../simulate/parsing/transfers.js");
    const log = makeTransferLog({
      token: USDC,
      from: USER,
      to: VAULT,
      amount: 42n,
    });
    const parsed = parseTransfers([log]);

    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toEqual({
      token: USDC,
      from: USER,
      to: VAULT,
      amount: 42n,
    });
  });
});
