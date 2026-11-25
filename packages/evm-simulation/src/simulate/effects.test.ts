import { blueAbi } from "@morpho-org/morpho-sdk/abis";
import { midnightEventsAbi } from "@morpho-org/morpho-sdk/midnight/abis";
import {
  type Address,
  encodeAbiParameters,
  encodeEventTopics,
  erc20Abi,
  ethAddress,
  maxUint128,
  zeroAddress,
  zeroHash,
} from "viem";
import { describe, expect, it } from "vitest";
import { SimulationEffectError } from "../errors.js";
import type { SimulationEffect } from "../limits.js";
import type { RawCall, RawLog } from "../types.js";
import { findApprovalEventFailures } from "./approvals.js";
import { effectApprovals, verifyEffects } from "./effects.js";
import { WITHDRAWAL_TOPIC } from "./parsing/transfers.js";

const owner: Address = "0x0000000000000000000000000000000000000001";
const other: Address = "0x0000000000000000000000000000000000000002";
const token: Address = "0x0000000000000000000000000000000000000003";
const addresses = { morpho: other, midnight: other };
const data = (value: bigint) =>
  encodeAbiParameters([{ type: "uint256" }], [value]);
const approvalLog = (amount: bigint): RawLog => ({
  address: token,
  topics: encodeEventTopics({
    abi: erc20Abi,
    eventName: "Approval",
    args: { owner, spender: other },
  }) as RawLog["topics"],
  data: data(amount),
});
const call = (logs: readonly RawLog[]): RawCall => ({
  logs,
  status: true,
  gasUsed: 0n,
  returnData: "0x",
});
const cases: readonly { effect: SimulationEffect; logs: readonly RawLog[] }[] =
  [
    ...[0n, 123n].map((amount) => ({
      effect: {
        type: "erc20Approval" as const,
        token,
        owner,
        spender: other,
        amount,
      },
      logs: [approvalLog(amount)],
    })),
    ...[false, true].flatMap((isAuthorized) => [
      {
        effect: {
          type: "blueAuthorization" as const,
          authorizer: owner,
          authorized: other,
          isAuthorized,
        },
        logs: [
          {
            address: other,
            topics: encodeEventTopics({
              abi: blueAbi,
              eventName: "SetAuthorization",
              args: { caller: owner, authorizer: owner, authorized: other },
            }) as RawLog["topics"],
            data: encodeAbiParameters([{ type: "bool" }], [isAuthorized]),
          },
        ],
      },
      {
        effect: {
          type: "midnightAuthorization" as const,
          onBehalf: owner,
          authorized: other,
          isAuthorized,
        },
        logs: [
          {
            address: other,
            topics: encodeEventTopics({
              abi: midnightEventsAbi,
              eventName: "SetIsAuthorized",
              args: { caller: owner, onBehalf: owner, authorized: other },
            }) as RawLog["topics"],
            data: encodeAbiParameters([{ type: "bool" }], [isAuthorized]),
          },
        ],
      },
    ]),
    {
      effect: {
        type: "midnightCancelOffers",
        onBehalf: owner,
        groups: [zeroHash],
      },
      logs: [
        {
          address: other,
          topics: encodeEventTopics({
            abi: midnightEventsAbi,
            eventName: "SetConsumed",
            args: { caller: owner, onBehalf: owner, group: zeroHash },
          }) as RawLog["topics"],
          data: data(maxUint128),
        },
      ],
    },
  ];
const verify = (effect: SimulationEffect, logs: readonly RawLog[]) =>
  verifyEffects({
    effects: [effect],
    addresses,
    calls: [call(logs)],
    transactions: [{ from: owner, to: token }],
    transferOptions: { chainId: 1 },
  });
const transfer = (
  amount: bigint,
  {
    from = owner,
    to = other,
    address = token,
  }: { from?: Address; to?: Address; address?: Address } = {},
): RawLog => ({
  address,
  topics: encodeEventTopics({
    abi: erc20Abi,
    eventName: "Transfer",
    args: { from, to },
  }) as RawLog["topics"],
  data: data(amount),
});

describe("transaction-bound control effects", () => {
  it.each(
    cases.filter(({ effect }) =>
      effect.type === "erc20Approval"
        ? effect.amount === 0n
        : "isAuthorized" in effect && !effect.isAuthorized,
    ),
  )(
    "does not allow a grant preceding $effect.type revocation",
    ({ effect, logs }) => {
      const evidence = [
        ...logs.map((log) => ({ ...log, data: data(1n) })),
        ...logs,
      ];
      expect(verify(effect, evidence)).toEqual([]);
      const allowed = effectApprovals([effect], {
        txIdx: 0,
        transactionCount: 1,
      });
      expect(allowed).toEqual([]);
      expect(
        findApprovalEventFailures({
          logs: evidence,
          owner,
          allowed,
          addresses,
        }),
      ).toHaveLength(1);
    },
  );
  it("parses wrapper withdrawals only for the registered wrapper", () => {
    const entry = cases[0]!;
    const withdrawal: RawLog = {
      address: token,
      topics: [
        WITHDRAWAL_TOPIC,
        encodeAbiParameters([{ type: "address" }], [owner]),
      ],
      data: data(1n),
    };
    const params = {
      effects: [entry.effect],
      addresses,
      transactions: [{ from: owner, to: token }],
      calls: [call([...entry.logs, withdrawal])],
    };
    expect(
      verifyEffects({
        ...params,
        transferOptions: {
          chainId: 1,
          wNative: other,
          wNativeEmitsTransfer: false,
          wNativeEmitsWrapEvents: true,
        },
      }),
    ).toEqual([]);
    expect(
      verifyEffects({
        ...params,
        transferOptions: { chainId: 1, wNative: null },
      }),
    ).toEqual([]);
    expect(
      verifyEffects({
        ...params,
        transferOptions: {
          chainId: 1,
          wNative: token,
          wNativeEmitsTransfer: false,
          wNativeEmitsWrapEvents: true,
        },
      })[0],
    ).toBeInstanceOf(SimulationEffectError);
  });
  it.each(cases)(
    "requires the last $effect.type event for each pair to match",
    ({ effect, logs }) => {
      const changedData =
        effect.type === "blueAuthorization" ||
        effect.type === "midnightAuthorization"
          ? encodeAbiParameters([{ type: "bool" }], [!effect.isAuthorized])
          : data(5n);
      const changed = logs.map((log) => ({ ...log, data: changedData }));
      expect(verify(effect, [...logs, ...changed])[0]).toBeInstanceOf(
        SimulationEffectError,
      );
      expect(verify(effect, [...changed, ...logs])).toEqual([]);
      expect(
        verify(effect, [
          ...logs,
          ...changed.map((log) => ({ ...log, address: zeroAddress })),
        ]),
      ).toEqual([]);
    },
  );
  it.each(cases)(
    "accepts exact $effect.type including zero/revocation",
    ({ effect, logs }) => expect(verify(effect, logs)).toEqual([]),
  );
  it.each(cases)(
    "rejects missing or mismatched $effect.type evidence",
    ({ effect, logs }) => {
      for (const evidence of [
        [],
        logs.map((log) => ({ ...log, address: zeroAddress })),
        logs.map((log) => ({ ...log, data: data(5n) })),
        logs.map((log) => ({ ...log, topics: log.topics.slice(0, -1) })),
      ])
        expect(verify(effect, evidence)[0]).toBeInstanceOf(
          SimulationEffectError,
        );
    },
  );
  it("requires every cancellation group at the exact cancellation value", () => {
    const entry = cases[cases.length - 1]!;
    expect(
      verify(
        {
          type: "midnightCancelOffers",
          onBehalf: owner,
          groups: [zeroHash, `0x${"aa".repeat(32)}`],
        },
        entry.logs,
      )[0],
    ).toBeInstanceOf(SimulationEffectError);
    expect(
      verify(
        entry.effect,
        entry.logs.map((log) => ({ ...log, data: data(maxUint128 - 1n) })),
      )[0],
    ).toBeInstanceOf(SimulationEffectError);
  });
  it("binds to the last caller transaction, never satisfying an effect from another call", () => {
    const entry = cases[0]!;
    const params = {
      effects: [entry.effect],
      addresses,
      transactions: [
        { from: owner, to: token },
        { from: owner, to: token },
      ],
      transferOptions: { chainId: 1 },
    };
    expect(
      verifyEffects({ ...params, calls: [call([]), call(entry.logs)] }),
    ).toEqual([]);
    expect(
      verifyEffects({ ...params, calls: [call(entry.logs), call([])] })[0],
    ).toMatchObject({ transactionIndex: 1 });
    expect(
      verifyEffects({
        ...params,
        effects: [{ ...entry.effect, txIdx: 0 }],
        calls: [call(entry.logs), call([])],
      }),
    ).toEqual([]);
  });
  it("blocks positive sender transfers, burns and native transfers even if returned", () => {
    const entry = cases[0]!;
    for (const logs of [
      [transfer(1n)],
      [transfer(1n, { to: zeroAddress })],
      [transfer(1n, { address: ethAddress })],
      [transfer(1n), transfer(1n, { from: other, to: owner })],
    ])
      expect(verify(entry.effect, [...entry.logs, ...logs])[0]).toBeInstanceOf(
        SimulationEffectError,
      );
    expect(
      verify(entry.effect, [
        ...entry.logs,
        transfer(0n),
        transfer(1n, { from: other, to: owner }),
        transfer(1n, { to: owner }),
      ]),
    ).toEqual([]);
  });
  it("does not use another transaction's outflows or sender", () => {
    const entry = cases[0]!;
    expect(
      verifyEffects({
        effects: [entry.effect],
        addresses,
        transactions: [
          { from: owner, to: token },
          { from: owner, to: token },
        ],
        calls: [call([transfer(1n)]), call(entry.logs)],
        transferOptions: { chainId: 1 },
      }),
    ).toEqual([]);
    expect(
      verifyEffects({
        effects: [entry.effect],
        addresses,
        transactions: [{ from: other, to: token }],
        calls: [
          call([...entry.logs, transfer(1n, { from: other, to: owner })]),
        ],
        transferOptions: { chainId: 1 },
      })[0],
    ).toBeInstanceOf(SimulationEffectError);
  });
  it.each([
    { to: other, value: 1n, traced: 0n, fails: true },
    { to: other, value: 1n, traced: 1n, fails: true },
    { to: owner, value: 1n, traced: 0n, fails: true },
    { to: owner, value: 2n, traced: 1n, fails: true },
    { to: owner, value: 1n, traced: 1n, fails: false },
    { to: other, value: 0n, traced: 0n, fails: false },
  ])(
    "checks declared native value and trace coverage: $to / $value / $traced",
    ({ to, value, traced, fails }) => {
      const entry = cases[0]!;
      const failures = verifyEffects({
        effects: [entry.effect],
        addresses,
        transactions: [{ from: owner, to, value }],
        calls: [
          call([
            ...entry.logs,
            transfer(traced, { address: ethAddress, to: owner }),
          ]),
        ],
        transferOptions: { chainId: 1 },
      });
      if (fails) {
        expect(failures).toEqual([expect.any(SimulationEffectError)]);
      } else {
        expect(failures).toEqual([]);
      }
    },
  );
  it("only checks native value on the bound transaction", () => {
    const entry = cases[0]!;
    const params = {
      effects: [entry.effect],
      addresses,
      transactions: [
        { from: owner, to: other, value: 1n },
        { from: owner, to: other },
      ],
      calls: [call(entry.logs), call(entry.logs)],
      transferOptions: { chainId: 1 },
    };
    expect(verifyEffects(params)).toEqual([]);
    expect(
      verifyEffects({ ...params, effects: [{ ...entry.effect, txIdx: 0 }] }),
    ).toEqual([expect.any(SimulationEffectError)]);
    expect(
      verifyEffects({
        ...params,
        transactions: [
          { from: owner, to: owner, value: 1n },
          { from: owner, to: owner, value: 1n },
        ],
        calls: [
          call([
            ...entry.logs,
            transfer(1n, { address: ethAddress, to: owner }),
          ]),
          call(entry.logs),
        ],
      }),
    ).toEqual([expect.any(SimulationEffectError)]);
  });
  it("does not count incoming ETH or ERC20 transfers as native debit coverage", () => {
    const entry = cases[0]!;
    for (const log of [
      transfer(1n, { address: ethAddress, from: other, to: owner }),
      transfer(1n, { to: owner }),
    ]) {
      expect(
        verifyEffects({
          effects: [entry.effect],
          addresses,
          transactions: [{ from: owner, to: owner, value: 1n }],
          calls: [call([...entry.logs, log])],
          transferOptions: { chainId: 1 },
        }),
      ).toEqual([expect.any(SimulationEffectError)]);
    }
  });
  it("fails closed on malformed outgoing transfer evidence", () => {
    const entry = cases[0]!;
    expect(
      verify(entry.effect, [...entry.logs, { ...transfer(1n), data: "0x" }])[0],
    ).toBeInstanceOf(SimulationEffectError);
  });
  it.each(cases)(
    "scopes the implicit permission pair for $effect.type",
    ({ effect }) => {
      expect(
        effectApprovals([effect], { txIdx: 0, transactionCount: 2 }),
      ).toEqual([]);
      expect(
        effectApprovals([effect], { txIdx: -1, transactionCount: 2 }),
      ).toEqual([]);
      expect(
        effectApprovals([effect], { txIdx: 1, transactionCount: 2 }),
      ).toHaveLength(
        effect.type === "erc20Approval"
          ? Number(effect.amount > 0n)
          : "isAuthorized" in effect
            ? Number(effect.isAuthorized)
            : 0,
      );
      expect(
        effectApprovals([{ ...effect, txIdx: 0 }], {
          txIdx: 1,
          transactionCount: 2,
        }),
      ).toEqual([]);
    },
  );
});
