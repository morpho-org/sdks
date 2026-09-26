import { type Address, getAddress, zeroAddress } from "viem";
import type { ParsedRequest } from "../../domain/stages.js";
import { parseRequest } from "../request/index.js";

const OWNER: Address = getAddress("0x1111111111111111111111111111111111111111");
const TARGET: Address = getAddress(
  "0x2222222222222222222222222222222222222222",
);

const makeRequest = (count: number): ParsedRequest =>
  parseRequest({
    chainId: 1,
    transactions: Array.from({ length: count }, () => ({
      from: OWNER,
      to: TARGET,
      data: "0x12345678",
    })),
  });

import type {
  DecodedBundle,
  ProbeRead,
  ValidatedAuthorizations,
} from "../../domain/stages.js";
import { brandPinned, brandValidated } from "../../domain/stages.js";
import { planExecution } from "./plan-execution.js";

const TOKEN: Address = getAddress("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48");
const SPENDER: Address = getAddress(
  "0x3333333333333333333333333333333333333333",
);

const NOW = 1_700_000_000n;

const erc20Read: ProbeRead = {
  type: "erc20Allowance",
  token: TOKEN,
  owner: OWNER,
  spender: SPENDER,
};

const validated = (authIndex = 0): ValidatedAuthorizations =>
  brandValidated({
    inputs: brandPinned({
      bundle: {
        request: makeRequest(2),
        owner: OWNER,
        operations: [],
      } as unknown as DecodedBundle,
      context: {
        chainId: 1,
        stateBlockNumber: 24_000_000n,
        stateBlockHash: `0x${"ab".repeat(32)}`,
        stateBlockTimestamp: NOW,
        blockNumber: 24_000_000n,
        blockTimestamp: NOW,
      },
      before: {
        wallet: [],
        permissions: [],
        positions: [],
        vaults: [],
        markets: [],
      },
      internals: { vaultData: new Map() },
    }),
    limits: {
      maxSlippageWad: 0n,
      minLltvBufferWad: 0n,
      maxSignatureLifetimeSeconds: 0n,
      wallet: { maxDebit: [], minCredit: [] },
      operations: [],
    },
    preparations: [
      {
        authorizationIndex: authIndex,
        calls: [{ from: OWNER, to: TOKEN, data: "0x095ea7b3", value: 0n }],
        expected: [
          {
            type: "erc20Allowance",
            token: TOKEN,
            owner: OWNER,
            spender: SPENDER,
            amount: 1n,
          },
        ],
      },
    ],
    matches: [{ authorizationIndex: authIndex, expectedIndex: 0 }],
    expected: [],
  }) as ValidatedAuthorizations;

describe("planExecution", () => {
  test("ordering: before → preparation → prepared → tx → intermediate → tx → after", () => {
    const plan = planExecution(validated(), {
      full: [erc20Read],
      permissions: [erc20Read],
    });
    const kinds = plan.calls.map((c) =>
      c.identity.type === "probe"
        ? `probe:${c.identity.phase}`
        : c.identity.type,
    );
    const firstTx = kinds.indexOf("transaction");
    const secondTx = kinds.indexOf("transaction", firstTx + 1);
    expect(kinds[0]).toBe("probe:before");
    expect(kinds).toContain("authorization");
    expect(kinds.indexOf("authorization")).toBeLessThan(
      kinds.indexOf("probe:prepared"),
    );
    expect(kinds.indexOf("probe:prepared")).toBeLessThan(firstTx);
    expect(kinds.indexOf("probe:intermediate")).toBeGreaterThan(firstTx);
    expect(kinds.indexOf("probe:intermediate")).toBeLessThan(secondTx);
    expect(kinds.lastIndexOf("probe:after")).toBe(plan.calls.length - 1);
    // after phase carries the full read set incl. native
    const afterCount = kinds.filter((k) => k === "probe:after").length;
    expect(afterCount).toBe(2);
  });

  test("no preparation → no prepared-phase probes", () => {
    const v = validated();
    const plan = planExecution(
      brandValidated({ ...v, preparations: [], matches: [] }),
      { full: [erc20Read], permissions: [erc20Read] },
    );
    expect(
      plan.calls.some(
        (c) => c.identity.type === "probe" && c.identity.phase === "prepared",
      ),
    ).toBe(false);
  });

  test("preparation and probe calls never carry a public txIdx", () => {
    const plan = planExecution(validated(), {
      full: [erc20Read],
      permissions: [erc20Read],
    });
    for (const call of plan.calls) {
      if (call.identity.type === "transaction") continue;
      expect("transactionIndex" in call.identity).toBe(false);
    }
  });

  test("preparation calls run from the owner, probes from zeroAddress", () => {
    const plan = planExecution(validated(), {
      full: [],
      permissions: [erc20Read],
    });
    for (const call of plan.calls) {
      if (call.identity.type === "authorization") {
        expect(call.transaction.from).toBe(OWNER);
      }
      if (call.identity.type === "probe") {
        expect(call.transaction.from).toBe(zeroAddress);
      }
    }
  });
});
