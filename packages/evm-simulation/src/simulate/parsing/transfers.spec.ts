import { type Address, type Hex, getAddress, zeroAddress } from "viem";
import { vi } from "vitest";

import type { RawLog } from "../../types.js";

import { encodeUint256, padAddress } from "../../test-helpers/index.js";
import {
  DEPOSIT_TOPIC,
  TRANSFER_TOPIC,
  WITHDRAWAL_TOPIC,
  parseTransfers,
} from "./transfers.js";

const USDC: Address = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const WETH: Address = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
const DAI: Address = "0x6B175474E89094C44Da98b954EedeAC495271d0F";
const USER: Address = "0x1111111111111111111111111111111111111111";
const VAULT: Address = "0x2222222222222222222222222222222222222222";

describe("parseTransfers", () => {
  it("parses a standard ERC20 Transfer", () => {
    const logs: RawLog[] = [
      {
        address: USDC,
        topics: [TRANSFER_TOPIC, padAddress(USER), padAddress(VAULT)],
        data: encodeUint256(1000000n),
      },
    ];

    const result = parseTransfers(logs);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      token: getAddress(USDC),
      from: getAddress(USER),
      to: getAddress(VAULT),
      amount: 1000000n,
    });
  });

  it("returns empty array for empty logs", () => {
    expect(parseTransfers([])).toEqual([]);
  });

  it("skips logs with undefined topic0", () => {
    const logs: RawLog[] = [{ address: USDC, topics: [], data: "0x" as Hex }];
    expect(parseTransfers(logs)).toEqual([]);
  });

  it("skips Transfer logs with wrong number of topics", () => {
    const logs: RawLog[] = [
      {
        address: USDC,
        topics: [TRANSFER_TOPIC, padAddress(USER)], // only 2 topics, need 3
        data: encodeUint256(1000n),
      },
    ];
    expect(parseTransfers(logs)).toEqual([]);
  });

  it("skips Transfer logs with short-topic (hex length < 66)", () => {
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const logs: RawLog[] = [
      {
        address: USDC,
        topics: [TRANSFER_TOPIC, "0x0000000000" as Hex, padAddress(VAULT)],
        data: encodeUint256(1000n),
      },
    ];
    expect(parseTransfers(logs, logger)).toEqual([]);
    expect(logger.warn).toHaveBeenCalledOnce();
  });

  it("skips logs where data is not a 32-byte uint256 word", () => {
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const logs: RawLog[] = [
      {
        address: USDC,
        topics: [TRANSFER_TOPIC, padAddress(USER), padAddress(VAULT)],
        data: "0x" as Hex, // empty — would throw on BigInt('0x')
      },
    ];
    expect(parseTransfers(logs, logger)).toEqual([]);
    expect(logger.warn).toHaveBeenCalledOnce();
  });

  it("skips WETH9 Withdrawal with short topic or bad data", () => {
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const logs: RawLog[] = [
      {
        address: WETH,
        topics: [WITHDRAWAL_TOPIC, "0x00" as Hex],
        data: encodeUint256(1n),
      },
    ];
    expect(parseTransfers(logs, logger)).toEqual([]);
    expect(logger.warn).toHaveBeenCalledOnce();
  });

  it("deduplicates WETH9 unwrap (Withdrawal + burn Transfer)", () => {
    const amount = 1000000000000000000n; // 1 ETH
    const logs: RawLog[] = [
      {
        address: WETH,
        topics: [WITHDRAWAL_TOPIC, padAddress(USER)],
        data: encodeUint256(amount),
      },
      {
        address: WETH,
        topics: [
          TRANSFER_TOPIC,
          padAddress(USER),
          `0x${"0".repeat(64)}` as Hex,
        ],
        data: encodeUint256(amount),
      },
    ];

    const result = parseTransfers(logs);

    // Only the Withdrawal-derived transfer remains (the burn Transfer is deduped)
    expect(result).toHaveLength(1);
    expect(result[0]!.from).toBe(getAddress(USER));
    expect(result[0]!.to).toBe(zeroAddress);
  });

  it("deduplicates WETH9 wrap (Deposit + mint Transfer)", () => {
    const amount = 1000000000000000000n;
    const logs: RawLog[] = [
      {
        address: WETH,
        topics: [DEPOSIT_TOPIC, padAddress(USER)],
        data: encodeUint256(amount),
      },
      {
        address: WETH,
        topics: [
          TRANSFER_TOPIC,
          `0x${"0".repeat(64)}` as Hex,
          padAddress(USER),
        ],
        data: encodeUint256(amount),
      },
    ];

    const result = parseTransfers(logs);

    expect(result).toHaveLength(1);
    expect(result[0]!.from).toBe(zeroAddress);
    expect(result[0]!.to).toBe(getAddress(USER));
  });

  it("handles multi-token flows", () => {
    const logs: RawLog[] = [
      {
        address: USDC,
        topics: [TRANSFER_TOPIC, padAddress(USER), padAddress(VAULT)],
        data: encodeUint256(1000000n),
      },
      {
        address: DAI,
        topics: [TRANSFER_TOPIC, padAddress(VAULT), padAddress(USER)],
        data: encodeUint256(2000000000000000000n),
      },
    ];

    const result = parseTransfers(logs);
    expect(result).toHaveLength(2);
  });

  it("sorts output canonically by token, from, to", () => {
    const logs: RawLog[] = [
      {
        address: DAI, // 0x6B...
        topics: [TRANSFER_TOPIC, padAddress(USER), padAddress(VAULT)],
        data: encodeUint256(1000n),
      },
      {
        address: USDC, // 0xA0...
        topics: [TRANSFER_TOPIC, padAddress(USER), padAddress(VAULT)],
        data: encodeUint256(2000n),
      },
    ];

    const result = parseTransfers(logs);
    expect(result).toHaveLength(2);
    // DAI's hex value is lexicographically less than USDC's, so DAI sorts first.
    expect(result[0]!.token.toLowerCase()).toBe(DAI.toLowerCase());
    expect(result[1]!.token.toLowerCase()).toBe(USDC.toLowerCase());
  });

  it("skips a malformed log and warns, while still returning valid transfers", () => {
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

    const validLog: RawLog = {
      address: USDC,
      topics: [TRANSFER_TOPIC, padAddress(USER), padAddress(VAULT)],
      data: encodeUint256(1000000n),
    };
    const malformedLog: RawLog = {
      address: USDC,
      topics: [TRANSFER_TOPIC, padAddress(USER), padAddress(VAULT)],
      data: "0xinvalid" as Hex, // wrong length
    };

    const result = parseTransfers([validLog, malformedLog], logger);

    expect(result).toHaveLength(1);
    expect(result[0]!.amount).toBe(1000000n);
    expect(logger.warn).toHaveBeenCalledOnce();
  });
});
