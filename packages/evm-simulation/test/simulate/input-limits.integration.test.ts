import {
  getChainAddresses,
  MarketParams,
  MathLib,
  marketParamsAbi,
} from "@morpho-org/blue-sdk";
import { morphoViemExtension } from "@morpho-org/morpho-sdk";
import {
  blueAbi,
  morphoMarketV1AdapterV2FactoryAbi,
  morphoVaultV1AdapterFactoryAbi,
  vaultV2Abi,
  vaultV2BluePublicAllocatorAbi,
  vaultV2FactoryAbi,
} from "@morpho-org/morpho-sdk/abis";
import { type AnvilTestClient, getErpcForkUrl } from "@morpho-org/test";
import { createViemTest } from "@morpho-org/test/vitest";
import {
  type Address,
  encodeAbiParameters,
  encodeFunctionData,
  erc20Abi,
  erc4626Abi,
  ethAddress,
  type Hex,
  isAddressEqual,
  maxUint128,
  maxUint256,
  parseEventLogs,
  zeroHash,
} from "viem";
import { mainnet } from "viem/chains";
import { expect } from "vitest";
import {
  ConsumerLimitViolationError,
  type InputOperationLimit,
  SimulationValidationError,
  SlippageCheckUnavailableError,
  simulate,
  toSimulationAuthorizations,
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
const USDC: Address = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const CBBTC: Address = "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf";
const V1: Address = "0xBEEF01735c132Ada46AA9aA4c54623cAA92A64CB";
const V2: Address = "0x04422053aDDbc9bB2759b248B574e3FCA76Bc145";
const marketParams = new MarketParams({
  collateralToken: CBBTC,
  loanToken: USDC,
  oracle: "0xA6D6950c9F177F1De7f7757FB33539e3Ec60182a",
  irm: "0x870aC11D48B15DB9a138Cf899d20F13F79Ba00BC",
  lltv: 860_000_000_000_000_000n,
});
type Requirements = Parameters<
  typeof toSimulationAuthorizations
>[0]["requirements"];
type Action = {
  getRequirements(): Promise<Requirements>;
  buildTx(): {
    readonly to: Address;
    readonly data: `0x${string}`;
    readonly value?: bigint;
  };
};

async function execute(
  client: AnvilTestClient<typeof mainnet>,
  action: Action,
) {
  for (const requirement of await action.getRequirements()) {
    if ("to" in requirement)
      await client.sendTransaction({
        account: client.account,
        to: requirement.to,
        data: requirement.data,
        value: requirement.value,
      });
  }
  await client.sendTransaction({
    account: client.account,
    ...action.buildTx(),
  });
}

async function govern(
  {
    client,
    vault,
  }: {
    readonly client: AnvilTestClient<typeof mainnet>;
    readonly vault: Address;
  },
  data: Hex,
) {
  await client.writeContract({
    address: vault,
    abi: vaultV2Abi,
    functionName: "submit",
    args: [data],
  });
  await client.sendTransaction({ to: vault, data });
}

async function check(
  client: AnvilTestClient<typeof mainnet>,
  [action, operation, wrongAmount]: readonly [
    Action,
    InputOperationLimit,
    InputOperationLimit,
  ],
) {
  const tx = action.buildTx();
  const params = {
    chainId: 1,
    mode: "preview" as const,
    authorizations: toSimulationAuthorizations({
      owner: client.account.address,
      requirements: await action.getRequirements(),
    }),
    transactions: [
      {
        from: client.account.address,
        to: tx.to,
        data: tx.data,
        value: tx.value,
      },
    ],
  };
  const config = {
    timeoutMs: 30_000,
    chains: new Map([[1, { simulateV1Url: client.transport.url! }]]),
  };
  const result = await simulate(config, {
    ...params,
    limits: { operations: [operation] },
  });
  expect(result.verification.operations[0]?.operation).toBe(operation.type);
  expect(result.simulationTxs).toHaveLength(1);
  expect(result.calls).toHaveLength(1);
  const reported = result.verification.limits;
  expect(reported).not.toBe("none");
  if (reported !== "none") {
    expect(reported.operations[0]?.fieldChecks).toEqual(
      result.verification.operations[0]?.checkedLimits.fieldChecks,
    );
    expect(reported.operations[0]?.fieldChecks).toBeDefined();
    expect(reported.operations[0]).not.toHaveProperty("derivedFields");
    expect(reported.operations[0]).not.toHaveProperty("exactFields");
    expect(reported.operations[0]).not.toHaveProperty("inactiveFields");
  }
  await expect(
    simulate(config, { ...params, limits: { operations: [wrongAmount] } }),
  ).rejects.toBeInstanceOf(ConsumerLimitViolationError);
  const wrongSubject =
    "marketId" in operation
      ? {
          ...operation,
          marketId: new MarketParams({
            ...marketParams,
            oracle: "0xc7BE7593FD5453Db5AdcC1d7103f2211d4F2e40D",
          }).id,
        }
      : operation.type === "vaultV1MigrateToV2"
        ? { ...operation, targetVault: V1 }
        : { ...operation, vault: operation.vault === V1 ? V2 : V1 };
  await expect(
    simulate(config, { ...params, limits: { operations: [wrongSubject] } }),
  ).rejects.toBeInstanceOf(
    operation.type === "vaultV1MigrateToV2"
      ? SlippageCheckUnavailableError
      : ConsumerLimitViolationError,
  );
  if (
    operation.type === "vaultV1Withdraw" ||
    operation.type === "vaultV2Withdraw" ||
    operation.type === "blueWithdraw" ||
    operation.type === "blueBorrow" ||
    operation.type === "blueWithdrawCollateral" ||
    operation.type === "blueRepayWithdrawCollateral"
  ) {
    const checkedQuote = result.verification.operations[0]!.checkedLimits.quote;
    const quote =
      operation.type === "blueWithdrawCollateral" ||
      operation.type === "blueRepayWithdrawCollateral"
        ? { collateralWithdrawn: checkedQuote.collateralWithdrawn }
        : checkedQuote;
    await expect(
      simulate(config, {
        ...params,
        limits: { operations: [{ ...operation, quote }] },
      }),
    ).resolves.toBeDefined();
    await expect(
      simulate(config, {
        ...params,
        limits: { operations: [{ ...wrongSubject, quote }] },
      }),
    ).rejects.toBeInstanceOf(ConsumerLimitViolationError);
  }
  if (
    operation.type === "vaultV1Redeem" ||
    operation.type === "vaultV2Redeem"
  ) {
    await expect(
      simulate(config, {
        ...params,
        limits: {
          operations: [
            operation,
            { ...operation, vault: operation.vault === V1 ? V2 : V1 },
          ],
        },
      }),
    ).rejects.toBeInstanceOf(SimulationValidationError);
  }
}

test("same-token combined Blue operations derive net wallets, including on-behalf positions", async ({
  client,
}) => {
  const params = new MarketParams({ ...marketParams, collateralToken: USDC });
  await client.writeContract({
    address: getChainAddresses(1).blue,
    abi: blueAbi,
    functionName: "createMarket",
    args: [params],
  });
  const market = client
    .extend(morphoViemExtension({ supportSignature: false }))
    .morpho.blue(params, 1);
  const userAddress = client.account.address;
  const deadline = BigInt(Math.floor(Date.now() / 1000)) + 3600n;
  await client.deal({
    erc20: USDC,
    account: userAddress,
    amount: 300_000_000n,
  });
  await execute(
    client,
    market.supply({ userAddress, deadline, assets: 100_000_000n }),
  );
  const borrow = market.supplyCollateralBorrow({
    userAddress,
    deadline,
    positionData: await market.getPositionData(userAddress),
    collateralAssets: 100_000_000n,
    borrowAssets: 50_000_000n,
  });
  await check(client, [
    borrow,
    {
      type: "blueSupplyCollateralBorrow",
      marketId: params.id,
      inputs: { collateralAssets: 100_000_000n, borrowAssets: 50_000_000n },
    },
    {
      type: "blueSupplyCollateralBorrow",
      marketId: params.id,
      inputs: { collateralAssets: 100_000_001n, borrowAssets: 50_000_000n },
    },
  ]);
  await execute(client, borrow);
  const repay = market.repayWithdrawCollateral({
    userAddress,
    deadline,
    positionData: await market.getPositionData(userAddress),
    repayAssets: 20_000_000n,
    collateralAssets: 30_000_000n,
  });
  await check(client, [
    repay,
    {
      type: "blueRepayWithdrawCollateral",
      marketId: params.id,
      inputs: { repay: { assets: 20_000_000n }, collateralAssets: 30_000_000n },
    },
    {
      type: "blueRepayWithdrawCollateral",
      marketId: params.id,
      inputs: { repay: { assets: 20_000_001n }, collateralAssets: 30_000_000n },
    },
  ]);
  const account: Address = "0x0000000000000000000000000000000000000005";
  const blue = getChainAddresses(1).blue;
  await client.setBalance({ address: account, value: 10n ** 18n });
  await client.impersonateAccount({ address: account });
  await client.writeContract({
    account,
    address: blue,
    abi: blueAbi,
    functionName: "setAuthorization",
    args: [userAddress, true],
  });
  await client.stopImpersonatingAccount({ address: account });
  await client.writeContract({
    address: USDC,
    abi: erc20Abi,
    functionName: "approve",
    args: [blue, maxUint256],
  });
  const onBehalfBorrow = [
    encodeFunctionData({
      abi: blueAbi,
      functionName: "supplyCollateral",
      args: [params, 100_000_000n, account, "0x"],
    }),
    encodeFunctionData({
      abi: blueAbi,
      functionName: "borrow",
      args: [params, 25_000_000n, 0n, account, userAddress],
    }),
  ].map((data) => ({ from: userAddress, to: blue, data }));
  const config = {
    timeoutMs: 30_000,
    chains: new Map([[1, { simulateV1Url: client.transport.url! }]]),
  };
  await expect(
    simulate(config, {
      chainId: 1,
      transactions: onBehalfBorrow,
      limits: {
        operations: [
          {
            type: "blueSupplyCollateralBorrow",
            marketId: params.id,
            account,
            inputs: {
              collateralAssets: 100_000_000n,
              borrowAssets: 25_000_000n,
            },
          },
        ],
      },
    }),
  ).resolves.toBeDefined();
  for (const { from, ...transaction } of onBehalfBorrow)
    await client.sendTransaction({ account: from, ...transaction });
  const onBehalfRepay = [
    encodeFunctionData({
      abi: blueAbi,
      functionName: "repay",
      args: [params, 10_000_000n, 0n, account, "0x"],
    }),
    encodeFunctionData({
      abi: blueAbi,
      functionName: "withdrawCollateral",
      args: [params, 20_000_000n, account, userAddress],
    }),
  ].map((data) => ({ from: userAddress, to: blue, data }));
  await expect(
    simulate(config, {
      chainId: 1,
      transactions: onBehalfRepay,
      limits: {
        operations: [
          {
            type: "blueRepayWithdrawCollateral",
            marketId: params.id,
            account,
            inputs: {
              repay: { assets: 10_000_000n },
              collateralAssets: 20_000_000n,
            },
          },
        ],
      },
    }),
  ).resolves.toBeDefined();
}, 180_000);

test("full and share-mode Blue repayments derive from live debt", async ({
  client,
}) => {
  const market = client
    .extend(morphoViemExtension({ supportSignature: false }))
    .morpho.blue(marketParams, 1);
  const userAddress = client.account.address;
  const deadline = BigInt(Math.floor(Date.now() / 1000)) + 3600n;
  await client.deal({ erc20: USDC, amount: 100_000_000n });
  await client.deal({ erc20: CBBTC, amount: 10_000_000n });
  await execute(
    client,
    market.supply({ userAddress, deadline, assets: 20_000_000n }),
  );
  await execute(
    client,
    market.supplyCollateralBorrow({
      userAddress,
      deadline,
      positionData: await market.getPositionData(userAddress),
      collateralAssets: 5_000_000n,
      borrowAssets: 5_000_000n,
    }),
  );
  const positionData = await market.getPositionData(userAddress);
  const shares = positionData.borrowShares / 2n;
  for (const fullRepay of [false, true]) {
    const repayShares = fullRepay ? maxUint256 : shares;
    const combined = market.repayWithdrawCollateral({
      userAddress,
      deadline,
      positionData,
      repayShares,
      collateralAssets: 1n,
    });
    const combinedTx = combined.buildTx();
    const combinedParams = {
      chainId: 1,
      mode: "preview" as const,
      authorizations: toSimulationAuthorizations({
        owner: userAddress,
        requirements: await combined.getRequirements(),
      }),
      transactions: [
        {
          from: userAddress,
          to: combinedTx.to,
          data: combinedTx.data,
          value: combinedTx.value,
        },
      ],
    };
    const config = {
      timeoutMs: 30_000,
      chains: new Map([[1, { simulateV1Url: client.transport.url! }]]),
    };
    const operation: InputOperationLimit = {
      type: "blueRepayWithdrawCollateral",
      marketId: marketParams.id,
      inputs: { repay: fullRepay ? "full" : { shares }, collateralAssets: 1n },
    };
    await expect(
      simulate(config, {
        ...combinedParams,
        limits: { operations: [operation] },
      }),
    ).resolves.toBeDefined();
    await expect(
      simulate(config, {
        ...combinedParams,
        limits: {
          operations: [
            {
              ...operation,
              inputs: {
                repay: {
                  shares: (fullRepay ? positionData.borrowShares : shares) + 1n,
                },
                collateralAssets: 1n,
              },
            },
          ],
        },
      }),
    ).rejects.toBeInstanceOf(ConsumerLimitViolationError);
  }
  await check(client, [
    market.repay({ userAddress, deadline, positionData, repayShares: shares }),
    { type: "blueRepay", marketId: marketParams.id, inputs: { shares } },
    {
      type: "blueRepay",
      marketId: marketParams.id,
      inputs: { shares: shares + 1n },
    },
  ]);
  const full = market.repay({
    userAddress,
    deadline,
    positionData,
    repayShares: maxUint256,
  });
  const tx = full.buildTx();
  const result = await simulate(
    {
      timeoutMs: 30_000,
      chains: new Map([[1, { simulateV1Url: client.transport.url! }]]),
    },
    {
      chainId: 1,
      mode: "preview",
      authorizations: toSimulationAuthorizations({
        owner: userAddress,
        requirements: await full.getRequirements(),
      }),
      transactions: [
        { from: userAddress, to: tx.to, data: tx.data, value: tx.value },
      ],
      limits: {
        operations: [
          { type: "blueRepay", marketId: marketParams.id, inputs: "full" },
        ],
      },
    },
  );
  expect(
    result.verification.operations[0]?.checkedLimits.quote.sharesBurned,
  ).toBe(positionData.borrowShares);
});

test("all Blue input-derived operations round-trip; amount and subject mismatches fail", async ({
  client,
}) => {
  const market = client
    .extend(morphoViemExtension({ supportSignature: false }))
    .morpho.blue(marketParams, 1);
  const userAddress = client.account.address;
  const common = { userAddress, deadline: maxUint256 };
  await client.deal({ erc20: USDC, amount: 100_000_000n });
  await client.deal({ erc20: CBBTC, amount: 10_000_000n });
  await execute(client, market.supply({ ...common, assets: 20_000_000n }));
  await execute(
    client,
    market.supplyCollateralBorrow({
      ...common,
      positionData: await market.getPositionData(userAddress),
      collateralAssets: 5_000_000n,
      borrowAssets: 5_000_000n,
    }),
  );
  const positionData = await market.getPositionData(userAddress);
  const subject = { marketId: marketParams.id };
  const cases: readonly [Action, InputOperationLimit, InputOperationLimit][] = [
    [
      market.supply({ ...common, assets: 1_000_000n }),
      { ...subject, type: "blueSupply", inputs: { assets: 1_000_000n } },
      { ...subject, type: "blueSupply", inputs: { assets: 1_000_001n } },
    ],
    [
      market.withdraw({ ...common, positionData, assets: 1_000_000n }),
      { ...subject, type: "blueWithdraw", inputs: { assets: 1_000_000n } },
      { ...subject, type: "blueWithdraw", inputs: { assets: 1_000_001n } },
    ],
    [
      market.supplyCollateral({ ...common, collateralAssets: 100_000n }),
      {
        ...subject,
        type: "blueSupplyCollateral",
        inputs: { assets: 100_000n },
      },
      {
        ...subject,
        type: "blueSupplyCollateral",
        inputs: { assets: 100_001n },
      },
    ],
    [
      market.withdrawCollateral({
        ...common,
        positionData,
        collateralAssets: 100_000n,
      }),
      {
        ...subject,
        type: "blueWithdrawCollateral",
        inputs: { assets: 100_000n },
      },
      {
        ...subject,
        type: "blueWithdrawCollateral",
        inputs: { assets: 100_001n },
      },
    ],
    [
      market.borrow({ ...common, positionData, borrowAssets: 1_000_000n }),
      { ...subject, type: "blueBorrow", inputs: { assets: 1_000_000n } },
      { ...subject, type: "blueBorrow", inputs: { assets: 1_000_001n } },
    ],
    [
      market.repay({
        userAddress,
        positionData,
        deadline: BigInt(Math.floor(Date.now() / 1000)) + 3600n,
        repayAssets: 1_000_000n,
      }),
      { ...subject, type: "blueRepay", inputs: { assets: 1_000_000n } },
      { ...subject, type: "blueRepay", inputs: { assets: 1_000_001n } },
    ],
    [
      market.supplyCollateralBorrow({
        ...common,
        positionData,
        collateralAssets: 100_000n,
        borrowAssets: 1_000_000n,
      }),
      {
        ...subject,
        type: "blueSupplyCollateralBorrow",
        inputs: { collateralAssets: 100_000n, borrowAssets: 1_000_000n },
      },
      {
        ...subject,
        type: "blueSupplyCollateralBorrow",
        inputs: { collateralAssets: 100_001n, borrowAssets: 1_000_000n },
      },
    ],
    [
      market.repayWithdrawCollateral({
        userAddress,
        positionData,
        deadline: BigInt(Math.floor(Date.now() / 1000)) + 3600n,
        repayAssets: 1_000_000n,
        collateralAssets: 100_000n,
      }),
      {
        ...subject,
        type: "blueRepayWithdrawCollateral",
        inputs: { repay: { assets: 1_000_000n }, collateralAssets: 100_000n },
      },
      {
        ...subject,
        type: "blueRepayWithdrawCollateral",
        inputs: { repay: { assets: 1_000_001n }, collateralAssets: 100_000n },
      },
    ],
  ];
  for (const entry of cases) await check(client, entry);
  const withdrawal = cases[3]![0];
  const withdrawalTx = withdrawal.buildTx();
  const params = {
    chainId: 1,
    mode: "preview" as const,
    authorizations: toSimulationAuthorizations({
      owner: userAddress,
      requirements: await withdrawal.getRequirements(),
    }),
    transactions: [
      {
        from: userAddress,
        to: withdrawalTx.to,
        data: withdrawalTx.data,
        value: withdrawalTx.value,
      },
      {
        from: userAddress,
        to: getChainAddresses(1).blue,
        data: encodeFunctionData({
          abi: blueAbi,
          functionName: "borrow",
          args: [marketParams, 1_000_000n, 0n, userAddress, V1],
        }),
      },
    ],
  };
  const config = {
    timeoutMs: 30_000,
    chains: new Map([[1, { simulateV1Url: client.transport.url! }]]),
  };
  await expect(
    simulate(config, { ...params, limits: { operations: [cases[3]![1]] } }),
  ).rejects.toBeInstanceOf(ConsumerLimitViolationError);
  await expect(
    simulate(config, {
      ...params,
      limits: {
        operations: [
          {
            type: "blueWithdrawCollateral",
            marketId: marketParams.id,
            quote: { collateralWithdrawn: 100_000n, assetsReceived: 100_000n },
          },
        ],
      },
    }),
  ).resolves.toBeDefined();
  const supplyWithdrawal = cases[1]![0];
  const supplyWithdrawalTx = supplyWithdrawal.buildTx();
  await expect(
    simulate(config, {
      ...params,
      authorizations: toSimulationAuthorizations({
        owner: userAddress,
        requirements: await supplyWithdrawal.getRequirements(),
      }),
      transactions: [
        {
          from: userAddress,
          to: supplyWithdrawalTx.to,
          data: supplyWithdrawalTx.data,
          value: supplyWithdrawalTx.value,
        },
        {
          from: userAddress,
          to: getChainAddresses(1).blue,
          data: encodeFunctionData({
            abi: blueAbi,
            functionName: "withdrawCollateral",
            args: [marketParams, 1n, userAddress, V1],
          }),
        },
      ],
      limits: { operations: [cases[1]![1]] },
    }),
  ).rejects.toBeInstanceOf(ConsumerLimitViolationError);
  for (const [action, limit] of cases.slice(6)) {
    const tx = action.buildTx();
    await expect(
      simulate(config, {
        ...params,
        authorizations: toSimulationAuthorizations({
          owner: userAddress,
          requirements: await action.getRequirements(),
        }),
        transactions: [
          { from: userAddress, to: tx.to, data: tx.data, value: tx.value },
          {
            from: userAddress,
            to: getChainAddresses(1).blue,
            data: encodeFunctionData({
              abi: blueAbi,
              functionName: "withdraw",
              args: [marketParams, 1n, 0n, userAddress, V1],
            }),
          },
        ],
        limits: { operations: [limit] },
      }),
    ).rejects.toBeInstanceOf(ConsumerLimitViolationError);
  }
}, 180_000);

test("native input aliases verify real SDK wrapping and reject mismatched amounts", async ({
  client,
}) => {
  const nativeMarket = new MarketParams({
    collateralToken: "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0",
    loanToken: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    oracle: "0x2a01EB9496094dA03c4E364Def50f5aD1280AD72",
    irm: marketParams.irm,
    lltv: 945_000_000_000_000_000n,
  });
  const userAddress = client.account.address;
  const assets = 10n ** 18n;
  await client.setBalance({ address: userAddress, value: assets });
  const action = client
    .extend(morphoViemExtension({ supportSignature: false }))
    .morpho.blue(nativeMarket, 1)
    .supply({
      userAddress,
      assets,
      nativeAmount: assets,
      deadline: maxUint256,
    });
  const tx = action.buildTx();
  const config = {
    timeoutMs: 30_000,
    chains: new Map([[1, { simulateV1Url: client.transport.url! }]]),
  };
  const params = {
    chainId: 1,
    mode: "preview" as const,
    authorizations: toSimulationAuthorizations({
      owner: userAddress,
      requirements: await action.getRequirements(),
    }),
    transactions: [
      { from: userAddress, to: tx.to, data: tx.data, value: tx.value },
    ],
  };
  const limit = {
    type: "blueSupply" as const,
    marketId: nativeMarket.id,
    inputs: { assets },
    assetPaid: ethAddress,
  };
  await expect(
    simulate(config, { ...params, limits: { operations: [limit] } }),
  ).resolves.toBeDefined();
  await expect(
    simulate(config, {
      ...params,
      limits: { operations: [{ ...limit, inputs: { assets: assets - 1n } }] },
    }),
  ).rejects.toBeInstanceOf(ConsumerLimitViolationError);
  const implicitLimit = {
    type: "blueSupply" as const,
    marketId: nativeMarket.id,
    inputs: { assets },
  };
  await expect(
    simulate(config, { ...params, limits: { operations: [implicitLimit] } }),
  ).resolves.toBeDefined();
  await client.setBalance({ address: userAddress, value: assets + 1n });
  await expect(
    simulate(config, {
      ...params,
      transactions: [
        ...params.transactions,
        {
          from: userAddress,
          to: "0x000000000000000000000000000000000000dEaD",
          data: "0x",
          value: 1n,
        },
      ],
      limits: { operations: [implicitLimit] },
    }),
  ).rejects.toBeInstanceOf(ConsumerLimitViolationError);
}, 180_000);

test("borrows and withdrawals split across same-token markets fail while honest bundles pass", async ({
  client,
}) => {
  const otherParams = new MarketParams({
    ...marketParams,
    collateralToken: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",
    oracle: "0xDddd770BADd886dF3864029e4B377B5F6a2B6b83",
  });
  const morpho = client.extend(
    morphoViemExtension({ supportSignature: false }),
  ).morpho;
  const markets = [
    morpho.blue(marketParams, 1),
    morpho.blue(otherParams, 1),
  ] as const;
  const userAddress = client.account.address;
  const common = {
    userAddress,
    deadline: BigInt(Math.floor(Date.now() / 1000)) + 3600n,
  };
  await client.deal({ erc20: USDC, amount: 100_000_000n });
  for (const [index, params] of [marketParams, otherParams].entries()) {
    await client.deal({ erc20: params.collateralToken, amount: 10_000_000n });
    await execute(
      client,
      markets[index]!.supply({ ...common, assets: 20_000_000n }),
    );
    await execute(
      client,
      markets[index]!.supplyCollateral({
        ...common,
        collateralAssets: 5_000_000n,
      }),
    );
  }
  const position = await markets[0].getPositionData(userAddress);
  const otherPosition = await markets[1].getPositionData(userAddress);
  for (const type of [
    "blueBorrow",
    "blueSupplyCollateralBorrow",
    "blueWithdraw",
  ] as const) {
    const operation: InputOperationLimit =
      type === "blueSupplyCollateralBorrow"
        ? {
            type,
            marketId: marketParams.id,
            inputs: { collateralAssets: 100_000n, borrowAssets: 1_000_000n },
          }
        : { type, marketId: marketParams.id, inputs: { assets: 1_000_000n } };
    const honest =
      type === "blueWithdraw"
        ? markets[0].withdraw({
            ...common,
            positionData: position,
            assets: 1_000_000n,
          })
        : type === "blueSupplyCollateralBorrow"
          ? markets[0].supplyCollateralBorrow({
              ...common,
              positionData: position,
              collateralAssets: 100_000n,
              borrowAssets: 1_000_000n,
            })
          : markets[0].borrow({
              ...common,
              positionData: position,
              borrowAssets: 1_000_000n,
            });
    const tiny =
      type === "blueWithdraw"
        ? markets[0].withdraw({ ...common, positionData: position, assets: 1n })
        : type === "blueSupplyCollateralBorrow"
          ? markets[0].supplyCollateralBorrow({
              ...common,
              positionData: position,
              collateralAssets: 100_000n,
              borrowAssets: 1n,
            })
          : markets[0].borrow({
              ...common,
              positionData: position,
              borrowAssets: 1n,
            });
    const hidden =
      type === "blueWithdraw"
        ? markets[1].withdraw({
            ...common,
            positionData: otherPosition,
            assets: 999_999n,
          })
        : markets[1].borrow({
            ...common,
            positionData: otherPosition,
            borrowAssets: 999_999n,
          });
    // Both bundle legs share one Morpho authorization; repeated authorization reverts.
    for (const requirement of await honest.getRequirements())
      if ("to" in requirement)
        await client.sendTransaction({
          account: client.account,
          to: requirement.to,
          data: requirement.data,
        });
    for (const actions of [[honest], [tiny, hidden]]) {
      const requirements = (
        await Promise.all(actions.map((action) => action.getRequirements()))
      ).flat();
      const result = simulate(
        {
          timeoutMs: 30_000,
          chains: new Map([[1, { simulateV1Url: client.transport.url! }]]),
        },
        {
          chainId: 1,
          mode: "preview",
          authorizations: toSimulationAuthorizations({
            owner: userAddress,
            requirements,
          }),
          transactions: actions.map((action) => {
            const tx = action.buildTx();
            return {
              from: userAddress,
              to: tx.to,
              data: tx.data,
              value: tx.value,
            };
          }),
          limits: { operations: [operation] },
        },
      );
      if (actions.length === 1) await expect(result).resolves.toBeDefined();
      else
        await expect(result).rejects.toBeInstanceOf(
          ConsumerLimitViolationError,
        );
    }
  }
}, 180_000);

test("V1/V2 inputs derive without builder metadata; overlapping redemption wallets fail", async ({
  client,
}) => {
  const morpho = client.extend(
    morphoViemExtension({ supportSignature: false }),
  ).morpho;
  const userAddress = client.account.address;
  const deadline = BigInt(Math.floor(Date.now() / 1000)) + 3600n;
  await client.deal({ erc20: USDC, amount: 100_000_000n });
  for (const version of ["v1", "v2"] as const) {
    const vault = version === "v1" ? V1 : V2;
    const entity =
      version === "v1" ? morpho.vaultV1(vault, 1) : morpho.vaultV2(vault, 1);
    const deposit =
      version === "v1"
        ? morpho.vaultV1(vault, 1).deposit({
            amount: 10_000_000n,
            userAddress,
            deadline,
            vaultData: await morpho.vaultV1(vault, 1).getData(),
          })
        : morpho.vaultV2(vault, 1).deposit({
            amount: 10_000_000n,
            userAddress,
            deadline,
            vaultData: await morpho.vaultV2(vault, 1).getData(),
          });
    const depositType = version === "v1" ? "vaultV1Deposit" : "vaultV2Deposit";
    await check(client, [
      deposit,
      { type: depositType, vault, inputs: { assets: 10_000_000n } },
      { type: depositType, vault, inputs: { assets: 10_000_001n } },
    ]);
    await execute(client, deposit);
    const withdraw =
      version === "v1"
        ? morpho.vaultV1(vault, 1).withdraw({
            amount: 1_000_000n,
            userAddress,
            deadline,
            vaultData: await morpho.vaultV1(vault, 1).getData(),
          })
        : morpho.vaultV2(vault, 1).withdraw({
            amount: 1_000_000n,
            userAddress,
            deadline,
            vaultData: await morpho.vaultV2(vault, 1).getData(),
          });
    const withdrawType =
      version === "v1" ? "vaultV1Withdraw" : "vaultV2Withdraw";
    await check(client, [
      withdraw,
      { type: withdrawType, vault, inputs: { assets: 1_000_000n } },
      { type: withdrawType, vault, inputs: { assets: 1_000_001n } },
    ]);
    const shares =
      (await client.readContract({
        address: vault,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [userAddress],
      })) / 10n;
    const redeemType = version === "v1" ? "vaultV1Redeem" : "vaultV2Redeem";
    await check(client, [
      entity.redeem({ shares, userAddress, deadline }),
      { type: redeemType, vault, inputs: { shares } },
      { type: redeemType, vault, inputs: { shares: shares + 1n } },
    ]);
  }
}, 180_000);

test("assets-mode migration rejects a different V1 source vault", async ({
  client,
}) => {
  const actualSource: Address = "0xdd0f28e19C1780eb6396170735D45153D261490d";
  const morpho = client.extend(
    morphoViemExtension({ supportSignature: false }),
  ).morpho;
  const source = morpho.vaultV1(actualSource, 1);
  const target = morpho.vaultV2(V2, 1);
  const userAddress = client.account.address;
  const deadline = BigInt(Math.floor(Date.now() / 1000)) + 3600n;
  await client.deal({ erc20: USDC, amount: 10_000_000n });
  await execute(
    client,
    source.deposit({
      amount: 10_000_000n,
      userAddress,
      deadline,
      vaultData: await source.getData(),
    }),
  );
  const action = source.migrateToV2({
    assets: 1_000_000n,
    userAddress,
    deadline,
    sourceVault: await source.getData(),
    targetVault: await target.getData(),
  });
  const tx = action.buildTx();
  const params = {
    chainId: 1,
    mode: "preview" as const,
    authorizations: toSimulationAuthorizations({
      owner: userAddress,
      requirements: await action.getRequirements(),
    }),
    transactions: [
      { from: userAddress, to: tx.to, data: tx.data, value: tx.value },
    ],
  };
  const config = {
    timeoutMs: 30_000,
    chains: new Map([[1, { simulateV1Url: client.transport.url! }]]),
  };
  const operation: InputOperationLimit = {
    type: "vaultV1MigrateToV2",
    sourceVault: actualSource,
    targetVault: V2,
    inputs: { assets: 1_000_000n },
  };
  await expect(
    simulate(config, {
      ...params,
      limits: { operations: [operation] },
    }),
  ).resolves.toBeDefined();
  await expect(
    simulate(config, {
      ...params,
      limits: { operations: [{ ...operation, sourceVault: V1 }] },
    }),
  ).rejects.toBeInstanceOf(ConsumerLimitViolationError);
}, 180_000);

test("migration derives both assets and shares modes, net of referral fee", async ({
  client,
}) => {
  const morpho = client.extend(
    morphoViemExtension({ supportSignature: false }),
  ).morpho;
  const source = morpho.vaultV1(V1, 1);
  const target = morpho.vaultV2(V2, 1);
  const userAddress = client.account.address;
  const deadline = BigInt(Math.floor(Date.now() / 1000)) + 3600n;
  await client.deal({ erc20: USDC, amount: 20_000_000n });
  await execute(
    client,
    source.deposit({
      amount: 10_000_000n,
      userAddress,
      deadline,
      vaultData: await source.getData(),
    }),
  );
  const shares =
    (await client.readContract({
      address: V1,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [userAddress],
    })) / 10n;
  for (const inputs of [{ assets: 1_000_000n }, { shares }] as const) {
    const referralFee = 10n ** 14n;
    const action = source.migrateToV2({
      ...inputs,
      userAddress,
      deadline,
      sourceVault: await source.getData(),
      targetVault: await target.getData(),
      referralFeePct: referralFee,
      referralFeeRecipient: "0x000000000000000000000000000000000000dEaD",
    });
    const operation: InputOperationLimit = {
      type: "vaultV1MigrateToV2",
      sourceVault: V1,
      targetVault: V2,
      inputs,
      referralFee,
    };
    const wrongAmount: InputOperationLimit = {
      ...operation,
      inputs:
        inputs.assets !== undefined
          ? { assets: inputs.assets * 2n }
          : { shares: inputs.shares * 2n },
    };
    await check(client, [action, operation, wrongAmount]);
  }
}, 180_000);

test("migration into a target holding the source fails closed on any adverse conversion shift", async ({
  client,
}) => {
  const userAddress = client.account.address;
  const addresses = getChainAddresses(1);
  const creation = await client.writeContract({
    address: addresses.vaultV2Factory!,
    abi: vaultV2FactoryAbi,
    functionName: "createVaultV2",
    args: [userAddress, USDC, zeroHash],
  });
  const receipt = await client.waitForTransactionReceipt({ hash: creation });
  const targetVault = parseEventLogs({
    abi: vaultV2FactoryAbi,
    eventName: "CreateVaultV2",
    logs: receipt.logs,
  })[0]!.args.newVaultV2;
  await client.writeContract({
    address: targetVault,
    abi: vaultV2Abi,
    functionName: "setCurator",
    args: [userAddress],
  });
  await client.writeContract({
    address: addresses.morphoVaultV1AdapterFactory!,
    abi: morphoVaultV1AdapterFactoryAbi,
    functionName: "createMorphoVaultV1Adapter",
    args: [targetVault, V1],
  });
  const adapter = await client.readContract({
    address: addresses.morphoVaultV1AdapterFactory!,
    abi: morphoVaultV1AdapterFactoryAbi,
    functionName: "morphoVaultV1Adapter",
    args: [targetVault, V1],
  });
  await govern(
    { client, vault: targetVault },
    encodeFunctionData({
      abi: vaultV2Abi,
      functionName: "addAdapter",
      args: [adapter],
    }),
  );
  await govern(
    { client, vault: targetVault },
    encodeFunctionData({
      abi: vaultV2Abi,
      functionName: "setIsAllocator",
      args: [userAddress, true],
    }),
  );
  const cap = encodeAbiParameters(
    [{ type: "string" }, { type: "address" }],
    ["this", adapter],
  );
  await govern(
    { client, vault: targetVault },
    encodeFunctionData({
      abi: vaultV2Abi,
      functionName: "increaseAbsoluteCap",
      args: [cap, maxUint128],
    }),
  );
  await govern(
    { client, vault: targetVault },
    encodeFunctionData({
      abi: vaultV2Abi,
      functionName: "increaseRelativeCap",
      args: [cap, MathLib.WAD],
    }),
  );
  await client.writeContract({
    address: targetVault,
    abi: vaultV2Abi,
    functionName: "setLiquidityAdapterAndData",
    args: [adapter, "0x"],
  });
  await client.deal({ erc20: USDC, amount: 200_000_000n });
  await client.writeContract({
    address: USDC,
    abi: erc20Abi,
    functionName: "approve",
    args: [targetVault, maxUint256],
  });
  await client.writeContract({
    address: targetVault,
    abi: vaultV2Abi,
    functionName: "deposit",
    args: [100_000_000n, userAddress],
  });
  expect(
    await client.readContract({
      address: V1,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [adapter],
    }),
  ).toBeGreaterThan(0n);
  const morpho = client.extend(
    morphoViemExtension({ supportSignature: false }),
  ).morpho;
  const source = morpho.vaultV1(V1, 1);
  const deadline = BigInt(Math.floor(Date.now() / 1000)) + 3600n;
  await execute(
    client,
    source.deposit({
      amount: 20_000_000n,
      userAddress,
      deadline,
      vaultData: await source.getData(),
    }),
  );
  const assets = 1_000_001n;
  const action = source.migrateToV2({
    assets,
    userAddress,
    deadline,
    sourceVault: await source.getData(),
    targetVault: await morpho.vaultV2(targetVault, 1).getData(),
  });
  const tx = action.buildTx();
  const authorizations = toSimulationAuthorizations({
    owner: userAddress,
    requirements: await action.getRequirements(),
  });
  const block = await client.getBlock();
  const expected = await client.readContract({
    address: targetVault,
    abi: erc4626Abi,
    functionName: "previewDeposit",
    args: [assets],
    blockNumber: block.number,
  });
  const params = {
    chainId: 1,
    mode: "preview" as const,
    blockNumber: block.number,
    authorizations,
    transactions: [
      { from: userAddress, to: tx.to, data: tx.data, value: tx.value },
    ],
  };
  const config = {
    timeoutMs: 30_000,
    chains: new Map([[1, { simulateV1Url: client.transport.url! }]]),
  };
  const operation: InputOperationLimit = {
    type: "vaultV1MigrateToV2",
    sourceVault: V1,
    targetVault,
    inputs: { assets },
  };
  const quoted = await simulate(config, {
    ...params,
    limits: { operations: [{ ...operation, quote: { sharesMinted: 1n } }] },
  });
  const actual = quoted.assetChanges
    .find(({ account }) => isAddressEqual(account, userAddress))
    ?.changes.find(({ token }) => isAddressEqual(token, targetVault))?.diff;
  expect(actual).toBeDefined();
  console.info("migration target rounding", { expected, actual });
  if (actual! < expected)
    await expect(
      simulate(config, { ...params, limits: { operations: [operation] } }),
    ).rejects.toBeInstanceOf(ConsumerLimitViolationError);
  else
    await expect(
      simulate(config, { ...params, limits: { operations: [operation] } }),
    ).resolves.toBeDefined();
}, 180_000);

test("allocator penalties precede referral fees; undeclared charges fail", async ({
  client,
}) => {
  const userAddress = client.account.address;
  const addresses = getChainAddresses(1);
  const allocator = addresses.vaultV2BluePublicAllocator!;
  const creation = await client.writeContract({
    address: addresses.vaultV2Factory!,
    abi: vaultV2FactoryAbi,
    functionName: "createVaultV2",
    args: [userAddress, USDC, zeroHash],
  });
  const receipt = await client.waitForTransactionReceipt({ hash: creation });
  const vault = parseEventLogs({
    abi: vaultV2FactoryAbi,
    eventName: "CreateVaultV2",
    logs: receipt.logs,
  })[0]!.args.newVaultV2;
  await client.writeContract({
    address: vault,
    abi: vaultV2Abi,
    functionName: "setCurator",
    args: [userAddress],
  });
  const adapterTx = await client.writeContract({
    address: addresses.morphoMarketV1AdapterV2Factory!,
    abi: morphoMarketV1AdapterV2FactoryAbi,
    functionName: "createMorphoMarketV1AdapterV2",
    args: [vault],
  });
  const adapterReceipt = await client.waitForTransactionReceipt({
    hash: adapterTx,
  });
  const adapter = parseEventLogs({
    abi: morphoMarketV1AdapterV2FactoryAbi,
    eventName: "CreateMorphoMarketV1AdapterV2",
    logs: adapterReceipt.logs,
  })[0]!.args.morphoMarketV1AdapterV2;
  await govern(
    { client, vault },
    encodeFunctionData({
      abi: vaultV2Abi,
      functionName: "addAdapter",
      args: [adapter],
    }),
  );
  await govern(
    { client, vault },
    encodeFunctionData({
      abi: vaultV2Abi,
      functionName: "setIsAllocator",
      args: [allocator, true],
    }),
  );
  await govern(
    { client, vault },
    encodeFunctionData({
      abi: vaultV2Abi,
      functionName: "setIsAllocator",
      args: [userAddress, true],
    }),
  );
  const ids = [
    encodeAbiParameters(
      [{ type: "string" }, { type: "address" }],
      ["this", adapter],
    ),
    encodeAbiParameters(
      [{ type: "string" }, { type: "address" }],
      ["collateralToken", CBBTC],
    ),
    encodeAbiParameters(
      [{ type: "string" }, { type: "address" }, marketParamsAbi],
      ["this/marketParams", adapter, marketParams],
    ),
  ];
  for (const id of ids) {
    await govern(
      { client, vault },
      encodeFunctionData({
        abi: vaultV2Abi,
        functionName: "increaseAbsoluteCap",
        args: [id, maxUint128],
      }),
    );
    await govern(
      { client, vault },
      encodeFunctionData({
        abi: vaultV2Abi,
        functionName: "increaseRelativeCap",
        args: [id, MathLib.WAD],
      }),
    );
  }
  await client.writeContract({
    address: allocator,
    abi: vaultV2BluePublicAllocatorAbi,
    functionName: "setIsActiveAdapter",
    args: [vault, adapter, true],
  });
  await client.writeContract({
    address: allocator,
    abi: vaultV2BluePublicAllocatorAbi,
    functionName: "setAbsoluteCap",
    args: [vault, adapter, marketParams, maxUint128],
  });
  await client.writeContract({
    address: allocator,
    abi: vaultV2BluePublicAllocatorAbi,
    functionName: "setCanPullFromIdle",
    args: [vault, true],
  });
  const penalty = MathLib.WAD / 100n;
  await client.writeContract({
    address: allocator,
    abi: vaultV2BluePublicAllocatorAbi,
    functionName: "setPenalty",
    args: [vault, penalty],
  });
  await client.deal({ erc20: USDC, amount: 100_000_000n });
  await client.writeContract({
    address: USDC,
    abi: erc20Abi,
    functionName: "approve",
    args: [vault, maxUint256],
  });
  await client.writeContract({
    address: vault,
    abi: vaultV2Abi,
    functionName: "deposit",
    args: [100_000_000n, userAddress],
  });
  await client.deal({ erc20: CBBTC, amount: 5_000_000n });
  const market = client
    .extend(morphoViemExtension({ supportSignature: false }))
    .morpho.blue(marketParams, 1);
  const deadline = BigInt(Math.floor(Date.now() / 1000)) + 3600n;
  await execute(
    client,
    market.supplyCollateral({
      userAddress,
      deadline,
      collateralAssets: 5_000_000n,
    }),
  );
  const block = await client.getBlock();
  const data = await market.getVaultV2BlueReallocationData({
    vaultAddresses: [vault],
    block,
  });
  const discovery = data.computeVaultV2BlueReallocations(marketParams.id, {
    timestamp: block.timestamp,
    maxPenalty: penalty,
  });
  const reallocation = discovery.reallocations.find(
    ({ from }) => from.type === "idle",
  )!;
  expect(reallocation).toBeDefined();
  const reallocationPenalty = MathLib.wMulUp(
    reallocation.assets,
    reallocation.penalty,
  );
  expect(reallocationPenalty).toBeGreaterThan(0n);
  const referralFeeRecipient = "0x000000000000000000000000000000000000dEaD";
  const borrowAssets = 5_000_000n;
  for (const referralFee of [0n, MathLib.WAD / 100n]) {
    const action = market.borrow({
      userAddress,
      deadline,
      positionData: await market.getPositionData(userAddress),
      borrowAssets,
      reallocations: [reallocation],
      referralFeePct: referralFee,
      referralFeeRecipient,
    });
    const tx = action.buildTx();
    const params = {
      chainId: 1,
      mode: "preview" as const,
      authorizations: toSimulationAuthorizations({
        owner: userAddress,
        requirements: await action.getRequirements(),
      }),
      transactions: [
        { from: userAddress, to: tx.to, data: tx.data, value: tx.value },
      ],
    };
    const config = {
      timeoutMs: 30_000,
      chains: new Map([[1, { simulateV1Url: client.transport.url! }]]),
    };
    const operation: InputOperationLimit = {
      type: "blueBorrow",
      marketId: marketParams.id,
      inputs: { assets: borrowAssets },
      reallocationPenalty,
      referralFee,
    };
    const result = await simulate(config, {
      ...params,
      limits: { operations: [operation] },
    });
    const remaining = borrowAssets - reallocationPenalty;
    const feeAssets = MathLib.wMulDown(remaining, referralFee);
    const assetsReceived = result.assetChanges
      .find(({ account }) => isAddressEqual(account, userAddress))
      ?.changes.find(({ token }) => isAddressEqual(token, USDC))?.diff;
    expect(assetsReceived).toBe(remaining - feeAssets);
    if (referralFee > 0n) {
      expect(feeAssets).toBeGreaterThan(0n);
      expect(assetsReceived).not.toBe(
        remaining - MathLib.wMulDown(borrowAssets, referralFee),
      );
      expect(
        result.assetChanges
          .find(({ account }) => isAddressEqual(account, referralFeeRecipient))
          ?.changes.find(({ token }) => isAddressEqual(token, USDC))?.diff,
      ).toBe(feeAssets);
      await expect(
        simulate(config, {
          ...params,
          limits: { operations: [{ ...operation, referralFee: undefined }] },
        }),
      ).rejects.toBeInstanceOf(ConsumerLimitViolationError);
    }
    await expect(
      simulate(config, {
        ...params,
        limits: {
          operations: [{ ...operation, reallocationPenalty: undefined }],
        },
      }),
    ).rejects.toBeInstanceOf(ConsumerLimitViolationError);
  }
}, 180_000);
