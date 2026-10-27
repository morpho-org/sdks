import { getChainAddress } from "@morpho-org/morpho-ts";
import { type Address, type Client, isAddress, zeroAddress } from "viem";
import { describe, expect, test } from "vitest";
import {
  midnightChainId,
  midnightMarket,
} from "../../test/fixtures/midnight.js";
import { midnightSetIsAuthorized } from "../actions/midnight/authorization.js";
import { midnightRedeem } from "../actions/midnight/redeem.js";
import { midnightSupplyCollateral } from "../actions/midnight/supplyCollateral.js";
import { getMidnightApprovalRequirements } from "../actions/requirements/midnight/getMidnightApprovalRequirements.js";
import { getMidnightAuthorizationRequirement } from "../actions/requirements/midnight/getMidnightAuthorizationRequirement.js";
import { MorphoMidnight } from "../entities/midnight/midnight.js";
import {
  MidnightCalldataEncodingError,
  MidnightZeroAccountError,
  type MorphoClientType,
} from "../types/index.js";
import {
  validateMidnightAccount,
  validateMidnightAddress,
} from "./validateMidnightAccount.js";

const midnightBundlesV2 = getChainAddress(midnightChainId, "midnightBundlesV2");
const usdc = getChainAddress(midnightChainId, "usdc");
// No transport: any RPC read would throw before the zero-account check could.
const viemClient = { chain: { id: midnightChainId } } as unknown as Client;
const midnight = new MorphoMidnight(
  { viemClient, options: {} } as unknown as MorphoClientType,
  midnightChainId,
);
const zeroAccount = { accountAddress: zeroAddress } as never;

const zeroAccountError = (field: string) =>
  expect.objectContaining({ name: "MidnightZeroAccountError", field });
// Zero onBehalf in direct builders and entity supplyCollateral/redeem (ADR-2026-10-14).
const zeroOnBehalfError = expect.objectContaining({
  name: "MidnightZeroOnBehalfError",
  field: "onBehalf",
});

describe("validateMidnightAccount", () => {
  test("default: accepts a non-zero account", () => {
    expect(() =>
      validateMidnightAccount("accountAddress", midnightBundlesV2),
    ).not.toThrow();
  });

  test("error: rejects a mixed-case address with an invalid checksum", () => {
    const valid = "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed" as Address;
    // Built at runtime: the address lint checksums every hex address literal.
    const badChecksum = valid.replace("F3E9", "f3E9") as Address;

    expect(isAddress(valid)).toBe(true);
    expect(isAddress(badChecksum)).toBe(false);
    expect(isAddress(badChecksum, { strict: false })).toBe(true);
    expect(() =>
      validateMidnightAddress("accountAddress", badChecksum),
    ).toThrow(
      expect.objectContaining({
        name: "MidnightCalldataEncodingError",
        input: "accountAddress",
      }),
    );
  });

  test("default: accepts an all-lowercase address", () => {
    const address =
      "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed".toLowerCase() as Address;

    expect(isAddress(address)).toBe(true);
    expect(() =>
      validateMidnightAddress("accountAddress", address),
    ).not.toThrow();
  });

  test("behavior: rejects the zero account", () => {
    expect(() => validateMidnightAccount("owner", zeroAddress)).toThrow(
      new MidnightZeroAccountError("owner"),
    );
  });

  test("error: rejects a malformed account as a typed encoding error", () => {
    const malformed = "0x123" as Address;
    expect(() => validateMidnightAccount("owner", malformed)).toThrow(
      expect.objectContaining({
        name: "MidnightCalldataEncodingError",
        input: "owner",
      }),
    );
    expect(() =>
      midnightSupplyCollateral({
        chainId: midnightChainId,
        market: midnightMarket,
        assets: 1n,
        onBehalf: malformed,
      }),
    ).toThrow(MidnightCalldataEncodingError);
    expect(() =>
      midnight.takeBorrow({ accountAddress: malformed } as never),
    ).toThrow(MidnightCalldataEncodingError);
  });

  test("error: maker methods reject a malformed accountAddress before any read", async () => {
    await expect(
      midnight.makeLend({ accountAddress: "0x123" } as never),
    ).rejects.toThrow(MidnightCalldataEncodingError);
  });

  test.each([
    "takeLend",
    "takeBorrow",
    "takeWithdraw",
    "supplyCollateralTakeBorrow",
    "takeRepayWithdrawCollateral",
    "repayWithdrawCollateral",
  ] as const)(
    "behavior: entity %s rejects a zero accountAddress at creation",
    (method) => {
      expect(() => midnight[method](zeroAccount)).toThrow(
        zeroAccountError("accountAddress"),
      );
    },
  );

  test.each([
    "makeLend",
    "makeBorrow",
    "supplyBlueMakeLend",
    "makeWithdraw",
    "makeRepay",
    "supplyCollateralMakeBorrow",
  ] as const)(
    "behavior: entity %s rejects a zero accountAddress before any read",
    async (method) => {
      await expect(midnight[method](zeroAccount)).rejects.toThrow(
        zeroAccountError("accountAddress"),
      );
    },
  );

  test.each(["supplyCollateral", "redeem"] as const)(
    "error: entity %s rejects a malformed accountAddress as a typed encoding error",
    (method) => {
      expect(() =>
        midnight[method]({ accountAddress: "0x123" } as never),
      ).toThrow(
        expect.objectContaining({
          name: "MidnightCalldataEncodingError",
          input: "accountAddress",
          cause: expect.objectContaining({ name: "InvalidAddressError" }),
        }),
      );
    },
  );

  test("behavior: entity supplyCollateral rejects a zero accountAddress from getRequirements() before any read", async () => {
    const output = midnight.supplyCollateral({
      accountAddress: zeroAddress,
      marketData: {
        chainId: midnightChainId,
        params: midnightMarket,
        getCollateralByIndex: () => ({ token: usdc }),
      },
      collateralAssets: 1n,
    } as never);

    await expect(output.getRequirements()).rejects.toThrow(zeroOnBehalfError);
    expect(() => output.buildTx()).toThrow(zeroOnBehalfError);
  });

  test("behavior: raw builders reject a zero onBehalf", () => {
    expect(() =>
      midnightSupplyCollateral({
        chainId: midnightChainId,
        market: midnightMarket,
        assets: 1n,
        onBehalf: zeroAddress,
      }),
    ).toThrow(zeroOnBehalfError);
    expect(() =>
      midnightRedeem({
        chainId: midnightChainId,
        market: midnightMarket,
        units: 1n,
        onBehalf: zeroAddress,
        receiver: midnightBundlesV2,
      }),
    ).toThrow(zeroOnBehalfError);
    expect(() =>
      midnightSetIsAuthorized({
        chainId: midnightChainId,
        authorized: midnightBundlesV2,
        onBehalf: zeroAddress,
      }),
    ).toThrow(zeroOnBehalfError);
  });

  test("behavior: requirement helpers reject a zero owner before any read", async () => {
    await expect(
      getMidnightAuthorizationRequirement({
        viemClient,
        chainId: midnightChainId,
        owner: zeroAddress,
        authorized: midnightBundlesV2,
      }),
    ).rejects.toThrow(zeroAccountError("owner"));
    await expect(
      getMidnightApprovalRequirements({
        viemClient,
        chainId: midnightChainId,
        token: usdc,
        owner: zeroAddress,
        spender: getChainAddress(midnightChainId, "midnight"),
        amount: 1n,
      }),
    ).rejects.toThrow(zeroAccountError("owner"));
  });

  test("behavior: requirement helpers reject a malformed owner before any read", async () => {
    const malformed = { name: "MidnightCalldataEncodingError", input: "owner" };
    await expect(
      getMidnightAuthorizationRequirement({
        viemClient,
        chainId: midnightChainId,
        owner: "0x123" as Address,
        authorized: midnightBundlesV2,
      }),
    ).rejects.toMatchObject(malformed);
    await expect(
      getMidnightApprovalRequirements({
        viemClient,
        chainId: midnightChainId,
        token: usdc,
        owner: "0x123" as Address,
        spender: getChainAddress(midnightChainId, "midnight"),
        amount: 1n,
      }),
    ).rejects.toMatchObject(malformed);
  });
});
