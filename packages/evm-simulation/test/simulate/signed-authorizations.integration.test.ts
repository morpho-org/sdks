import { getChainAddresses, MarketParams } from "@morpho-org/blue-sdk";
import {
  blueAbi,
  blueBundlesV1Abi,
  erc2612Abi,
} from "@morpho-org/morpho-sdk/abis";
import { type AnvilTestClient, getErpcForkUrl } from "@morpho-org/test";
import { createViemTest } from "@morpho-org/test/vitest";
import {
  type Address,
  encodeAbiParameters,
  encodeFunctionData,
  erc20Abi,
  isAddressEqual,
  type Log,
  maxUint256,
  parseEventLogs,
  parseSignature,
  zeroAddress,
} from "viem";
import { mainnet } from "viem/chains";
import { expect } from "vitest";
import {
  type BlueAuthorizationSignature,
  type Erc2612PermitAuthorization,
  simulate,
} from "../../src/index.js";

const test = createViemTest(mainnet, {
  forkUrl: getErpcForkUrl(mainnet.id, process.env.ERPC_SECRET),
  chainId: mainnet.id,
  forkBlockNumber: 25_832_676n,
}).extend<{ client: AnvilTestClient<typeof mainnet> }>({
  client: async ({ client }, use) => {
    await client.setCode({ address: client.account.address, bytecode: "0x" });
    await use(client);
  },
});
const token: Address = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const { blue: morpho, bundles } = getChainAddresses(mainnet.id);
const spender = bundles!.blueBundlesV1!;
const market = new MarketParams({
  collateralToken: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf",
  loanToken: token,
  oracle: "0xA6D6950c9F177F1De7f7757FB33539e3Ec60182a",
  irm: "0x870aC11D48B15DB9a138Cf899d20F13F79Ba00BC",
  lltv: 860_000_000_000_000_000n,
});
const amount = 1_000_000n;
const configFor = (client: AnvilTestClient<typeof mainnet>) => ({
  timeoutMs: 30_000,
  chains: new Map([[mainnet.id, { simulateV1Url: client.transport.url! }]]),
});

const permitFor = async (
  client: AnvilTestClient<typeof mainnet>,
): Promise<Erc2612PermitAuthorization> => ({
  type: "erc2612Permit",
  typedData: {
    domain: {
      name: "USD Coin",
      version: "2",
      chainId: 1,
      verifyingContract: token,
    },
    primaryType: "Permit",
    types: {
      Permit: [
        { name: "owner", type: "address" },
        { name: "spender", type: "address" },
        { name: "value", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    },
    message: {
      owner: client.account.address,
      spender,
      value: amount,
      nonce: await client.readContract({
        address: token,
        abi: erc2612Abi,
        functionName: "nonces",
        args: [client.account.address],
      }),
      deadline: maxUint256,
    },
  },
});

for (const invalid of [false, true]) {
  test(`final permit is required even when allowance already exists: bad signature = ${invalid}`, async ({
    client,
  }) => {
    const owner = client.account.address;
    await client.deal({ erc20: token, amount });
    const authorization = await permitFor(client);
    const signature = parseSignature(
      await client.signTypedData({
        account: client.account,
        ...authorization.typedData,
        message: {
          ...authorization.typedData.message,
          value: invalid ? amount + 1n : amount,
        },
      }),
    );
    if (invalid)
      await client.writeContract({
        address: token,
        abi: erc20Abi,
        functionName: "approve",
        args: [spender, maxUint256],
      });
    const transaction = {
      from: owner,
      to: spender,
      data: encodeFunctionData({
        abi: blueBundlesV1Abi,
        functionName: "blueBundlesV1Supply",
        args: [
          market,
          amount,
          {
            kind: 1,
            data: encodeAbiParameters(
              [
                { type: "uint256" },
                { type: "uint8" },
                { type: "bytes32" },
                { type: "bytes32" },
              ],
              [maxUint256, Number(signature.v), signature.r, signature.s],
            ),
          },
          0n,
          zeroAddress,
          maxUint256,
        ],
      }),
    };
    const request = {
      chainId: 1,
      mode: "final" as const,
      limits: "none" as const,
      transactions: [transaction],
    };
    const unchecked = await simulate(configFor(client), request);
    const approvals = parseEventLogs({
      abi: erc20Abi,
      eventName: "Approval",
      logs: unchecked.calls[0]!.logs as Log[],
    });
    expect(
      approvals.some(
        (log) =>
          isAddressEqual(log.address, token) &&
          isAddressEqual(log.args.owner, owner) &&
          isAddressEqual(log.args.spender, spender) &&
          log.args.value === amount,
      ),
    ).toBe(!invalid);
    const checked = simulate(configFor(client), {
      ...request,
      authorizations: [authorization],
    });
    if (invalid) {
      await expect(checked).rejects.toMatchObject({
        code: "UNUSED_AUTHORIZATION",
        authorizationIndex: 0,
        authorization,
      });
      await expect(
        simulate(configFor(client), {
          ...request,
          mode: "preview",
          authorizations: [authorization],
        }),
      ).resolves.toMatchObject({
        verification: {
          mode: "preview",
          authorizations: [expect.objectContaining({ authorizationIndex: 0 })],
        },
      });
    } else {
      const result = await checked;
      expect(result.calls).toHaveLength(1);
      expect(result.verification.authorizations).toEqual([]);
    }
  });
}

test("does not use an assertion-call permit event as transaction evidence", async ({
  client,
}) => {
  const authorization = await permitFor(client);
  const { v, r, s } = parseSignature(
    await client.signTypedData({
      account: client.account,
      ...authorization.typedData,
    }),
  );
  const request = {
    chainId: 1,
    limits: "none" as const,
    transactions: [
      {
        from: client.account.address,
        to: token,
        data: encodeFunctionData({
          abi: erc20Abi,
          functionName: "approve",
          args: [spender, 0n],
        }),
        assertBefore: [
          {
            to: token,
            data: encodeFunctionData({
              abi: erc2612Abi,
              functionName: "permit",
              args: [
                client.account.address,
                spender,
                amount,
                maxUint256,
                Number(v),
                r,
                s,
              ],
            }),
            check: () => undefined,
          },
        ],
      },
    ],
  };
  await expect(simulate(configFor(client), request)).resolves.toBeDefined();
  await expect(
    simulate(configFor(client), {
      ...request,
      authorizations: [authorization],
    }),
  ).rejects.toMatchObject({
    code: "UNUSED_AUTHORIZATION",
    authorizationIndex: 0,
  });
});

test("Blue signature requires its signed nonce, not another IncrementNonce event", async ({
  client,
}) => {
  const authorizer = client.account.address;
  const authorization: BlueAuthorizationSignature = {
    type: "blueAuthorizationSignature",
    typedData: {
      domain: { chainId: 1, verifyingContract: morpho },
      primaryType: "Authorization",
      types: {
        Authorization: [
          { name: "authorizer", type: "address" },
          { name: "authorized", type: "address" },
          { name: "isAuthorized", type: "bool" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      },
      message: {
        authorizer,
        authorized: spender,
        isAuthorized: true,
        nonce: await client.readContract({
          address: morpho,
          abi: blueAbi,
          functionName: "nonce",
          args: [authorizer],
        }),
        deadline: maxUint256,
      },
    },
  };
  const { r, s, v } = parseSignature(
    await client.signTypedData({
      account: client.account,
      ...authorization.typedData,
    }),
  );
  const transactions = [
    {
      from: authorizer,
      to: morpho,
      data: encodeFunctionData({
        abi: blueAbi,
        functionName: "setAuthorizationWithSig",
        args: [authorization.typedData.message, { r, s, v: Number(v) }],
      }),
    },
  ];
  const request = {
    chainId: 1,
    limits: "none" as const,
    transactions,
    authorizations: [authorization],
  };
  await expect(simulate(configFor(client), request)).resolves.toMatchObject({
    verification: { authorizations: [] },
  });
  const wrongNonce = {
    ...authorization,
    typedData: {
      ...authorization.typedData,
      message: {
        ...authorization.typedData.message,
        nonce: authorization.typedData.message.nonce + 1n,
      },
    },
  };
  await expect(
    simulate(configFor(client), { ...request, authorizations: [wrongNonce] }),
  ).rejects.toMatchObject({
    code: "UNUSED_AUTHORIZATION",
    authorizationIndex: 0,
  });
  const wrongSignature = parseSignature(
    await client.signTypedData({
      account: client.account,
      ...wrongNonce.typedData,
    }),
  );
  await expect(
    simulate(configFor(client), {
      ...request,
      authorizations: [wrongNonce],
      transactions: [
        {
          from: authorizer,
          to: morpho,
          data: encodeFunctionData({
            abi: blueAbi,
            functionName: "setAuthorizationWithSig",
            args: [
              wrongNonce.typedData.message,
              {
                r: wrongSignature.r,
                s: wrongSignature.s,
                v: Number(wrongSignature.v),
              },
            ],
          }),
        },
      ],
    }),
  ).rejects.toMatchObject({ code: "SIMULATION_REVERTED", transactionIndex: 0 });
});
