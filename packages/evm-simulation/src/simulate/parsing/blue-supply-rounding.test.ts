import type { MarketId } from "@morpho-org/blue-sdk";
import { blueAbi } from "@morpho-org/morpho-sdk/abis";
import {
  type Address,
  encodeAbiParameters,
  encodeEventTopics,
  type Hex,
} from "viem";
import { describe, expect, test } from "vitest";
import { InvalidSimulationResponseError } from "../../errors.js";
import type { RawLog } from "../../types.js";
import { countPrecedingBlueSupplies } from "./blue-supply-rounding.js";

const morpho: Address = "0x0000000000000000000000000000000000000001";
const account: Address = "0x0000000000000000000000000000000000000002";
const marketId = `0x${"11".repeat(32)}` as MarketId;

function supplyLog(id: string, onBehalf = account): RawLog {
  return {
    address: morpho,
    topics: encodeEventTopics({
      abi: blueAbi,
      eventName: "Supply",
      args: { id: id as `0x${string}`, caller: account, onBehalf },
    }).filter((topic): topic is Hex => typeof topic === "string"),
    data: encodeAbiParameters(
      [{ type: "uint256" }, { type: "uint256" }],
      [100n, 90n],
    ),
  };
}

function withdrawLog(id: string, onBehalf = account): RawLog {
  return {
    address: morpho,
    topics: encodeEventTopics({
      abi: blueAbi,
      eventName: "Withdraw",
      args: { id: id as `0x${string}`, onBehalf, receiver: account },
    }).filter((topic): topic is Hex => typeof topic === "string"),
    data: encodeAbiParameters(
      [{ type: "address" }, { type: "uint256" }, { type: "uint256" }],
      [account, 100n, 90n],
    ),
  };
}

describe("countPrecedingBlueSupplies", () => {
  test("empty logs grant no rounding allowance", () => {
    expect(
      countPrecedingBlueSupplies({ logs: [], morpho, marketId, account }),
    ).toBe(0n);
  });
  test("counts every earlier subject-market supply and stops at the withdrawal", () => {
    expect(
      countPrecedingBlueSupplies({
        logs: [
          [supplyLog(marketId), supplyLog(marketId)],
          [withdrawLog(marketId), supplyLog(marketId)],
        ],
        morpho,
        marketId,
        account,
      }),
    ).toBe(2n);
  });

  test("does not grant rounding allowance without the subject withdrawal", () => {
    expect(
      countPrecedingBlueSupplies({
        logs: [[supplyLog(marketId)]],
        morpho,
        marketId,
        account,
      }),
    ).toBe(0n);
  });

  test("filters emitters and markets and waits for the subject account", () => {
    expect(
      countPrecedingBlueSupplies({
        logs: [
          [
            { ...supplyLog(marketId), address: account },
            supplyLog(`0x${"22".repeat(32)}`),
            supplyLog(marketId, morpho),
            withdrawLog(marketId, morpho),
            supplyLog(marketId),
            withdrawLog(marketId),
          ],
        ],
        morpho,
        marketId,
        account,
      }),
    ).toBe(2n);
  });

  test("malformed Blue supply events fail with a typed error", () => {
    expect(() =>
      countPrecedingBlueSupplies({
        logs: [[{ ...supplyLog(marketId), data: "0x" }]],
        morpho,
        marketId,
        account,
      }),
    ).toThrow(InvalidSimulationResponseError);
  });
});
