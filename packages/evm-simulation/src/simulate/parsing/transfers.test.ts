import {
  type Address,
  ethAddress,
  getAddress,
  type Hex,
  parseEther,
  zeroAddress,
} from "viem";
import {
  encodeUint256,
  makeCall,
  padAddress,
} from "../../test-helpers/index.js";
import type { RawLog } from "../../types.js";
import type { SimulationWarning } from "../../warnings.js";
import {
  DEPOSIT_TOPIC,
  parseTransfers as parseRawTransfers,
  TRANSFER_TOPIC,
  WITHDRAWAL_TOPIC,
} from "./transfers.js";

const USDC: Address = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const WETH: Address = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
const DAI: Address = "0x6B175474E89094C44Da98b954EedeAC495271d0F";
const USER: Address = "0x1111111111111111111111111111111111111111";
const VAULT: Address = "0x2222222222222222222222222222222222222222";
const NON_MIRRORING_WARN =
  "kept zero-address wNative Transfer matching a same-call Deposit/Withdrawal; chain is listed as non-mirroring — if this repeats for every wrap/unwrap the wrapper now mirrors and must be removed from the list";

const parseWithOptions = (
  calls: Parameters<typeof parseRawTransfers>[0],
  options: Omit<Parameters<typeof parseRawTransfers>[1], "chainId"> & {
    warnings?: SimulationWarning[];
  } = {},
) => {
  const { warnings, ...metadata } = options;
  const parsed = parseRawTransfers(calls, { chainId: 1, ...metadata });
  warnings?.push(...parsed.warnings);
  return parsed.transfers;
};
const parseTransfers = (
  calls: Parameters<typeof parseRawTransfers>[0],
  warnings?: SimulationWarning[],
) => parseWithOptions(calls, { wNative: WETH, warnings });

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
    const warnings: SimulationWarning[] = [];
    const logs: RawLog[] = [
      {
        address: USDC,
        topics: [TRANSFER_TOPIC, "0x0000000000" as Hex, padAddress(VAULT)],
        data: encodeUint256(1000n),
      },
    ];
    expect(parseTransfers([makeCall(logs)], warnings)).toEqual([]);
    expect(warnings).toHaveLength(1);
  });

  it("skips logs where data is not a 32-byte uint256 word", () => {
    const warnings: SimulationWarning[] = [];
    const logs: RawLog[] = [
      {
        address: USDC,
        topics: [TRANSFER_TOPIC, padAddress(USER), padAddress(VAULT)],
        data: "0x" as Hex, // empty — would throw on BigInt('0x')
      },
    ];
    expect(parseTransfers([makeCall(logs)], warnings)).toEqual([]);
    expect(warnings).toHaveLength(1);
  });

  it("skips WETH9 Withdrawal with short topic or bad data", () => {
    const warnings: SimulationWarning[] = [];
    const logs: RawLog[] = [
      {
        address: WETH,
        topics: [WITHDRAWAL_TOPIC, "0x00" as Hex],
        data: encodeUint256(1n),
      },
    ];
    expect(parseTransfers([makeCall(logs)], warnings)).toEqual([]);
    expect(warnings).toHaveLength(1);
  });

  it("skips WETH9 Deposit with short topic or bad data", () => {
    const warnings: SimulationWarning[] = [];
    const logs: RawLog[] = [
      {
        address: WETH,
        topics: [DEPOSIT_TOPIC, "0x00" as Hex],
        data: encodeUint256(1n),
      },
    ];
    expect(parseTransfers([makeCall(logs)], warnings)).toEqual([]);
    expect(warnings).toHaveLength(1);
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
        address: WETH.toLowerCase() as Address,
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

  it("pairs one unwrap Transfer with one Withdrawal", () => {
    const amount = 1000000000000000000n;
    const warnings: SimulationWarning[] = [];
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

    const result = parseTransfers([makeCall(logs)], warnings);

    expect(result).toHaveLength(2);
    expect(
      result.every(
        ({ from, to, amount: value }) =>
          from === getAddress(USER) && to === zeroAddress && value === amount,
      ),
    ).toBe(true);
    expect(warnings).toEqual([]);
  });

  it("pairs one mint Transfer with one Deposit", () => {
    const amount = 1000000000000000000n;
    const warnings: SimulationWarning[] = [];
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

    const result = parseTransfers([makeCall(logs)], warnings);

    expect(result).toHaveLength(2);
    expect(
      result.every(
        ({ from, to, amount: value }) =>
          from === zeroAddress && to === getAddress(USER) && value === amount,
      ),
    ).toBe(true);
    expect(warnings).toEqual([]);
  });

  it("keeps one independent unwrap Transfer without a registered wNative", () => {
    const amount = 1000000000000000000n;
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

    const result = parseWithOptions([makeCall(logs)]);

    expect(result).toHaveLength(2);
    expect(
      result.every(
        ({ from, to, amount: value }) =>
          from === getAddress(USER) && to === zeroAddress && value === amount,
      ),
    ).toBe(true);
  });

  it.each([
    { kind: "burn", from: USER, to: zeroAddress },
    { kind: "mint", from: zeroAddress, to: USER },
  ])(
    "keeps an unpaired non-mirroring $kind Transfer without logging",
    ({ from, to }) => {
      const amount = 1000000000000000000n;
      const warnings: SimulationWarning[] = [];
      const result = parseWithOptions(
        [
          makeCall([
            {
              address: WETH,
              topics: [TRANSFER_TOPIC, padAddress(from), padAddress(to)],
              data: encodeUint256(amount),
            },
          ]),
        ],
        {
          wNative: WETH,
          wNativeEmitsTransfer: false,
          warnings,
        },
      );

      expect(result).toEqual([
        {
          token: getAddress(WETH),
          from: getAddress(from),
          to: getAddress(to),
          amount,
          txIdx: 0,
        },
      ]);
      expect(warnings).toEqual([]);
    },
  );

  it("keeps zero-address WETH9-shaped unwrap transfers when the wrapper does not mirror", () => {
    const amount = 1000000000000000000n;
    const warnings: SimulationWarning[] = [];
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

    const result = parseWithOptions([makeCall(logs)], {
      wNative: WETH,
      wNativeEmitsTransfer: false,
      warnings,
    });

    expect(result).toEqual([
      {
        token: getAddress(WETH),
        from: getAddress(USER),
        to: zeroAddress,
        amount,
        txIdx: 0,
      },
      {
        token: getAddress(WETH),
        from: getAddress(USER),
        to: zeroAddress,
        amount,
        txIdx: 0,
      },
    ]);
    expect(warnings).toMatchObject([
      {
        code: "WRAPPED_NATIVE_MIRROR_DETECTED",
        severity: "warn",
        chainId: 1,
        message: NON_MIRRORING_WARN,
        token: WETH,
        kind: "burn",
        txIdx: 0,
        data: encodeUint256(amount),
      },
    ]);
    expect(warnings).toHaveLength(1);
  });

  it("keeps zero-address WETH9-shaped deposit transfers when the wrapper does not mirror", () => {
    const amount = 1000000000000000000n;
    const warnings: SimulationWarning[] = [];
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

    const result = parseWithOptions([makeCall(logs)], {
      wNative: WETH,
      wNativeEmitsTransfer: false,
      warnings,
    });

    expect(result).toEqual([
      {
        token: getAddress(WETH),
        from: zeroAddress,
        to: getAddress(USER),
        amount,
        txIdx: 0,
      },
      {
        token: getAddress(WETH),
        from: zeroAddress,
        to: getAddress(USER),
        amount,
        txIdx: 0,
      },
    ]);
    expect(warnings).toMatchObject([
      {
        code: "WRAPPED_NATIVE_MIRROR_DETECTED",
        severity: "warn",
        chainId: 1,
        message: NON_MIRRORING_WARN,
        token: WETH,
        kind: "mint",
        txIdx: 0,
        data: encodeUint256(amount),
      },
    ]);
    expect(warnings).toHaveLength(1);
  });

  test("behavior: matches event signatures and pairs case-insensitively", () => {
    const upper = (hex: Hex): Hex => `0x${hex.slice(2).toUpperCase()}`;
    const amount = parseEther("1");
    const logs: RawLog[] = [
      {
        address: USDC,
        topics: [upper(TRANSFER_TOPIC), padAddress(USER), padAddress(VAULT)],
        data: upper(encodeUint256(1000000n)),
      },
      {
        address: WETH,
        topics: [upper(WITHDRAWAL_TOPIC), upper(padAddress(USER))],
        data: upper(encodeUint256(amount)),
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

    expect(result).toEqual([
      {
        token: getAddress(USDC),
        from: getAddress(USER),
        to: getAddress(VAULT),
        amount: 1000000n,
        txIdx: 0,
      },
      {
        token: getAddress(WETH),
        from: getAddress(USER),
        to: zeroAddress,
        amount,
        txIdx: 0,
      },
    ]);
  });

  test("behavior: ignores WETH9-shaped events from unregistered tokens", () => {
    const logs: RawLog[] = [
      {
        address: DAI,
        topics: [DEPOSIT_TOPIC, padAddress(USER)],
        data: encodeUint256(1_000n),
      },
    ];

    expect(parseWithOptions([makeCall(logs)], { wNative: WETH })).toEqual([]);
  });

  test("behavior: rejects WETH9 events without deduplicating ERC20 transfers on known tokenless chains", () => {
    const amount = 1_000n;
    const mintLog: RawLog = {
      address: DAI,
      topics: [TRANSFER_TOPIC, padAddress(zeroAddress), padAddress(USER)],
      data: encodeUint256(amount),
    };
    const calls = [
      makeCall([
        {
          address: DAI,
          topics: [DEPOSIT_TOPIC, padAddress(USER)],
          data: encodeUint256(amount),
        },
        mintLog,
        mintLog,
      ]),
    ];

    expect(parseWithOptions(calls, { wNative: null })).toEqual([
      {
        token: DAI,
        from: zeroAddress,
        to: USER,
        amount,
        txIdx: 0,
      },
      {
        token: DAI,
        from: zeroAddress,
        to: USER,
        amount,
        txIdx: 0,
      },
    ]);
  });

  test("behavior: keeps signature-based parsing without registry metadata", () => {
    const logs: RawLog[] = [
      {
        address: DAI,
        topics: [DEPOSIT_TOPIC, padAddress(USER)],
        data: encodeUint256(1_000n),
      },
    ];

    expect(parseWithOptions([makeCall(logs)])).toEqual([
      {
        token: DAI,
        from: zeroAddress,
        to: USER,
        amount: 1_000n,
        txIdx: 0,
      },
    ]);
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
    const warnings: SimulationWarning[] = [];

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

    const result = parseTransfers(
      [makeCall([validLog, malformedLog])],
      warnings,
    );

    expect(result).toHaveLength(1);
    expect(result[0]!.amount).toBe(1000000n);
    expect(warnings).toHaveLength(1);
  });

  it.each([1, 2, 4, 5])(
    "warns on a Transfer with %i topics and non-empty data without discarding valid transfers",
    (topicCount) => {
      const warnings: SimulationWarning[] = [];
      const validLog: RawLog = {
        address: USDC,
        topics: [TRANSFER_TOPIC, padAddress(USER), padAddress(VAULT)],
        data: encodeUint256(1n),
      };
      const malformedLog = {
        ...validLog,
        topics: [
          ...validLog.topics,
          encodeUint256(1n),
          encodeUint256(2n),
        ].slice(0, topicCount),
      };
      const transfers = parseTransfers(
        [makeCall([malformedLog, validLog])],
        warnings,
      );
      expect(transfers).toHaveLength(1);
      expect(transfers[0]!.amount).toBe(1n);
      expect(warnings).toMatchObject([
        {
          code: "MALFORMED_TRANSFER_LOG",
          severity: "warn",
          chainId: 1,
          address: USDC,
          topics: malformedLog.topics,
          reason: "ERC20 Transfer: bad topic/data length",
        },
      ]);
    },
  );

  it.each(["omitted", "undefined", "empty"])(
    "distinguishes four-topic Transfer data that is %s from explicit ERC-721 data",
    (dataKind) => {
      const warnings: SimulationWarning[] = [];
      const data = dataKind === "empty" ? "0x" : undefined;
      const log = {
        address: USDC,
        topics: [
          TRANSFER_TOPIC,
          padAddress(USER),
          padAddress(VAULT),
          encodeUint256(1n),
        ],
        ...(dataKind === "omitted" ? {} : { data }),
      } as RawLog;
      expect(parseTransfers([makeCall([log])], warnings)).toEqual([]);
      if (dataKind === "empty") expect(warnings).toEqual([]);
      else
        expect(warnings).toMatchObject([
          { code: "MALFORMED_TRANSFER_LOG", chainId: 1, txIdx: 0 },
        ]);
    },
  );

  it("warns and skips logs that fail after length validation", () => {
    const warnings: SimulationWarning[] = [];
    const logs: RawLog[] = [
      {
        address: "0xnotanaddress" as Address,
        topics: [TRANSFER_TOPIC, padAddress(USER), padAddress(VAULT)],
        data: encodeUint256(1000n),
      },
    ];

    expect(parseTransfers([makeCall(logs)], warnings)).toEqual([]);
    expect(warnings).toMatchObject([
      {
        code: "MALFORMED_TRANSFER_LOG",
        severity: "warn",
        chainId: 1,
        txIdx: 0,
        address: "0xnotanaddress",
        reason: expect.stringContaining("Address"),
      },
    ]);
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
    const warnings: SimulationWarning[] = [];
    const amount = 1_000_000_000_000_000_000n;
    // Tx 0 has the Withdrawal; tx 1 has a same-amount Transfer to zero on the
    // same WETH contract. Under the old flat dedup these would have collided;
    // per-tx scoping now keeps both as distinct events. The token is
    // wnative-shaped (it emitted a Withdrawal somewhere in the bundle), so the
    // dedup miss surfaces a warn — giving us observability before
    // assertNoBundlesRetention can false-positive.
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

    const result = parseTransfers(calls, warnings);
    expect(result).toHaveLength(2);
    expect(result.map((t) => t.txIdx).sort()).toEqual([0, 1]);
    expect(warnings).toHaveLength(1);
    expect(warnings).toMatchObject([
      {
        code: "WRAPPED_NATIVE_DEDUP_MISS",
        severity: "warn",
        chainId: 1,
        kind: "burn",
        txIdx: 1,
      },
    ]);
  });

  test("behavior: WETH9 wrap dedup miss across txs warns (split Deposit + mint Transfer)", () => {
    const warnings: SimulationWarning[] = [];
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

    const result = parseTransfers(calls, warnings);
    expect(result).toHaveLength(2);
    expect(warnings).toHaveLength(1);
    expect(warnings).toMatchObject([
      {
        code: "WRAPPED_NATIVE_DEDUP_MISS",
        severity: "warn",
        chainId: 1,
        kind: "mint",
        txIdx: 1,
      },
    ]);
  });

  test("behavior: zero-address Transfer on non-wnative token does not warn", () => {
    // Plain ERC20 mint — no Deposit/Withdrawal anywhere in the bundle, so
    // USDC is not wnative-shaped and the burn-shaped Transfer is just a
    // legitimate mint. No warning should fire (otherwise we'd spam logs on
    // every real ERC20 mint/burn).
    const warnings: SimulationWarning[] = [];
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

    const result = parseTransfers([makeCall(logs)], warnings);
    expect(result).toHaveLength(1);
    expect(result[0]!.from).toBe(zeroAddress);
    expect(warnings).toEqual([]);
  });

  test("behavior: zero-address burn Transfer on non-wnative token does not warn", () => {
    const warnings: SimulationWarning[] = [];
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

    const result = parseTransfers([makeCall(logs)], warnings);
    expect(result).toHaveLength(1);
    expect(result[0]!.to).toBe(zeroAddress);
    expect(warnings).toEqual([]);
  });
});
