import { Token } from "@morpho-org/blue-sdk";
import { getPermitTypedData } from "@morpho-org/blue-sdk-viem";
import { getChainAddress } from "@morpho-org/morpho-ts";
import { type Address, zeroAddress } from "viem";
import { expect, test } from "vitest";
import { TransactionPlanSignatureMismatchError } from "./error.js";
import { validateVaultPermitRequest } from "./permit.js";
import type { Action, SignatureRequest } from "./types.js";

const account = "0x0000000000000000000000000000000000000001";
const vault = "0x0000000000000000000000000000000000000002";
const asset = "0x0000000000000000000000000000000000000003";
const inputs = {
  chainId: 1,
  account,
  vault,
  deadline: 2_000_000_000n,
  referralFeePct: 0n,
  referralFeeRecipient: zeroAddress,
} as const;
const signatureRequestIds = { tokenPermit: "permit" };
const actions = [
  {
    type: "vaultV2Deposit",
    inputs: { ...inputs, asset, assets: 10n, maxSharePrice: 10n ** 27n },
    signatureRequestIds,
  },
  {
    type: "vaultV1Deposit",
    inputs: { ...inputs, asset, assets: 10n, maxSharePrice: 10n ** 27n },
    signatureRequestIds,
  },
  {
    type: "vaultV2Withdraw",
    inputs: { ...inputs, assets: 10n, requiredShareAllowance: 10n },
    signatureRequestIds,
  },
  {
    type: "vaultV2Redeem",
    inputs: { ...inputs, shares: 10n },
    signatureRequestIds,
  },
  {
    type: "vaultV1Redeem",
    inputs: { ...inputs, shares: 10n },
    signatureRequestIds,
  },
] as const satisfies readonly Action[];

test.each(actions)(
  "validates $type permit routing and amount bounds",
  (action) => {
    const isDeposit =
      action.type === "vaultV2Deposit" || action.type === "vaultV1Deposit";
    const token = isDeposit ? asset : vault;
    const spender = getChainAddress(1, "bundles.vaultBundlesV1");
    const request = (
      amount: bigint,
      {
        tokenAddress = token,
        spenderAddress = spender,
      }: {
        readonly tokenAddress?: Address;
        readonly spenderAddress?: Address;
      } = {},
    ): SignatureRequest => ({
      id: "permit",
      kind: "permit",
      args: {
        spender: spenderAddress,
        amount,
        nonce: 0n,
        deadline: inputs.deadline,
      },
      typedData: getPermitTypedData(
        {
          erc20: new Token({ address: tokenAddress, name: "Token" }),
          owner: account,
          spender: spenderAddress,
          allowance: amount,
          nonce: 0n,
          deadline: inputs.deadline,
        },
        1,
      ),
    });
    expect(() =>
      validateVaultPermitRequest(request(10n), action),
    ).not.toThrow();
    expect(() => validateVaultPermitRequest(request(9n), action)).toThrow(
      new TransactionPlanSignatureMismatchError("permit", "value"),
    );
    if (isDeposit) {
      expect(() => validateVaultPermitRequest(request(11n), action)).toThrow(
        new TransactionPlanSignatureMismatchError("permit", "value"),
      );
    } else {
      expect(() =>
        validateVaultPermitRequest(request(11n), action),
      ).not.toThrow();
    }
    expect(() =>
      validateVaultPermitRequest(
        request(10n, { tokenAddress: zeroAddress }),
        action,
      ),
    ).toThrow(
      new TransactionPlanSignatureMismatchError(
        "permit",
        "domain.verifyingContract",
      ),
    );
    expect(() =>
      validateVaultPermitRequest(
        request(10n, { spenderAddress: zeroAddress }),
        action,
      ),
    ).toThrow(
      new TransactionPlanSignatureMismatchError("permit", "message.spender"),
    );
    expect(() =>
      validateVaultPermitRequest({ ...request(10n), id: "other" }, action),
    ).toThrow(new TransactionPlanSignatureMismatchError("other", "reference"));
    expect(() =>
      validateVaultPermitRequest(request(10n), {
        type: "erc20Approval",
        inputs: { chainId: 1, account, token, spender, assets: 10n },
      }),
    ).toThrow(new TransactionPlanSignatureMismatchError("permit", "reference"));
  },
);
