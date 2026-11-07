import { getChainAddresses, MarketParams } from "@morpho-org/blue-sdk";
import { morphoViemExtension } from "@morpho-org/morpho-sdk";
import { blueAbi } from "@morpho-org/morpho-sdk/abis";
import { markets } from "@morpho-org/morpho-test";
import { type AnvilTestClient, getErpcForkUrl } from "@morpho-org/test";
import { createViemTest } from "@morpho-org/test/vitest";
import {
  type Address,
  encodeAbiParameters,
  encodeEventTopics,
  encodeFunctionData,
  erc20Abi,
  isAddressEqual,
  maxUint256,
  parseUnits,
} from "viem";
import { mainnet } from "viem/chains";
import { expect } from "vitest";
import {
  simulate,
  toSimulationAuthorizations,
  UnexpectedMorphoAuthorizationError,
  UnexpectedTokenApprovalError,
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
const STEAKHOUSE: Address = "0xBEEF01735c132Ada46AA9aA4c54623cAA92A64CB";
const UNKNOWN_SPENDER: Address = "0x0000000000000000000000000000000000000Bad";

const CbbtcUsdcBlue = new MarketParams({
  collateralToken: CBBTC,
  loanToken: USDC,
  oracle: "0xA6D6950c9F177F1De7f7757FB33539e3Ec60182a",
  irm: "0x870aC11D48B15DB9a138Cf899d20F13F79Ba00BC",
  lltv: 860_000_000_000_000_000n,
});

const configFor = (client: { transport: { url?: string } }) => ({
  chains: new Map([[mainnet.id, { simulateV1Url: client.transport.url! }]]),
});

const expectTokenApprovalFailure = async (
  simulation: Promise<unknown>,
  fields: {
    readonly token: Address;
    readonly owner: Address;
    readonly spender: Address;
    readonly source: "event" | "authorization";
  },
) => {
  const error = await simulation.then(
    () => undefined,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(UnexpectedTokenApprovalError);
  if (!(error instanceof UnexpectedTokenApprovalError)) return;
  expect(error.source).toBe(fields.source);
  expect(isAddressEqual(error.token, fields.token)).toBe(true);
  expect(isAddressEqual(error.owner, fields.owner)).toBe(true);
  expect(isAddressEqual(error.spender, fields.spender)).toBe(true);
};

describe.sequential("simulate approval allowlist", () => {
  test("rejects an unrelated-token approval alongside a vault deposit", async ({
    client,
  }) => {
    const morpho = client.extend(
      morphoViemExtension({ supportSignature: false }),
    ).morpho;
    const vault = morpho.vaultV1(STEAKHOUSE, mainnet.id);
    const assets = parseUnits("10", 6);
    await client.deal({ erc20: USDC, amount: assets });
    const vaultData = await vault.getData();
    const deposit = vault.deposit({
      amount: assets,
      userAddress: client.account.address,
      vaultData,
      slippageTolerance: 0n,
      deadline: BigInt(Math.floor(Date.now() / 1_000)) + 3600n,
    });
    for (const requirement of await deposit.getRequirements()) {
      if (!("to" in requirement)) continue;
      await client.sendTransaction({
        account: client.account,
        to: requirement.to,
        data: requirement.data,
        value: requirement.value,
      });
    }
    const approval = {
      from: client.account.address,
      to: CBBTC,
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: "approve",
        args: [UNKNOWN_SPENDER, maxUint256],
      }),
    };
    const transaction = deposit.buildTx();
    await expectTokenApprovalFailure(
      simulate(configFor(client), {
        chainId: mainnet.id,
        limits: {
          operations: [
            {
              type: "vaultV1Deposit",
              vault: STEAKHOUSE,
              quote: { assetsPaid: assets, sharesMinted: 1n },
              slippageTolerance: 0n,
            },
          ],
        },
        transactions: [
          approval,
          {
            from: client.account.address,
            to: transaction.to,
            data: transaction.data,
            value: transaction.value,
          },
        ],
      }),
      {
        token: CBBTC,
        owner: client.account.address,
        spender: UNKNOWN_SPENDER,
        source: "event",
      },
    );
  }, 120_000);

  test("rejects an unknown-spender approval of the vault asset", async ({
    client,
  }) => {
    const morpho = client.extend(
      morphoViemExtension({ supportSignature: false }),
    ).morpho;
    const vault = morpho.vaultV1(STEAKHOUSE, mainnet.id);
    const assets = parseUnits("10", 6);
    await client.deal({ erc20: USDC, amount: assets });
    const vaultData = await vault.getData();
    const deposit = vault.deposit({
      amount: assets,
      userAddress: client.account.address,
      vaultData,
      slippageTolerance: 0n,
      deadline: BigInt(Math.floor(Date.now() / 1_000)) + 3600n,
    });
    for (const requirement of await deposit.getRequirements()) {
      if (!("to" in requirement)) continue;
      await client.sendTransaction({
        account: client.account,
        to: requirement.to,
        data: requirement.data,
        value: requirement.value,
      });
    }
    const approval = {
      from: client.account.address,
      to: USDC,
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: "approve",
        args: [UNKNOWN_SPENDER, maxUint256],
      }),
    };
    const transaction = deposit.buildTx();
    await expectTokenApprovalFailure(
      simulate(configFor(client), {
        chainId: mainnet.id,
        limits: {
          operations: [
            {
              type: "vaultV1Deposit",
              vault: STEAKHOUSE,
              quote: { assetsPaid: assets, sharesMinted: 1n },
              slippageTolerance: 0n,
            },
          ],
        },
        transactions: [
          approval,
          {
            from: client.account.address,
            to: transaction.to,
            data: transaction.data,
            value: transaction.value,
          },
        ],
      }),
      {
        token: USDC,
        owner: client.account.address,
        spender: UNKNOWN_SPENDER,
        source: "event",
      },
    );
  }, 120_000);

  test("rejects a Morpho authorization for an unknown address alongside a borrow", async ({
    client,
  }) => {
    const morpho = client
      .extend(morphoViemExtension({ supportSignature: false }))
      .morpho.blue(CbbtcUsdcBlue, mainnet.id);
    const collateralAssets = parseUnits("0.05", 8);
    const borrowAssets = parseUnits("5", 6);
    await client.deal({ erc20: CBBTC, amount: collateralAssets });

    const action = morpho.supplyCollateralBorrow({
      userAddress: client.account.address,
      collateralAssets,
      borrowAssets,
      positionData: await morpho.getPositionData(client.account.address),
      deadline: maxUint256,
    });
    const requirements = await action.getRequirements();
    const authorizations = toSimulationAuthorizations({
      owner: client.account.address,
      requirements,
    });
    const addresses = getChainAddresses(mainnet.id)!;
    const tx = action.buildTx();
    const error = await simulate(configFor(client), {
      chainId: mainnet.id,
      mode: "preview",
      authorizations,
      limits: {
        operations: [
          {
            type: "blueSupplyCollateralBorrow",
            marketId: CbbtcUsdcBlue.id,
            quote: {
              assetsReceived: borrowAssets,
              assetsPaid: collateralAssets,
              collateralSupplied: 1n,
              sharesMinted:
                (await morpho.getMarketData()).toBorrowShares(
                  borrowAssets,
                  "Up",
                ) * 2n,
            },
            slippageTolerance: 0n,
          },
        ],
      },
      transactions: [
        {
          from: client.account.address,
          to: addresses.blue,
          data: encodeFunctionData({
            abi: blueAbi,
            functionName: "setAuthorization",
            args: [UNKNOWN_SPENDER, true],
          }),
        },
        {
          from: client.account.address,
          to: tx.to,
          data: tx.data,
          value: tx.value,
        },
      ],
    }).then(
      () => undefined,
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(UnexpectedMorphoAuthorizationError);
    expect(error).toMatchObject({
      authorizer: client.account.address,
      authorized: UNKNOWN_SPENDER,
      source: "event",
    });
  }, 120_000);

  test("allows the collateral Approval re-emitted by a zero-collateral borrow", async ({
    client,
  }) => {
    const addresses = getChainAddresses(mainnet.id)!;
    const blueBundles = addresses.bundles!.blueBundlesV1!;
    const marketParams = markets[mainnet.id].usdt_wstEth;
    const market = client
      .extend(morphoViemExtension({ supportSignature: false }))
      .morpho.blue(marketParams, mainnet.id);
    const collateralAssets = parseUnits("0.1", 18);
    const borrowAssets = parseUnits("5", 6);

    await client.deal({
      erc20: marketParams.collateralToken,
      amount: collateralAssets,
    });
    await client.writeContract({
      account: client.account,
      address: marketParams.collateralToken,
      abi: erc20Abi,
      functionName: "approve",
      args: [addresses.blue, maxUint256],
    });
    await client.writeContract({
      account: client.account,
      address: addresses.blue,
      abi: blueAbi,
      functionName: "supplyCollateral",
      args: [marketParams, collateralAssets, client.account.address, "0x"],
    });
    await client.writeContract({
      account: client.account,
      address: marketParams.collateralToken,
      abi: erc20Abi,
      functionName: "approve",
      args: [blueBundles, maxUint256],
    });

    const positionData = await market.getPositionData(client.account.address);
    const action = market.borrow({
      userAddress: client.account.address,
      borrowAssets,
      positionData,
      deadline: maxUint256,
    });
    const requirements = await action.getRequirements();
    const authorizations = toSimulationAuthorizations({
      owner: client.account.address,
      requirements,
    });
    const tx = action.buildTx();
    const result = await simulate(configFor(client), {
      chainId: mainnet.id,
      mode: "preview",
      authorizations,
      limits: {
        operations: [
          {
            type: "blueBorrow",
            marketId: marketParams.id,
            quote: {
              assetsReceived: borrowAssets,
              sharesMinted:
                (await market.getMarketData()).toBorrowShares(
                  borrowAssets,
                  "Up",
                ) * 2n,
            },
            slippageTolerance: 0n,
          },
        ],
      },
      transactions: [
        {
          from: client.account.address,
          to: tx.to,
          data: tx.data,
          value: tx.value,
        },
      ],
    });

    const approvalTopics = encodeEventTopics({
      abi: erc20Abi,
      eventName: "Approval",
      args: { owner: client.account.address, spender: blueBundles },
    });
    const approvalData = encodeAbiParameters([{ type: "uint256" }] as const, [
      maxUint256,
    ]);
    expect(
      result.calls
        .flatMap(({ logs }) => logs)
        .some(
          (log) =>
            isAddressEqual(log.address, marketParams.collateralToken) &&
            log.topics[0] === approvalTopics[0] &&
            log.topics[1] === approvalTopics[1] &&
            log.topics[2] === approvalTopics[2] &&
            log.data === approvalData,
        ),
    ).toBe(true);
  }, 120_000);

  test("allows approve(0) for the derived VaultBundlesV1 spender", async ({
    client,
  }) => {
    const vault = client
      .extend(morphoViemExtension({ supportSignature: false }))
      .morpho.vaultV1(STEAKHOUSE, mainnet.id);
    const assets = parseUnits("10", 6);
    await client.deal({ erc20: USDC, amount: assets });
    const vaultData = await vault.getData();
    const deposit = vault.deposit({
      amount: assets,
      userAddress: client.account.address,
      vaultData,
      slippageTolerance: 0n,
      deadline: BigInt(Math.floor(Date.now() / 1_000)) + 3600n,
    });
    for (const requirement of await deposit.getRequirements()) {
      if (!("to" in requirement)) continue;
      await client.sendTransaction({
        account: client.account,
        to: requirement.to,
        data: requirement.data,
        value: requirement.value,
      });
    }
    const transaction = deposit.buildTx();
    const addresses = getChainAddresses(mainnet.id)!;
    const result = await simulate(configFor(client), {
      chainId: mainnet.id,
      limits: {
        operations: [
          {
            type: "vaultV1Deposit",
            vault: STEAKHOUSE,
            quote: { assetsPaid: assets, sharesMinted: 1n },
            slippageTolerance: 0n,
          },
        ],
      },
      transactions: [
        {
          from: client.account.address,
          to: transaction.to,
          data: transaction.data,
          value: transaction.value,
        },
        {
          from: client.account.address,
          to: USDC,
          data: encodeFunctionData({
            abi: erc20Abi,
            functionName: "approve",
            args: [addresses.bundles!.vaultBundlesV1!, 0n],
          }),
        },
      ],
    });
    expect(result.calls).toHaveLength(2);
  }, 120_000);

  test("rejects an unrelated ERC-2612 preview permit spender", async ({
    client,
  }) => {
    const vault = client
      .extend(morphoViemExtension({ supportSignature: false }))
      .morpho.vaultV1(STEAKHOUSE, mainnet.id);
    const assets = parseUnits("10", 6);
    await client.deal({ erc20: USDC, amount: assets });
    const vaultData = await vault.getData();
    const deposit = vault.deposit({
      amount: assets,
      userAddress: client.account.address,
      vaultData,
      slippageTolerance: 0n,
      deadline: BigInt(Math.floor(Date.now() / 1_000)) + 3600n,
    });
    const transaction = deposit.buildTx();
    await expectTokenApprovalFailure(
      simulate(configFor(client), {
        chainId: mainnet.id,
        mode: "preview",
        authorizations: [
          {
            type: "erc2612Permit",
            typedData: {
              domain: {
                name: "USD Coin",
                version: "2",
                chainId: mainnet.id,
                verifyingContract: USDC,
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
                spender: UNKNOWN_SPENDER,
                value: 1n,
                nonce: 0n,
                deadline: maxUint256,
              },
            },
          },
        ],
        limits: {
          operations: [
            {
              type: "vaultV1Deposit",
              vault: STEAKHOUSE,
              quote: { assetsPaid: assets, sharesMinted: 1n },
              slippageTolerance: 0n,
            },
          ],
        },
        transactions: [
          {
            from: client.account.address,
            to: transaction.to,
            data: transaction.data,
            value: transaction.value,
          },
        ],
      }),
      {
        token: USDC,
        owner: client.account.address,
        spender: UNKNOWN_SPENDER,
        source: "authorization",
      },
    );
  }, 120_000);
});
