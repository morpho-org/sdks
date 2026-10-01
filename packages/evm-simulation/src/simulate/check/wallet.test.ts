import { type Address, ethAddress, getAddress } from "viem";
import { describe, expect, test } from "vitest";
import type { DecodedOperation } from "../../decode/operation.js";
import {
  AssetChangeMismatchError,
  UnsupportedChainError,
} from "../../errors.js";
import {
  emptyDiff,
  makeCheckContext,
  TEST_OWNER,
} from "../../test-helpers/index.js";
import { checkWallet } from "./wallet.js";

const TOKEN: Address = getAddress("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48");

const erc20FundingOp = {
  type: "blueSupply",
  route: "blueBundlesV1",
  transactionIndex: 0,
  funding: { type: "erc20", token: TOKEN, assets: 100n },
} as unknown as DecodedOperation;

const diff = (
  balances: { account: Address; token: Address; assets: bigint }[],
) => ({
  ...emptyDiff,
  balances,
});

describe("checkWallet", () => {
  test("owner debit matches the decoded funding", () => {
    expect(() =>
      checkWallet({
        ctx: makeCheckContext(),
        operations: [erc20FundingOp],
        actionDiff: diff([
          { account: TEST_OWNER, token: TOKEN, assets: -100n },
        ]),
        transfers: [],
      }),
    ).not.toThrow();
  });

  test("error: mismatched owner debit", () => {
    expect(() =>
      checkWallet({
        ctx: makeCheckContext(),
        operations: [erc20FundingOp],
        actionDiff: diff([{ account: TEST_OWNER, token: TOKEN, assets: -50n }]),
        transfers: [],
      }),
    ).toThrow(AssetChangeMismatchError);
  });

  test("error: expected debit not observed", () => {
    expect(() =>
      checkWallet({
        ctx: makeCheckContext(),
        operations: [erc20FundingOp],
        actionDiff: { ...emptyDiff },
        transfers: [],
      }),
    ).toThrow(AssetChangeMismatchError);
  });

  test("error: unexplained balance change on an unknown account", () => {
    const stranger = getAddress("0x9999999999999999999999999999999999999999");
    expect(() =>
      checkWallet({
        ctx: makeCheckContext(),
        operations: [],
        actionDiff: diff([{ account: stranger, token: TOKEN, assets: 5n }]),
        transfers: [],
      }),
    ).toThrow(AssetChangeMismatchError);
  });

  test("error: unsupported chain", () => {
    expect(() =>
      checkWallet({
        ctx: makeCheckContext({ chainId: 999_999_999 }),
        operations: [],
        actionDiff: { ...emptyDiff },
        transfers: [],
      }),
    ).toThrow(UnsupportedChainError);
  });

  test("native funding debits the owner's eth balance", () => {
    const nativeOp = {
      type: "blueSupply",
      route: "blueBundlesV1",
      transactionIndex: 0,
      funding: { type: "native", wrappedToken: TOKEN, assets: 7n },
    } as unknown as DecodedOperation;
    expect(() =>
      checkWallet({
        ctx: makeCheckContext(),
        operations: [nativeOp],
        actionDiff: diff([
          { account: TEST_OWNER, token: ethAddress, assets: -7n },
        ]),
        transfers: [],
      }),
    ).not.toThrow();
  });
});
