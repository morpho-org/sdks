import { midnightSupplyCollateral } from "@morpho-org/morpho-sdk";
import {
  midnightAbi,
  midnightBundlesV2Abi,
  midnightEcrecoverAuthorizerAbi,
} from "@morpho-org/morpho-sdk/abis";
import { MarketParams } from "@morpho-org/morpho-sdk/midnight/entities";
import { ChainId, getChainAddress } from "@morpho-org/morpho-ts";
import { type AnvilTestClient, getErpcForkUrl } from "@morpho-org/test";
import { createViemTest } from "@morpho-org/test/vitest";
import {
  type Address,
  concatHex,
  encodeFunctionData,
  erc20Abi,
  isAddressEqual,
  keccak256,
  maxUint256,
  padHex,
  parseEther,
  parseSignature,
  stringToHex,
  toHex,
  zeroAddress,
  zeroHash,
} from "viem";
import { base } from "viem/chains";
import { describe, expect } from "vitest";
import {
  simulate,
  toSimulationLimits,
  UnexpectedMidnightAuthorizationError,
} from "../../src/index.js";

const test = createViemTest(base, {
  forkUrl: getErpcForkUrl(base.id, process.env.ERPC_SECRET),
  chainId: base.id,
  forkBlockNumber: 52_252_000n,
}).extend<{ client: AnvilTestClient<typeof base> }>({
  client: async ({ client }, use) => {
    await client.setCode({ address: client.account.address, bytecode: "0x" });
    await use(client);
  },
});

const midnight = getChainAddress(ChainId.BaseMainnet, "midnight");
const midnightBundlesV2 = getChainAddress(
  ChainId.BaseMainnet,
  "midnightBundlesV2",
);
const ecrecoverAuthorizer = getChainAddress(
  ChainId.BaseMainnet,
  "ecrecoverAuthorizer",
);
const usdc = getChainAddress(ChainId.BaseMainnet, "usdc");
const wNative = getChainAddress(ChainId.BaseMainnet, "wNative");
const rateRatifier = getChainAddress(ChainId.BaseMainnet, "rateRatifierV1");
const oracle: Address = "0x0000000000000000000000000000000000080000";
const UNKNOWN: Address = "0x0000000000000000000000000000000000000Bad";
const OTHER_OWNER: Address = "0x8888888888888888888888888888888888888888";

const market = new MarketParams({
  chainId: base.id,
  midnight,
  loanToken: usdc,
  collateralParams: [
    {
      token: wNative,
      lltv: 770000000000000000n,
      liquidationCursor: 300000000000000000n,
      oracle,
    },
  ],
  maturity: 2_000_000_000n,
  rcfThreshold: 0n,
  enterGate: zeroAddress,
  liquidatorGate: zeroAddress,
});
const configFor = (client: { transport: { url?: string } }) => ({
  chains: new Map([[base.id, { simulateV1Url: client.transport.url! }]]),
});

const setIsAuthorized = ({
  from,
  onBehalf = from,
  authorized,
  isAuthorized = true,
}: {
  readonly from: Address;
  readonly onBehalf?: Address;
  readonly authorized: Address;
  readonly isAuthorized?: boolean;
}) => ({
  from,
  to: midnight,
  data: encodeFunctionData({
    abi: midnightAbi,
    functionName: "setIsAuthorized",
    args: [authorized, isAuthorized, onBehalf],
  }),
});

/** Install a fixed-price oracle, fund and approve the sender, and create the market. */
const setUp = async (client: AnvilTestClient<typeof base>) => {
  const user = client.account.address;
  // Returns a constant 1e36 price.
  await client.setCode({
    address: oracle,
    bytecode: concatHex([
      "0x7f",
      padHex(toHex(10n ** 36n), { size: 32 }),
      "0x60005260206000f3",
    ]),
  });
  await client.deal({ erc20: wNative, amount: parseEther("10") });
  await client.writeContract({
    account: client.account,
    address: wNative,
    abi: erc20Abi,
    functionName: "approve",
    args: [midnight, maxUint256],
  });
  const seed = midnightSupplyCollateral({
    chainId: base.id,
    market,
    assets: 1n,
    onBehalf: user,
  });
  await client.sendTransaction({
    account: client.account,
    to: seed.to,
    data: seed.data,
  });
  const supply = midnightSupplyCollateral({
    chainId: base.id,
    market,
    assets: parseEther("1"),
    onBehalf: user,
  });
  return {
    user,
    supply: { from: user, to: supply.to, data: supply.data },
    limits: toSimulationLimits(supply.action, { owner: user }),
  };
};

/** Authorize an operator on-chain before the simulated bundle. */
const authorizeOnChain = async (
  client: AnvilTestClient<typeof base>,
  authorized: Address,
) => {
  const tx = setIsAuthorized({
    from: client.account.address,
    authorized: authorized,
  });
  await client.sendTransaction({
    account: client.account,
    to: tx.to,
    data: tx.data,
  });
};

const authorizationTypes = {
  Authorization: [
    { name: "authorizer", type: "address" },
    { name: "authorized", type: "address" },
    { name: "isAuthorized", type: "bool" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

const typedAuthorization = ({
  authorizer,
  nonce,
  authorized = UNKNOWN,
}: {
  readonly authorizer: Address;
  readonly nonce: bigint;
  readonly authorized?: Address;
}) => ({
  domain: { chainId: base.id, verifyingContract: ecrecoverAuthorizer },
  primaryType: "Authorization" as const,
  types: authorizationTypes,
  message: {
    authorizer,
    authorized,
    isAuthorized: true,
    nonce,
    deadline: maxUint256,
  },
});

const expectRejection = async (
  simulation: Promise<unknown>,
  {
    onBehalf,
    authorized,
  }: { readonly onBehalf: Address; readonly authorized: Address },
) => {
  const error = await simulation.then(
    () => undefined,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(UnexpectedMidnightAuthorizationError);
  if (!(error instanceof UnexpectedMidnightAuthorizationError)) return;
  expect(isAddressEqual(error.onBehalf, onBehalf)).toBe(true);
  expect(isAddressEqual(error.authorized, authorized)).toBe(true);
};

describe.sequential("simulate Midnight authorization allowlist — Base fork", () => {
  test("rejects a direct Midnight grant to an unknown operator", async ({
    client,
  }) => {
    const { user, supply, limits } = await setUp(client);
    await expectRejection(
      simulate(configFor(client), {
        chainId: base.id,
        transactions: [
          supply,
          setIsAuthorized({ from: user, authorized: UNKNOWN }),
        ],
        limits,
      }),
      { onBehalf: user, authorized: UNKNOWN },
    );
  });

  test("allows a ratifier grant only for a make-borrow collateral limit", async ({
    client,
  }) => {
    const { user, supply, limits } = await setUp(client);
    const ratifierGrant = setIsAuthorized({
      from: user,
      authorized: rateRatifier,
    });
    const transactions = [supply, ratifierGrant];
    const operation = limits.operations[0];
    if (operation?.type !== "midnightSupplyCollateral")
      throw new Error("Expected a direct collateral-supply limit");
    await expectRejection(
      simulate(configFor(client), {
        chainId: base.id,
        transactions,
        limits,
      }),
      { onBehalf: user, authorized: rateRatifier },
    );
    await expect(
      simulate(configFor(client), {
        chainId: base.id,
        transactions,
        limits: {
          ...limits,
          operations: [
            {
              ...operation,
              type: "midnightSupplyCollateralMakeBorrow",
            },
          ],
        },
      }),
    ).resolves.toBeDefined();
  });

  test("rejects a sender-made grant on another account", async ({ client }) => {
    const { user, supply, limits } = await setUp(client);
    await client.setBalance({
      address: OTHER_OWNER,
      value: parseEther("1"),
    });
    await client.impersonateAccount({ address: OTHER_OWNER });
    try {
      const authorization = setIsAuthorized({
        from: OTHER_OWNER,
        authorized: user,
      });
      await client.sendTransaction({
        account: OTHER_OWNER,
        to: authorization.to,
        data: authorization.data,
      });
    } finally {
      await client.stopImpersonatingAccount({ address: OTHER_OWNER });
    }

    await expectRejection(
      simulate(configFor(client), {
        chainId: base.id,
        transactions: [
          supply,
          setIsAuthorized({
            from: user,
            onBehalf: OTHER_OWNER,
            authorized: UNKNOWN,
          }),
        ],
        limits,
      }),
      { onBehalf: OTHER_OWNER, authorized: UNKNOWN },
    );
  });

  test("rejects an unknown ratifier granted through MidnightBundlesV2.cancelAndMake", async ({
    client,
  }) => {
    const { user, supply, limits } = await setUp(client);
    await authorizeOnChain(client, midnightBundlesV2);
    // Ratifier stub answering SET_IS_ROOT_RATIFIED_SUCCESS to any call.
    await client.setCode({
      address: UNKNOWN,
      bytecode: concatHex([
        "0x7f",
        keccak256(stringToHex("morpho.midnight.setIsRootRatifiedSuccess")),
        "0x60005260206000f3",
      ]),
    });
    const cancelAndMake = {
      from: user,
      to: midnightBundlesV2,
      data: encodeFunctionData({
        abi: midnightBundlesV2Abi,
        functionName: "midnightBundlesV2CancelAndMake",
        args: [
          {
            loanToken: zeroAddress,
            collateralToken: zeroAddress,
            oracle: zeroAddress,
            irm: zeroAddress,
            lltv: 0n,
          },
          0n,
          zeroHash,
          market,
          [],
          UNKNOWN,
          `0x${"11".repeat(32)}`,
          0n,
          0n,
          0n,
          0,
          zeroHash,
          zeroHash,
          [],
          "0x",
          maxUint256,
          wNative,
        ],
      }),
    };
    await expectRejection(
      simulate(configFor(client), {
        chainId: base.id,
        transactions: [supply, cancelAndMake],
        limits,
      }),
      { onBehalf: user, authorized: UNKNOWN },
    );
  });

  test("rejects an unknown operator granted through EcrecoverAuthorizer", async ({
    client,
  }) => {
    const { user, supply, limits } = await setUp(client);
    await authorizeOnChain(client, ecrecoverAuthorizer);
    const authorization = {
      authorizer: user,
      authorized: UNKNOWN,
      isAuthorized: true,
      nonce: await client.readContract({
        address: ecrecoverAuthorizer,
        abi: midnightEcrecoverAuthorizerAbi,
        functionName: "nonce",
        args: [user],
      }),
      deadline: maxUint256,
    };
    const { v, r, s } = parseSignature(
      await client.signTypedData({
        account: client.account,
        domain: { chainId: base.id, verifyingContract: ecrecoverAuthorizer },
        types: authorizationTypes,
        primaryType: "Authorization",
        message: authorization,
      }),
    );
    const signed = {
      from: user,
      to: ecrecoverAuthorizer,
      data: encodeFunctionData({
        abi: midnightEcrecoverAuthorizerAbi,
        functionName: "setIsAuthorized",
        args: [authorization, { v: Number(v), r, s }],
      }),
    };
    await expectRejection(
      simulate(configFor(client), {
        chainId: base.id,
        transactions: [supply, signed],
        limits,
      }),
      { onBehalf: user, authorized: UNKNOWN },
    );
  });

  test("previews an allowlisted EcrecoverAuthorizer grant", async ({
    client,
  }) => {
    const { user, supply, limits } = await setUp(client);
    const authorization = typedAuthorization({ authorizer: user, nonce: 0n });
    await expect(
      simulate(configFor(client), {
        chainId: base.id,
        mode: "preview",
        transactions: [supply],
        authorizations: [
          {
            type: "midnightAuthorizationSignature",
            typedData: authorization,
          },
        ],
        limits: {
          ...limits,
          approvals: [
            {
              type: "midnightAuthorization",
              onBehalf: user,
              authorized: UNKNOWN,
            },
          ],
        },
      }),
    ).resolves.toBeDefined();
  });

  test("rejects an unallowlisted EcrecoverAuthorizer grant before simulation", async ({
    client,
  }) => {
    const { user, supply, limits } = await setUp(client);
    await expectRejection(
      simulate(configFor(client), {
        chainId: base.id,
        mode: "preview",
        transactions: [supply],
        authorizations: [
          {
            type: "midnightAuthorizationSignature",
            typedData: typedAuthorization({ authorizer: user, nonce: 0n }),
          },
        ],
        limits,
      }),
      { onBehalf: user, authorized: UNKNOWN },
    );
  });

  test("requires a final-mode EcrecoverAuthorizer signature to be submitted", async ({
    client,
  }) => {
    const { user } = await setUp(client);
    const nonce = await client.readContract({
      address: ecrecoverAuthorizer,
      abi: midnightEcrecoverAuthorizerAbi,
      functionName: "nonce",
      args: [user],
    });
    await expect(
      simulate(configFor(client), {
        chainId: base.id,
        mode: "final",
        transactions: [
          {
            from: user,
            to: ecrecoverAuthorizer,
            data: encodeFunctionData({
              abi: midnightEcrecoverAuthorizerAbi,
              functionName: "nonce",
              args: [user],
            }),
          },
        ],
        authorizations: [
          {
            type: "midnightAuthorizationSignature",
            typedData: typedAuthorization({ authorizer: user, nonce }),
          },
        ],
        limits: "none",
      }),
    ).rejects.toMatchObject({ name: "UnusedAuthorizationError" });
  });

  test("accepts a real final-mode EcrecoverAuthorizer signature", async ({
    client,
  }) => {
    const { user } = await setUp(client);
    await authorizeOnChain(client, ecrecoverAuthorizer);
    const authorization = typedAuthorization({
      authorizer: user,
      nonce: await client.readContract({
        address: ecrecoverAuthorizer,
        abi: midnightEcrecoverAuthorizerAbi,
        functionName: "nonce",
        args: [user],
      }),
    }).message;
    const typedData = typedAuthorization({
      authorizer: user,
      nonce: authorization.nonce,
    });
    const { v, r, s } = parseSignature(
      await client.signTypedData({
        account: client.account,
        domain: typedData.domain,
        types: authorizationTypes,
        primaryType: "Authorization",
        message: authorization,
      }),
    );
    await expect(
      simulate(configFor(client), {
        chainId: base.id,
        mode: "final",
        transactions: [
          {
            from: user,
            to: ecrecoverAuthorizer,
            data: encodeFunctionData({
              abi: midnightEcrecoverAuthorizerAbi,
              functionName: "setIsAuthorized",
              args: [authorization, { v: Number(v), r, s }],
            }),
          },
        ],
        authorizations: [
          {
            type: "midnightAuthorizationSignature",
            typedData,
          },
        ],
        limits: "none",
      }),
    ).resolves.toBeDefined();
  });

  test("accepts the derived MidnightBundlesV2 grant and an explicit grant", async ({
    client,
  }) => {
    const { user, supply, limits } = await setUp(client);
    await expect(
      simulate(configFor(client), {
        chainId: base.id,
        transactions: [
          setIsAuthorized({ from: user, authorized: midnightBundlesV2 }),
          supply,
        ],
        limits,
      }),
    ).resolves.toBeDefined();
    await expect(
      simulate(configFor(client), {
        chainId: base.id,
        transactions: [
          setIsAuthorized({ from: user, authorized: UNKNOWN }),
          supply,
        ],
        limits: {
          ...limits,
          approvals: [
            {
              type: "midnightAuthorization",
              onBehalf: user,
              authorized: UNKNOWN,
            },
          ],
        },
      }),
    ).resolves.toBeDefined();
  });

  test("rejects a grant revoked later in the bundle and accepts a revocation", async ({
    client,
  }) => {
    const { user, supply, limits } = await setUp(client);
    await expectRejection(
      simulate(configFor(client), {
        chainId: base.id,
        transactions: [
          setIsAuthorized({ from: user, authorized: UNKNOWN }),
          supply,
          setIsAuthorized({
            from: user,
            authorized: UNKNOWN,
            isAuthorized: false,
          }),
        ],
        limits,
      }),
      { onBehalf: user, authorized: UNKNOWN },
    );
    await expect(
      simulate(configFor(client), {
        chainId: base.id,
        transactions: [
          setIsAuthorized({
            from: user,
            authorized: UNKNOWN,
            isAuthorized: false,
          }),
          supply,
        ],
        limits,
      }),
    ).resolves.toBeDefined();
  });
});
