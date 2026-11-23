import { getChainAddresses } from "@morpho-org/blue-sdk";
import { blueAbi, fetchAccrualPosition } from "@morpho-org/blue-sdk-viem";
import { getChainAddress } from "@morpho-org/morpho-ts";
import { type AnvilTestClient, getErpcForkUrl } from "@morpho-org/test";
import { createViemTest } from "@morpho-org/test/vitest";
import { parseUnits } from "viem";
import { signTypedData } from "viem/actions";
import { mainnet } from "viem/chains";
import { assert, expect } from "vitest";
import { blueBorrow } from "../../../src/actions/blue/borrow.js";
import {
  applySignatures,
  BorrowExceedsSafeLtvError,
  buildTransactions,
  DEFAULT_LLTV_BUFFER,
  getPendingSignatureRequests,
  parseTransactionPlan,
  prepareBlueBorrow,
  serializeTransactionPlan,
} from "../../../src/index.js";
import { WethUsdsBlue } from "../../fixtures/blue.js";
import { supplyCollateral, supplyLoan } from "../../helpers/blue.js";

const test = createViemTest(mainnet, {
  forkUrl:
    process.env.MAINNET_RPC_URL ??
    getErpcForkUrl(mainnet.id, process.env.ERPC_SECRET) ??
    (process.env.ALCHEMY_KEY
      ? `https://eth-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_KEY}`
      : undefined),
  forkBlockNumber: 25_832_676n,
}).extend<{ client: AnvilTestClient<typeof mainnet> }>({
  client: async ({ client }, use) => {
    await client.setCode({ address: client.account.address, bytecode: "0x" });
    await use(client);
  },
});

for (const mode of ["authorized", "transaction", "signature"] as const) {
  test(`borrow: ${mode} authorization, pinned snapshot through execution`, async ({
    client,
  }) => {
    const chainId = client.chain.id;
    const account = client.account.address;
    const borrowAssets = parseUnits("100", 18);
    const collateral = parseUnits("10", 18);
    await supplyLoan({
      client,
      chainId,
      market: WethUsdsBlue,
      supplyAmount: borrowAssets * 2n,
    });
    await supplyCollateral({
      client,
      chainId,
      market: WethUsdsBlue,
      collateralAmount: collateral,
    });
    const position = await fetchAccrualPosition(
      account,
      WethUsdsBlue.id,
      client,
    );
    const now = (await client.getBlock()).timestamp;
    const expiresAt = Number(now + 7200n);
    const spender = getChainAddress(chainId, "bundles.blueBundlesV1");
    const authorized = await client.readContract({
      address: getChainAddresses(chainId).blue,
      abi: blueAbi,
      functionName: "isAuthorized",
      args: [account, spender],
    });
    if (authorized !== (mode === "authorized")) {
      await client.writeContract({
        address: getChainAddresses(chainId).blue,
        abi: blueAbi,
        functionName: "setAuthorization",
        args: [spender, mode === "authorized"],
      });
    }
    const params = {
      chainId,
      account,
      borrowAssets,
      marketId: WethUsdsBlue.id,
      marketData: { chainId, market: position.market },
      positionData: { chainId, position },
      now,
      expiresAt,
      supportSignature: mode === "signature",
    };
    await expect(
      prepareBlueBorrow(client, { ...params, borrowAssets: 10n ** 30n }),
    ).rejects.toBeInstanceOf(BorrowExceedsSafeLtvError);
    let plan = await prepareBlueBorrow(client, params);
    expect(plan.steps.map(({ action }) => action.type)).toEqual(
      mode !== "transaction"
        ? ["blueBorrow"]
        : ["morphoAuthorization", "blueBorrow"],
    );
    expect(plan.signatureRequests.map(({ kind }) => kind)).toEqual(
      mode === "signature" ? ["morphoAuthorization"] : [],
    );
    plan = applySignatures(
      plan,
      await Promise.all(
        getPendingSignatureRequests(plan).map(async ({ id, typedData }) => ({
          id,
          signature: await signTypedData(client, {
            ...typedData,
            account: client.account,
          }),
        })),
      ),
    );
    const transactions = buildTransactions(
      parseTransactionPlan(serializeTransactionPlan(plan)),
    );
    const borrow = transactions.at(-1);
    assert(borrow);
    const authorization = plan.signatureRequests.find(
      (request) => request.kind === "morphoAuthorization",
    );
    expect(borrow.data).toBe(
      blueBorrow({
        market: { chainId, marketParams: WethUsdsBlue },
        args: {
          userAddress: account,
          borrowAssets,
          maxLtv: WethUsdsBlue.lltv - DEFAULT_LLTV_BUFFER,
          deadline: BigInt(expiresAt),
          authorizationSignature: authorization?.signature
            ? {
                action: {
                  type: "authorization" as const,
                  args: {
                    authorized: authorization.args.authorized,
                    isAuthorized: true,
                    deadline: authorization.args.deadline,
                  },
                },
                args: {
                  ...authorization.args,
                  isAuthorized: true,
                  signature: authorization.signature,
                },
              }
            : undefined,
        },
      }).data,
    );
    expect(borrow.to).toBe(spender);
    const before = await client.balanceOf({
      erc20: WethUsdsBlue.loanToken,
      owner: account,
    });
    for (const transaction of transactions) {
      const hash = await client.sendTransaction(transaction);
      await client.waitForTransactionReceipt({ hash });
    }
    const after = await fetchAccrualPosition(account, WethUsdsBlue.id, client);
    expect(after.borrowShares).toBeGreaterThan(position.borrowShares);
    expect(after.collateral).toBe(collateral);
    expect(after.isHealthy).toBe(true);
    expect(after.borrowAssets).toBeGreaterThanOrEqual(borrowAssets);
    expect(
      await client.balanceOf({ erc20: WethUsdsBlue.loanToken, owner: account }),
    ).toBe(before + borrowAssets);
  });
}
