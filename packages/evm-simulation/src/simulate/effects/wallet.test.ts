import { getChainAddresses } from "@morpho-org/morpho-sdk/addresses";
import { type Address, ethAddress, getAddress } from "viem";
import { describe, expect, test } from "vitest";
import type { VerificationDiff } from "../../domain/evidence.js";
import type { DecodedOperation } from "../../domain/operations.js";
import type { DecodedBundle } from "../../domain/stages.js";
import {
  AssetChangeMismatchError,
  SlippageLimitExceededError,
} from "../../errors.js";
import type { Transfer } from "../../types.js";
import { verifyWallet } from "./wallet.js";

const addresses = getChainAddresses(1);
const OWNER: Address = getAddress("0x1111111111111111111111111111111111111111");
const RECEIVER: Address = getAddress(
  "0x7777777777777777777777777777777777777777",
);
const THIRD_PARTY: Address = getAddress(
  "0x8888888888888888888888888888888888888888",
);
const TOKEN: Address = getAddress("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48");
const BUNDLE = addresses.bundles!.vaultBundlesV1!;

const depositOp = (): DecodedOperation =>
  ({
    type: "vaultV1Deposit",
    transactionIndex: 0,
    callPath: [],
    chainId: 1,
    deployment: BUNDLE,
    owner: OWNER,
    route: "vaultBundlesV1",
    vault: getAddress("0x2222222222222222222222222222222222222222"),
    asset: TOKEN,
    receiver: RECEIVER,
    deadline: 0n,
    referralFee: { rateWad: 0n, recipient: OWNER },
    tokenSignature: { type: "none" },
    maxSharePriceE27: 0n,
    funding: { type: "erc20", token: TOKEN, assets: 1_000_000n },
  }) as unknown as DecodedOperation;

const bundle = (operations: readonly DecodedOperation[]): DecodedBundle =>
  ({
    request: {
      chainId: 1,
      mode: "preview",
      authorizations: [],
    },
    owner: OWNER,
    operations,
  }) as unknown as DecodedBundle;

const emptyDiff = (): VerificationDiff => ({
  wallet: [],
  permissions: [],
  positions: [],
  vaults: [],
  markets: [],
});

const transfers: readonly Transfer[] = [];

describe("verifyWallet", () => {
  test("owner debit matching funding is accepted", () => {
    const actionDiff = {
      ...emptyDiff(),
      wallet: [{ account: OWNER, token: TOKEN, assets: -1_000_000n }],
    };
    const result = verifyWallet({
      bundle: bundle([depositOp()]),
      totalDiff: emptyDiff(),
      actionDiff,
      transfers,
    });
    expect(result.retention).toBe("passed");
  });

  test("error: AssetChangeMismatchError on short owner debit", () => {
    const actionDiff = {
      ...emptyDiff(),
      wallet: [{ account: OWNER, token: TOKEN, assets: -900_000n }],
    };
    expect(() =>
      verifyWallet({
        bundle: bundle([depositOp()]),
        totalDiff: emptyDiff(),
        actionDiff,
        transfers,
      }),
    ).toThrow(AssetChangeMismatchError);
  });

  test("error: AssetChangeMismatchError on missing owner debit", () => {
    expect(() =>
      verifyWallet({
        bundle: bundle([depositOp()]),
        totalDiff: emptyDiff(),
        actionDiff: emptyDiff(),
        transfers,
      }),
    ).toThrow(AssetChangeMismatchError);
  });

  test("error: AssetChangeMismatchError on unexplained third-party change", () => {
    const actionDiff = {
      ...emptyDiff(),
      wallet: [
        { account: OWNER, token: TOKEN, assets: -1_000_000n },
        { account: THIRD_PARTY, token: TOKEN, assets: 500n },
      ],
    };
    expect(() =>
      verifyWallet({
        bundle: bundle([depositOp()]),
        totalDiff: emptyDiff(),
        actionDiff,
        transfers,
      }),
    ).toThrow(AssetChangeMismatchError);
  });

  test("receiver credit above minimum is accepted", () => {
    const withdrawOp = {
      ...depositOp(),
      type: "vaultV1Withdraw" as const,
      assets: 800_000n,
      funding: undefined,
    } as unknown as DecodedOperation;
    const actionDiff = {
      ...emptyDiff(),
      wallet: [{ account: RECEIVER, token: TOKEN, assets: 820_000n }],
    };
    const result = verifyWallet({
      bundle: bundle([withdrawOp]),
      totalDiff: emptyDiff(),
      actionDiff,
      transfers,
    });
    expect(result.retention).toBe("passed");
  });

  test("error: SlippageLimitExceededError on under-credit", () => {
    const withdrawOp = {
      ...depositOp(),
      type: "vaultV1Withdraw" as const,
      assets: 800_000n,
      funding: undefined,
    } as unknown as DecodedOperation;
    const actionDiff = {
      ...emptyDiff(),
      wallet: [{ account: RECEIVER, token: TOKEN, assets: 700_000n }],
    };
    expect(() =>
      verifyWallet({
        bundle: bundle([withdrawOp]),
        totalDiff: emptyDiff(),
        actionDiff,
        transfers,
      }),
    ).toThrow(SlippageLimitExceededError);
  });

  test("native funding debit tracked via ethAddress", () => {
    const nativeOp = {
      ...depositOp(),
      funding: {
        type: "native" as const,
        wrappedToken: addresses.wNative,
        assets: 10n ** 17n,
      },
    } as unknown as DecodedOperation;
    const actionDiff = {
      ...emptyDiff(),
      wallet: [{ account: OWNER, token: ethAddress, assets: -(10n ** 17n) }],
    };
    const result = verifyWallet({
      bundle: bundle([nativeOp]),
      totalDiff: emptyDiff(),
      actionDiff,
      transfers,
    });
    expect(result.retention).toBe("passed");
  });
});
