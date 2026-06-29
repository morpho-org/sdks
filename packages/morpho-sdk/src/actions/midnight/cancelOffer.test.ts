import { midnightAbi } from "@morpho-org/midnight-sdk";
import { decodeFunctionData, type Hex } from "viem";
import { describe, expect, test } from "vitest";
import {
  midnightAddresses,
  midnightChainId,
} from "../../../test/fixtures/midnight.js";
import { midnightCancelOffer } from "./cancelOffer.js";

describe("midnightCancelOffer", () => {
  test("default", () => {
    const group =
      "0x1111111111111111111111111111111111111111111111111111111111111111" as Hex;
    const tx = midnightCancelOffer({
      chainId: midnightChainId,
      group,
      onBehalf: midnightAddresses.taker,
    });
    const decoded = decodeFunctionData({ abi: midnightAbi, data: tx.data });

    expect(tx.to).toBe(midnightAddresses.midnight);
    expect(tx.action.args.group).toBe(group);
    expect(decoded.functionName).toBe("setConsumed");
    expect(decoded.args[0]).toBe(group);
  });
});
