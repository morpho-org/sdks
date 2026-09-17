import type { AnvilTestClient } from "@morpho-org/test";
import { createViemTest } from "@morpho-org/test/vitest";
import { mainnet } from "viem/chains";
import {
  type ActionRequirement,
  isRequirementApproval,
  isRequirementBlueAuthorization,
  isRequirementSignature,
  type RequirementSignature,
} from "../../src/index.js";

export const blueBundlesV1Test = createViemTest(mainnet, {
  forkUrl: process.env.MAINNET_RPC_URL,
  chainId: mainnet.id,
  forkBlockNumber: 25_832_676n,
}).extend<{ client: AnvilTestClient<typeof mainnet> }>({
  client: async ({ client }, use) => {
    await client.setCode({ address: client.account.address, bytecode: "0x" });
    await use(client);
  },
});

export const satisfyBlueBundlesV1Requirements = async (
  client: AnvilTestClient,
  params: {
    requirements: readonly ActionRequirement[];
    approvalFundingToken?: `0x${string}`;
  },
): Promise<readonly RequirementSignature[]> => {
  const { requirements, approvalFundingToken } = params;
  const signatures: RequirementSignature[] = [];

  for (const requirement of requirements) {
    if (isRequirementApproval(requirement)) {
      if (approvalFundingToken !== undefined) {
        await client.deal({
          erc20: approvalFundingToken,
          amount: requirement.action.args.amount,
        });
      }
      await client.sendTransaction(requirement);
    } else if (isRequirementBlueAuthorization(requirement)) {
      await client.sendTransaction(requirement);
    } else if (isRequirementSignature(requirement)) {
      signatures.push(await requirement.sign(client, client.account.address));
    } else {
      throw new Error("Unexpected BlueBundlesV1 requirement");
    }
  }

  return signatures;
};
