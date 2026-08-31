import {
  type Address,
  ethAddress,
  getAddress,
  type Hex,
  parseEther,
  zeroAddress,
} from "viem";
import { vi } from "vitest";
import {
  encodeUint256,
  makeCall,
  padAddress,
} from "../../test-helpers/index.js";
import type { RawLog } from "../../types.js";
import {
  DEPOSIT_TOPIC,
  parseTransfers,
  TRANSFER_TOPIC,
  WITHDRAWAL_TOPIC,
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

    const result = parseTransfers([makeCall(logs)]);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      token: getAddress(USDC),
      from: getAddress(USER),
      to: getAddress(VAULT),
      amount: 1000000n,
      txIdx: 0,
    });
  });

  it("normalizes a native-ETH Transfer (eth sentinel) to viem's ethAddress", () => {
    // eth_simulateV1 + traceTransfers emits native moves from the lowercase
    // sentinel 0xeee…eee; token must collapse to ethAddress, not its checksum.
    const logs: RawLog[] = [
      {
        address: ethAddress,
        topics: [TRANSFER_TOPIC, padAddress(USER), padAddress(VAULT)],
        data: encodeUint256(parseEther("1")),
      },
    ];

    const result = parseTransfers([makeCall(logs)]);

    expect(result).toHaveLength(1);
    expect(result[0]!.token).toBe(ethAddress);
    expect(result[0]).toEqual({
      token: ethAddress,
      from: getAddress(USER),
      to: getAddress(VAULT),
      amount: parseEther("1"),
      txIdx: 0,
    });
  });

  it("returns empty array for empty logs", () => {
    expect(parseTransfers([makeCall([])])).toEqual([]);
  });

  it("skips logs with undefined topic0", () => {
    const logs: RawLog[] = [{ address: USDC, topics: [], data: "0x" as Hex }];
    expect(parseTransfers([makeCall(logs)])).toEqual([]);
  });

  it("skips Transfer logs with wrong number of topics", () => {
    const logs: RawLog[] = [
      {
        address: USDC,
        topics: [TRANSFER_TOPIC, padAddress(USER)], // only 2 topics, need 3
        data: encodeUint256(1000n),
      },
    ];
    expect(parseTransfers([makeCall(logs)])).toEqual([]);
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
    expect(parseTransfers([makeCall(logs)], logger)).toEqual([]);
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
    expect(parseTransfers([makeCall(logs)], logger)).toEqual([]);
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
    expect(parseTransfers([makeCall(logs)], logger)).toEqual([]);
    expect(logger.warn).toHaveBeenCalledOnce();
  });

  it("skips WETH9 Deposit with short topic or bad data", () => {
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const logs: RawLog[] = [
      {
        address: WETH,
        topics: [DEPOSIT_TOPIC, "0x00" as Hex],
        data: encodeUint256(1n),
      },
    ];
    expect(parseTransfers([makeCall(logs)], logger)).toEqual([]);
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

    const result = parseTransfers([makeCall(logs)]);

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

    const result = parseTransfers([makeCall(logs)]);

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

    const result = parseTransfers([makeCall(logs)]);
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

    const result = parseTransfers([makeCall(logs)]);
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

    const result = parseTransfers([makeCall([validLog, malformedLog])], logger);

    expect(result).toHaveLength(1);
    expect(result[0]!.amount).toBe(1000000n);
    expect(logger.warn).toHaveBeenCalledOnce();
  });

  it("warns and skips logs that fail after length validation", () => {
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const logs: RawLog[] = [
      {
        address: "0xnotanaddress" as Address,
        topics: [TRANSFER_TOPIC, padAddress(USER), padAddress(VAULT)],
        data: encodeUint256(1000n),
      },
    ];

    expect(parseTransfers([makeCall(logs)], logger)).toEqual([]);
    expect(logger.warn).toHaveBeenCalledWith(
      "Skipping malformed log during transfer parsing",
      expect.objectContaining({
        address: "0xnotanaddress",
        reason: expect.stringContaining("Address"),
      }),
    );
  });

  it("sorts equal token/from/to transfers by amount", () => {
    const logs: RawLog[] = [
      {
        address: USDC,
        topics: [TRANSFER_TOPIC, padAddress(USER), padAddress(VAULT)],
        data: encodeUint256(2n),
      },
      {
        address: USDC,
        topics: [TRANSFER_TOPIC, padAddress(USER), padAddress(VAULT)],
        data: encodeUint256(1n),
      },
    ];

    const result = parseTransfers([makeCall(logs)]);

    expect(result.map((t) => t.amount)).toEqual([1n, 2n]);
  });

  it("keeps already-sorted equal token/from/to transfers by amount", () => {
    const logs: RawLog[] = [
      {
        address: USDC,
        topics: [TRANSFER_TOPIC, padAddress(USER), padAddress(VAULT)],
        data: encodeUint256(1n),
      },
      {
        address: USDC,
        topics: [TRANSFER_TOPIC, padAddress(USER), padAddress(VAULT)],
        data: encodeUint256(2n),
      },
      {
        address: USDC,
        topics: [TRANSFER_TOPIC, padAddress(USER), padAddress(VAULT)],
        data: encodeUint256(2n),
      },
    ];

    const result = parseTransfers([makeCall(logs)]);

    expect(result.map((t) => t.amount)).toEqual([1n, 2n, 2n]);
  });

  it("sorts equal token transfers by sender and recipient in both directions", () => {
    const HIGHER: Address = "0x3333333333333333333333333333333333333333";
    const logs: RawLog[] = [
      {
        address: USDC,
        topics: [TRANSFER_TOPIC, padAddress(USER), padAddress(VAULT)],
        data: encodeUint256(1n),
      },
      {
        address: USDC,
        topics: [TRANSFER_TOPIC, padAddress(HIGHER), padAddress(USER)],
        data: encodeUint256(1n),
      },
      {
        address: USDC,
        topics: [TRANSFER_TOPIC, padAddress(USER), padAddress(HIGHER)],
        data: encodeUint256(1n),
      },
    ];

    const result = parseTransfers([makeCall(logs)]);

    expect(result.map((t) => [t.from, t.to])).toEqual([
      [getAddress(USER), getAddress(VAULT)],
      [getAddress(USER), getAddress(HIGHER)],
      [getAddress(HIGHER), getAddress(USER)],
    ]);
  });

  test("behavior: stamps txIdx according to originating call index", () => {
    const calls = [
      makeCall([
        {
          address: USDC,
          topics: [TRANSFER_TOPIC, padAddress(USER), padAddress(VAULT)],
          data: encodeUint256(100n),
        },
      ]),
      makeCall([
        {
          address: USDC,
          topics: [TRANSFER_TOPIC, padAddress(VAULT), padAddress(USER)],
          data: encodeUint256(200n),
        },
      ]),
    ];

    const result = parseTransfers(calls);
    const tx0 = result.find((t) => t.amount === 100n);
    const tx1 = result.find((t) => t.amount === 200n);

    expect(tx0?.txIdx).toBe(0);
    expect(tx1?.txIdx).toBe(1);
  });

  test("behavior: WETH9 unwrap dedup is scoped to the same tx (cross-tx not deduped)", () => {
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const amount = 1_000_000_000_000_000_000n;
    // Tx 0 has the Withdrawal; tx 1 has a same-amount Transfer to zero on the
    // same WETH contract. Under the old flat dedup these would have collided;
    // per-tx scoping now keeps both as distinct events. The token is
    // wnative-shaped (it emitted a Withdrawal somewhere in the bundle), so the
    // dedup miss surfaces a warn — giving us observability before
    // assertNoBundlerRetention can false-positive.
    const calls = [
      makeCall([
        {
          address: WETH,
          topics: [WITHDRAWAL_TOPIC, padAddress(USER)],
          data: encodeUint256(amount),
        },
      ]),
      makeCall([
        {
          address: WETH,
          topics: [
            TRANSFER_TOPIC,
            padAddress(USER),
            `0x${"0".repeat(64)}` as Hex,
          ],
          data: encodeUint256(amount),
        },
      ]),
    ];

    const result = parseTransfers(calls, logger);
    expect(result).toHaveLength(2);
    expect(result.map((t) => t.txIdx).sort()).toEqual([0, 1]);
    expect(logger.warn).toHaveBeenCalledOnce();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining("WETH9 dedup miss"),
      expect.objectContaining({ kind: "burn", txIdx: 1 }),
    );
  });

  test("behavior: WETH9 wrap dedup miss across txs warns (split Deposit + mint Transfer)", () => {
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const amount = 1_000_000_000_000_000_000n;
    const calls = [
      makeCall([
        {
          address: WETH,
          topics: [DEPOSIT_TOPIC, padAddress(USER)],
          data: encodeUint256(amount),
        },
      ]),
      makeCall([
        {
          address: WETH,
          topics: [
            TRANSFER_TOPIC,
            `0x${"0".repeat(64)}` as Hex,
            padAddress(USER),
          ],
          data: encodeUint256(amount),
        },
      ]),
    ];

    const result = parseTransfers(calls, logger);
    expect(result).toHaveLength(2);
    expect(logger.warn).toHaveBeenCalledOnce();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining("WETH9 dedup miss"),
      expect.objectContaining({ kind: "mint", txIdx: 1 }),
    );
  });

  test("behavior: zero-address Transfer on non-wnative token does not warn", () => {
    // Plain ERC20 mint — no Deposit/Withdrawal anywhere in the bundle, so
    // USDC is not wnative-shaped and the burn-shaped Transfer is just a
    // legitimate mint. No warning should fire (otherwise we'd spam logs on
    // every real ERC20 mint/burn).
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const logs: RawLog[] = [
      {
        address: USDC,
        topics: [
          TRANSFER_TOPIC,
          `0x${"0".repeat(64)}` as Hex,
          padAddress(USER),
        ],
        data: encodeUint256(1000n),
      },
    ];

    const result = parseTransfers([makeCall(logs)], logger);
    expect(result).toHaveLength(1);
    expect(result[0]!.from).toBe(zeroAddress);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  test("behavior: zero-address burn Transfer on non-wnative token does not warn", () => {
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const logs: RawLog[] = [
      {
        address: USDC,
        topics: [
          TRANSFER_TOPIC,
          padAddress(USER),
          `0x${"0".repeat(64)}` as Hex,
        ],
        data: encodeUint256(1000n),
      },
    ];

    const result = parseTransfers([makeCall(logs)], logger);
    expect(result).toHaveLength(1);
    expect(result[0]!.to).toBe(zeroAddress);
    expect(logger.warn).not.toHaveBeenCalled();
  });
});
