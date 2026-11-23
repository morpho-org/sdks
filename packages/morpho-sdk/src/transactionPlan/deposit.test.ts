import { createMockClient, mockRead } from "@morpho-org/test/mock";
import { type Client, erc20Abi, maxUint256, zeroAddress } from "viem";
import { mainnet } from "viem/chains";
import { expect, test } from "vitest";
import {
  IN_KIND_USER,
  IN_KIND_VAULT,
  inKindVaultV1Data,
  inKindVaultV2Data,
} from "../../test/fixtures/inKindRedeem.js";
import { validateDepositPlanAction } from "./deposit.js";
import { InvalidTransactionPlanError } from "./error.js";
import { prepareVaultV1Deposit } from "./vaultv1/deposit.js";
import { prepareVaultV2Deposit } from "./vaultv2/deposit.js";
import { prepareVaultV2Redeem } from "./vaultv2/redeem.js";
import { prepareVaultV2Withdraw } from "./vaultv2/withdraw.js";

const common = {
  chainId: 1,
  account: IN_KIND_USER,
} as const;
test.each([
  {
    name: "V1 deposit",
    prepare: (client: Client) =>
      prepareVaultV1Deposit(client, {
        ...common,
        assets: 100n,
        vault: inKindVaultV1Data(),
      }),
  },
  {
    name: "V2 deposit",
    prepare: (client: Client) =>
      prepareVaultV2Deposit(client, {
        ...common,
        assets: 100n,
        vault: inKindVaultV2Data(),
      }),
  },
  {
    name: "V2 withdraw",
    prepare: (client: Client) =>
      prepareVaultV2Withdraw(client, {
        ...common,
        assets: 100n,
        vault: inKindVaultV2Data(),
      }),
  },
  {
    name: "V2 redeem",
    prepare: (client: Client) =>
      prepareVaultV2Redeem(client, {
        ...common,
        shares: 100n,
        shareToken: inKindVaultV2Data(),
      }),
  },
])(
  "$name stores the supplied token or snapshot address without retaining it",
  async ({ prepare }) => {
    const mock = createMockClient(mainnet);
    for (const address of [IN_KIND_VAULT, inKindVaultV2Data().asset]) {
      mockRead(mock, {
        address,
        abi: erc20Abi,
        functionName: "allowance",
        result: maxUint256,
      });
    }
    const plan = await prepare(mock.client);
    expect(plan.steps.at(-1)?.action.inputs).toMatchObject({
      vault: IN_KIND_VAULT,
    });
    expect(Object.getPrototypeOf(plan.steps.at(-1)?.action.inputs)).toBe(
      Object.prototype,
    );
  },
);

test.each(["amount", "nativeAmount"])(
  "shared deposit validator rejects legacy %s",
  (legacy) => {
    expect(() =>
      validateDepositPlanAction(
        {
          signatureRequestIds: {},
          inputs: {
            ...common,
            vault: IN_KIND_VAULT,
            asset: IN_KIND_USER,
            maxSharePrice: 1n,
            deadline: 2_000_000_000n,
            referralFeePct: 0n,
            referralFeeRecipient: zeroAddress,
            [legacy]: 1n,
          },
        },
        "$.action",
      ),
    ).toThrow(InvalidTransactionPlanError);
  },
);
