import { ChainId, getChainAddress } from "@morpho-org/morpho-ts";
import { mainnet } from "viem/chains";
import { describe, expect, test } from "vitest";
import {
  ApprovalAmountLessThanSpendAmountError,
  UnsupportedErc20ApprovalSpenderError,
} from "../../types/index.js";
import { getRequirementsApproval } from "./getRequirementsApproval.js";

const usdc = getChainAddress(ChainId.EthMainnet, "usdc");
const lowercaseUsdt = "0xdAC17F958D2ee523a2206206994597C13D831ec7";
const generalAdapter1 = getChainAddress(
  ChainId.EthMainnet,
  "bundler3.generalAdapter1",
);

describe("getRequirementsApproval", () => {
  test("default", () => {
    const requirements = getRequirementsApproval({
      address: usdc,
      chainId: mainnet.id,
      args: {
        spendAmount: 1_000n,
        approvalAmount: 1_000n,
        spender: generalAdapter1,
      },
      allowances: 0n,
    });

    expect(requirements).toHaveLength(1);
    expect(requirements[0]?.action.args.amount).toBe(1_000n);
  });

  test("behavior: returns no approval when allowance already covers spend", () => {
    expect(
      getRequirementsApproval({
        address: usdc,
        chainId: mainnet.id,
        args: {
          spendAmount: 1_000n,
          approvalAmount: 1_000n,
          spender: generalAdapter1,
        },
        allowances: 1_000n,
      }),
    ).toEqual([]);
  });

  test("behavior: resets approve-only-once token before approving", () => {
    const requirements = getRequirementsApproval({
      address: lowercaseUsdt,
      chainId: mainnet.id,
      args: {
        spendAmount: 1_000n,
        approvalAmount: 2_000n,
        spender: generalAdapter1,
      },
      allowances: 1n,
    });

    expect(
      requirements.map((requirement) => requirement.action.args.amount),
    ).toEqual([0n, 2_000n]);
  });

  test("error: ApprovalAmountLessThanSpendAmountError", () => {
    expect(() =>
      getRequirementsApproval({
        address: usdc,
        chainId: mainnet.id,
        args: {
          spendAmount: 1_000n,
          approvalAmount: 999n,
          spender: generalAdapter1,
        },
        allowances: 0n,
      }),
    ).toThrow(ApprovalAmountLessThanSpendAmountError);
  });

  test("error: UnsupportedErc20ApprovalSpenderError", () => {
    expect(() =>
      getRequirementsApproval({
        address: usdc,
        chainId: mainnet.id,
        args: {
          spendAmount: 1_000n,
          approvalAmount: 1_000n,
          spender: "0x0000000000000000000000000000000000000001",
        },
        allowances: 0n,
      }),
    ).toThrow(UnsupportedErc20ApprovalSpenderError);
  });
});
