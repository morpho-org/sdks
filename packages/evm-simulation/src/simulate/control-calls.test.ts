import {
  midnightCancelOffers,
  midnightSetIsAuthorized,
} from "@morpho-org/morpho-sdk";
import { blueAbi, midnightAbi } from "@morpho-org/morpho-sdk/abis";
import { getChainAddress } from "@morpho-org/morpho-ts";
import {
  type Address,
  concat,
  encodeFunctionData,
  erc20Abi,
  type Hex,
  maxUint128,
  zeroHash,
} from "viem";
import { describe, expect, it } from "vitest";
import { SimulationEffectError } from "../errors.js";
import type { SimulationEffect } from "../limits.js";
import type { SimulationTransaction } from "../types.js";
import { verifyControlCalls } from "./control-calls.js";

const owner: Address = "0x0000000000000000000000000000000000000001";
const other: Address = "0x0000000000000000000000000000000000000002";
const token: Address = "0x0000000000000000000000000000000000000003";
const addresses = {
  morpho: getChainAddress(1, "blue"),
  midnight: getChainAddress(1, "midnight"),
};
const group2 = `0x${"01".repeat(32)}` as Hex;
const uppercase = (data: Hex): Hex =>
  data.replace(/[a-f]/g, (char) => char.toUpperCase()) as Hex;
const approval = (amount: bigint): SimulationTransaction => ({
  from: owner,
  to: token,
  data: encodeFunctionData({
    abi: erc20Abi,
    functionName: "approve",
    args: [other, amount],
  }),
});
const approvalEffect = (amount: bigint): SimulationEffect => ({
  type: "erc20Approval",
  token,
  owner,
  spender: other,
  amount,
});
const cancelEffect: SimulationEffect = {
  type: "midnightCancelOffers",
  onBehalf: owner,
  groups: [zeroHash, group2],
};
const cancel = (group: Hex) =>
  encodeFunctionData({
    abi: midnightAbi,
    functionName: "setConsumed",
    args: [group, maxUint128, owner],
  });
const multicall = (calls: readonly Hex[]): SimulationTransaction => ({
  from: owner,
  to: addresses.midnight,
  data: encodeFunctionData({
    abi: midnightAbi,
    functionName: "multicall",
    args: [calls],
  }),
});
const check = (
  transaction: SimulationTransaction,
  effects: readonly SimulationEffect[],
) => verifyControlCalls({ transactions: [transaction], effects, addresses });

describe("verifyControlCalls", () => {
  it.each([0n, 1n])("accepts exact approvals including zero: %s", (amount) => {
    expect(check(approval(amount), [approvalEffect(amount)])).toEqual([]);
    expect(
      check({ ...approval(amount), data: uppercase(approval(amount).data) }, [
        approvalEffect(amount),
      ]),
    ).toEqual([]);
    expect(
      check(
        {
          ...approval(amount),
          data: concat([approval(amount).data, "0x12345678"]),
        },
        [approvalEffect(amount)],
      ),
    ).toEqual([]);
  });
  it.each([false, true])(
    "accepts direct and signed Blue authorization: %s",
    (isAuthorized) => {
      const effect: SimulationEffect = {
        type: "blueAuthorization",
        authorizer: owner,
        authorized: other,
        isAuthorized,
      };
      const direct: SimulationTransaction = {
        from: owner,
        to: addresses.morpho,
        data: encodeFunctionData({
          abi: blueAbi,
          functionName: "setAuthorization",
          args: [other, isAuthorized],
        }),
      };
      expect(check(direct, [effect])).toEqual([]);
      expect(
        check({ ...direct, data: uppercase(direct.data) }, [effect]),
      ).toEqual([]);
      expect(check({ ...direct, from: other }, [effect])[0]).toBeInstanceOf(
        SimulationEffectError,
      );
      const signed = {
        ...direct,
        from: other,
        data: encodeFunctionData({
          abi: blueAbi,
          functionName: "setAuthorizationWithSig",
          args: [
            {
              authorizer: owner,
              authorized: other,
              isAuthorized,
              nonce: 0n,
              deadline: 1n,
            },
            { v: 27, r: zeroHash, s: zeroHash },
          ],
        }),
      };
      expect(check(signed, [effect])).toEqual([]);
      expect(
        check({ ...signed, data: uppercase(signed.data) }, [effect]),
      ).toEqual([]);
      expect(
        check(signed, [{ ...effect, isAuthorized: !isAuthorized }])[0],
      ).toBeInstanceOf(SimulationEffectError);
    },
  );
  it.each([false, true])(
    "accepts SDK Midnight authorization encoding: %s",
    (isAuthorized) => {
      const authorized = getChainAddress(1, "midnightBundlesV2");
      const tx = midnightSetIsAuthorized({
        chainId: 1,
        onBehalf: owner,
        authorized,
        isAuthorized,
        metadata: { origin: "0x12345678" },
      });
      const effect: SimulationEffect = {
        type: "midnightAuthorization",
        onBehalf: owner,
        authorized,
        isAuthorized,
      };
      expect(check({ ...tx, from: owner }, [effect])).toEqual([]);
      expect(
        check({ ...tx, from: owner, data: uppercase(tx.data) }, [effect]),
      ).toEqual([]);
      expect(
        check({ ...tx, from: owner }, [{ ...effect, authorized: other }])[0],
      ).toBeInstanceOf(SimulationEffectError);
    },
  );
  it.each([[zeroHash], [zeroHash, group2]])(
    "accepts SDK bare and multicall cancellations: %s",
    (...groups) => {
      const tx = midnightCancelOffers({ chainId: 1, onBehalf: owner, groups });
      expect(
        check({ ...tx, from: owner }, [{ ...cancelEffect, groups }]),
      ).toEqual([]);
      expect(
        check({ ...tx, from: owner, data: uppercase(tx.data) }, [
          { ...cancelEffect, groups },
        ]),
      ).toEqual([]);
    },
  );
  it("accepts uppercase Midnight subcalls with a lowercase multicall selector", () => {
    expect(
      check(
        multicall([uppercase(cancel(zeroHash)), uppercase(cancel(group2))]),
        [cancelEffect],
      ),
    ).toEqual([]);
  });
  it("rejects collateral withdrawal in the same or an unbound caller transaction", () => {
    const withdraw = encodeFunctionData({
      abi: midnightAbi,
      functionName: "withdrawCollateral",
      args: [
        {
          chainId: 1n,
          midnight: addresses.midnight,
          loanToken: token,
          collateralParams: [],
          maturity: 1n,
          rcfThreshold: 0n,
          enterGate: other,
          liquidatorGate: other,
        },
        0n,
        1n,
        owner,
        other,
      ],
    });
    expect(
      check(multicall([cancel(zeroHash), cancel(group2)]), [cancelEffect]),
    ).toEqual([]);
    for (const unboundIndex of [0, 1]) {
      const bound = multicall([cancel(zeroHash), cancel(group2)]);
      const unbound = multicall([withdraw]);
      const failures = verifyControlCalls({
        transactions: unboundIndex === 0 ? [unbound, bound] : [bound, unbound],
        effects: [
          unboundIndex === 0 ? cancelEffect : { ...cancelEffect, txIdx: 0 },
        ],
        addresses,
      });
      expect(failures).toHaveLength(1);
      expect(failures[0]).toBeInstanceOf(SimulationEffectError);
      expect(failures[0]?.transactionIndex).toBe(unboundIndex);
      expect(failures[0]?.effectType).toBe("unboundTransaction");
    }
    for (const calls of [
      [cancel(zeroHash), withdraw, cancel(group2)],
      [withdraw, cancel(zeroHash)],
      [cancel(zeroHash), "0x" as Hex],
      [],
      [cancel(zeroHash), cancel(`0x${"02".repeat(32)}` as Hex)],
    ]) {
      expect(check(multicall(calls), [cancelEffect])[0]).toBeInstanceOf(
        SimulationEffectError,
      );
    }
  });
  it("rejects wrong contracts, selectors, arguments, malformed data and native value", () => {
    const tx = approval(1n);
    for (const changed of [
      { ...tx, to: other },
      { ...tx, from: other },
      { ...tx, value: 1n },
      { ...tx, data: "0x" as Hex },
      { ...tx, data: "0x095ea7b3" as Hex },
      {
        ...tx,
        data: encodeFunctionData({
          abi: erc20Abi,
          functionName: "transfer",
          args: [other, 1n],
        }),
      },
      approval(2n),
    ]) {
      expect(check(changed, [approvalEffect(1n)])[0]).toBeInstanceOf(
        SimulationEffectError,
      );
    }
  });
  it("binds each permitted control call to its own caller transaction", () => {
    expect(
      verifyControlCalls({
        transactions: [approval(1n), approval(0n)],
        effects: [{ ...approvalEffect(1n), txIdx: 0 }, approvalEffect(0n)],
        addresses,
      }),
    ).toEqual([]);
    expect(
      verifyControlCalls({
        transactions: [approval(1n), approval(0n)],
        effects: [approvalEffect(1n)],
        addresses,
      })[0],
    ).toBeInstanceOf(SimulationEffectError);
    expect(
      verifyControlCalls({ transactions: [], effects: [], addresses }),
    ).toEqual([]);
    expect(
      verifyControlCalls({
        transactions: [],
        effects: [approvalEffect(1n)],
        addresses,
      })[0],
    ).toBeInstanceOf(SimulationEffectError);
  });
});
