import {
  ChainId,
  Market,
  MathLib,
  addressesRegistry,
} from "@morpho-org/blue-sdk";
import { markets, vaults } from "@morpho-org/morpho-test";
import {
  type MinimalBlock,
  SimulationState,
  simulateOperations,
} from "@morpho-org/simulation-sdk";
import { renderHook, waitFor } from "@morpho-org/test-wagmi";
import _ from "lodash";
import { erc20Abi, parseEther, zeroAddress } from "viem";
import { describe, expect } from "vitest";
import { useSimulationState } from "../../src/index.js";
import { test } from "../setup.js";

const {
  morpho,
  bundler3: { generalAdapter1 },
  permit2,
  usdc,
} = addressesRegistry[ChainId.EthMainnet];
const { usdc_wstEth } = markets[ChainId.EthMainnet];
const { steakUsdc } = vaults[ChainId.EthMainnet];

describe("useSimulationState", () => {
  test("should resolve pending when no block requested", async ({ config }) => {
    const { result } = await renderHook(config, () =>
      useSimulationState({
        marketIds: [],
        users: [],
        tokens: [],
        vaults: [],
        vaultV2Adapters: [],
        vaultV2s: [],
      }),
    );

    expect(result.current).toEqual({
      data: undefined,
      error: {},
      isFetching: {},
      isFetchingAny: false,
      isPending: true,
    });
  });

  test("should resolve empty when requested empty", async ({
    config,
    client,
  }) => {
    const block = await client.getBlock();

    const { result } = await renderHook(config, () =>
      useSimulationState({
        marketIds: [],
        users: [],
        tokens: [],
        vaults: [],
        vaultV2Adapters: [],
        vaultV2s: [],
        block,
      }),
    );

    expect(result.current).toStrictEqual({
      data: new SimulationState({
        chainId: ChainId.EthMainnet,
        block,
        global: {
          feeRecipient: undefined,
        },
        markets: {},
        tokens: {},
        users: {},
        positions: {},
        holdings: {},
        vaults: {},
        vaultUsers: {},
        vaultMarketConfigs: {},
      }),
      error: {
        global: {
          feeRecipient: null,
        },
        markets: {},
        tokens: {},
        users: {},
        positions: {},
        holdings: {},
        vaults: {},
        vaultUsers: {},
        vaultMarketConfigs: {},
        vaultV2Adapters: {},
        vaultV2s: {},
      },
      isFetching: {
        global: {
          feeRecipient: true,
        },
        markets: {},
        tokens: {},
        users: {},
        positions: {},
        holdings: {},
        vaults: {},
        vaultUsers: {},
        vaultMarketConfigs: {},
        vaultV2Adapters: {},
        vaultV2s: {},
      },
      isFetchingAny: true,
      isPending: false,
    });

    await waitFor(() => expect(result.current.isFetchingAny).toBeFalsy());

    expect(result.current).toStrictEqual({
      data: new SimulationState({
        chainId: ChainId.EthMainnet,
        block,
        global: {
          feeRecipient: zeroAddress,
        },
        markets: {},
        tokens: {},
        users: {},
        positions: {},
        holdings: {},
      }),
      error: {
        global: {
          feeRecipient: null,
        },
        markets: {},
        tokens: {},
        users: {},
        positions: {},
        holdings: {},
        vaults: {},
        vaultUsers: {},
        vaultMarketConfigs: {},
        vaultV2Adapters: {},
        vaultV2s: {},
      },
      isFetching: {
        global: {
          feeRecipient: false,
        },
        markets: {},
        tokens: {},
        users: {},
        positions: {},
        holdings: {},
        vaults: {},
        vaultUsers: {},
        vaultMarketConfigs: {},
        vaultV2Adapters: {},
        vaultV2s: {},
      },
      isFetchingAny: false,
      isPending: false,
    });
  });

  test("should resolve when market requested twice", async ({
    config,
    client,
  }) => {
    const block = await client.getBlock();

    const { result } = await renderHook(config, () =>
      useSimulationState({
        marketIds: [usdc_wstEth.id, usdc_wstEth.id],
        users: [],
        tokens: [],
        vaults: [],
        vaultV2Adapters: [],
        vaultV2s: [],
        block,
      }),
    );

    expect(result.current).toStrictEqual({
      data: new SimulationState({
        chainId: ChainId.EthMainnet,
        block,
        global: {
          feeRecipient: undefined,
        },
        markets: {
          [usdc_wstEth.id]: undefined,
        },
        tokens: {},
        users: {},
        positions: {},
        holdings: {},
        vaults: {},
        vaultUsers: {},
        vaultMarketConfigs: {},
      }),
      error: {
        global: {
          feeRecipient: null,
        },
        markets: {
          [usdc_wstEth.id]: null,
        },
        tokens: {},
        users: {},
        positions: {},
        holdings: {},
        vaults: {},
        vaultUsers: {},
        vaultMarketConfigs: {},
        vaultV2Adapters: {},
        vaultV2s: {},
      },
      isFetching: {
        global: {
          feeRecipient: true,
        },
        markets: {
          [usdc_wstEth.id]: true,
        },
        tokens: {},
        users: {},
        positions: {},
        holdings: {},
        vaults: {},
        vaultUsers: {},
        vaultMarketConfigs: {},
        vaultV2Adapters: {},
        vaultV2s: {},
      },
      isFetchingAny: true,
      isPending: false,
    });

    await waitFor(() => expect(result.current.isFetchingAny).toBeFalsy());

    expect(result.current).toStrictEqual({
      data: new SimulationState({
        chainId: ChainId.EthMainnet,
        block,
        global: {
          feeRecipient: zeroAddress,
        },
        markets: {
          [usdc_wstEth.id]: new Market({
            params: usdc_wstEth,
            fee: 0n,
            lastUpdate: 1714261175n,
            price: 3775466720554092397807658269n,
            rateAtTarget: 1828691863n,
            totalBorrowAssets: 29412925392245n,
            totalBorrowShares: 28711075898230454169n,
            totalSupplyAssets: 37387127980949n,
            totalSupplyShares: 36606518680974329424n,
          }),
        },
        tokens: {},
        users: {},
        positions: {},
        holdings: {},
      }),
      error: {
        global: {
          feeRecipient: null,
        },
        markets: {
          [usdc_wstEth.id]: null,
        },
        tokens: {},
        users: {},
        positions: {},
        holdings: {},
        vaults: {},
        vaultUsers: {},
        vaultMarketConfigs: {},
        vaultV2Adapters: {},
        vaultV2s: {},
      },
      isFetching: {
        global: {
          feeRecipient: false,
        },
        markets: {
          [usdc_wstEth.id]: false,
        },
        tokens: {},
        users: {},
        positions: {},
        holdings: {},
        vaults: {},
        vaultUsers: {},
        vaultMarketConfigs: {},
        vaultV2Adapters: {},
        vaultV2s: {},
      },
      isFetchingAny: false,
      isPending: false,
    });
  });

  test("should fail transfer with insufficient balance", async ({
    config,
    client,
    expect,
  }) => {
    const amount = 1_000000n;

    await client.approve({
      address: usdc,
      args: [morpho, amount],
    });

    const block = await client.getBlock();

    const { result } = await renderHook(config, () =>
      useSimulationState({
        marketIds: [],
        users: [client.account.address],
        tokens: [usdc],
        vaults: [],
        vaultV2Adapters: [],
        vaultV2s: [],
        block,
      }),
    );

    await waitFor(() => expect(result.current.isFetchingAny).toBeFalsy());

    expect(() =>
      simulateOperations(
        [
          {
            type: "Erc20_Transfer",
            sender: morpho,
            address: usdc,
            args: {
              amount,
              from: client.account.address,
              to: morpho,
            },
          },
        ],
        result.current.data!,
      ),
    ).toThrowErrorMatchingInlineSnapshot(
      `
      [Error: insufficient balance of user "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" for token "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"

      when simulating operation:
      {
        "type": "Erc20_Transfer",
        "sender": "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb",
        "address": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        "args": {
          "amount": "1000000",
          "from": "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
          "to": "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb"
        }
      }]
    `,
    );
  });

  test("should fail transfer with insufficient allowance", async ({
    config,
    client,
    expect,
  }) => {
    const amount = 1_000000n;

    await client.deal({
      erc20: usdc,
      amount,
    });

    const block = await client.getBlock();

    const { result } = await renderHook(config, () =>
      useSimulationState({
        marketIds: [],
        users: [client.account.address],
        tokens: [usdc],
        vaults: [],
        vaultV2Adapters: [],
        vaultV2s: [],
        block,
      }),
    );

    await waitFor(() => expect(result.current.isFetchingAny).toBeFalsy());

    expect(() =>
      simulateOperations(
        [
          {
            type: "Erc20_Transfer",
            sender: morpho,
            address: usdc,
            args: {
              amount,
              from: client.account.address,
              to: morpho,
            },
          },
        ],
        result.current.data!,
      ),
    ).toThrowErrorMatchingInlineSnapshot(
      `
      [Error: insufficient allowance for token "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" from owner "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" to spender "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb"

      when simulating operation:
      {
        "type": "Erc20_Transfer",
        "sender": "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb",
        "address": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        "args": {
          "amount": "1000000",
          "from": "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
          "to": "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb"
        }
      }]
    `,
    );
  });

  test("should simulate transfer", async ({ config, client }) => {
    const amount = 1_000000n;

    await client.deal({
      erc20: usdc,
      amount,
    });

    const block = await client.getBlock();

    const { result, rerender } = await renderHook(
      config,
      (block: MinimalBlock) =>
        useSimulationState({
          marketIds: [],
          users: [client.account.address],
          tokens: [usdc],
          vaults: [],
          vaultV2Adapters: [],
          vaultV2s: [],
          block,
        }),
      { initialProps: block },
    );

    await waitFor(() => expect(result.current.isFetchingAny).toBeFalsy());

    const data0 = result.current.data!;

    const steps = simulateOperations(
      [
        {
          type: "Erc20_Approve",
          sender: client.account.address,
          address: usdc,
          args: {
            spender: morpho,
            amount,
          },
        },
        {
          type: "Erc20_Transfer",
          sender: morpho,
          address: usdc,
          args: {
            amount,
            from: client.account.address,
            to: morpho,
          },
        },
      ],
      data0,
    );

    expect(steps.length).toBe(3);

    expect(data0).toBe(steps[0]);

    await client.approve({
      address: usdc,
      args: [morpho, amount],
    });

    const step1 = _.cloneDeep(steps[1]!);

    await rerender(await client.getBlock());
    await waitFor(() => expect(result.current.isFetchingAny).toBeFalsy());

    step1.block.number += 1n;
    step1.block.timestamp += 1n;

    const data1 = result.current.data!;

    expect(data1).toStrictEqual(step1);

    await client.setBalance({ address: morpho, value: parseEther("1") });
    await client.writeContract({
      account: morpho,
      address: usdc,
      abi: erc20Abi,
      functionName: "transferFrom",
      args: [client.account.address, morpho, amount],
    });

    const step2 = _.cloneDeep(steps[2]!);

    await rerender(await client.getBlock());
    await waitFor(() => expect(result.current.isFetchingAny).toBeFalsy());

    step2.block.number += 2n;
    step2.block.timestamp += 2n;

    const data2 = result.current.data!;

    expect(data2).toStrictEqual(step2);
  });

  test("should simulate steakUSDC deposit via bundler", async ({
    config,
    client,
  }) => {
    const amount = 1_000_000_000000n;

    await client.deal({
      erc20: usdc,
      amount,
    });

    const block = await client.getBlock();

    const { result } = await renderHook(config, () =>
      useSimulationState({
        marketIds: [],
        users: [client.account.address, steakUsdc.address, generalAdapter1],
        tokens: [steakUsdc.asset, steakUsdc.address],
        vaults: [steakUsdc.address],
        vaultV2Adapters: [],
        vaultV2s: [],
        block,
      }),
    );

    await waitFor(() => expect(result.current.isFetchingAny).toBeFalsy());

    const data0 = result.current.data!;

    const steps = simulateOperations(
      [
        {
          type: "Erc20_Approve",
          sender: client.account.address,
          address: steakUsdc.asset,
          args: {
            spender: permit2,
            amount,
          },
        },
        {
          type: "Erc20_Permit2",
          sender: client.account.address,
          address: steakUsdc.asset,
          args: {
            amount,
            expiration: MathLib.MAX_UINT_48,
            nonce: 0n,
          },
        },
        {
          type: "Erc20_Transfer2",
          sender: generalAdapter1,
          address: steakUsdc.asset,
          args: {
            amount,
            from: client.account.address,
            to: generalAdapter1,
          },
        },
        {
          type: "MetaMorpho_Deposit",
          sender: generalAdapter1,
          address: steakUsdc.address,
          args: {
            assets: amount,
            owner: client.account.address,
          },
        },
      ],
      data0,
    );

    expect(steps.length).toBe(5);

    expect(
      steps[0].getHolding(client.account.address, steakUsdc.asset).balance,
    ).toBe(amount);
    expect(
      steps[0].getVaultUser(steakUsdc.address, client.account.address)
        .allowance,
    ).toBe(0n);
    expect(
      steps[0].getHolding(client.account.address, steakUsdc.asset)
        .permit2BundlerAllowance.amount,
    ).toBe(0n);
    expect(
      steps[0].getHolding(client.account.address, steakUsdc.address).balance,
    ).toBe(0n);
    expect(
      steps[0].getPosition(steakUsdc.address, usdc_wstEth.id).supplyShares,
    ).toBe(29_378_343_227455118737n);

    const step1 = steps[1]!;
    expect(
      step1.getHolding(client.account.address, steakUsdc.asset).balance,
    ).toBe(amount);
    expect(
      step1.getHolding(client.account.address, steakUsdc.asset).erc20Allowances
        .permit2,
    ).toBe(amount);
    expect(
      step1.getHolding(client.account.address, steakUsdc.asset)
        .permit2BundlerAllowance.amount,
    ).toBe(0n);
    expect(
      step1.getHolding(client.account.address, steakUsdc.address).balance,
    ).toBe(0n);
    expect(
      step1.getPosition(steakUsdc.address, usdc_wstEth.id).supplyShares,
    ).toBe(29_378_343_227455118737n);

    const step2 = steps[2]!;
    expect(
      step2.getHolding(client.account.address, steakUsdc.asset).balance,
    ).toBe(amount);
    expect(
      step2.getHolding(client.account.address, steakUsdc.asset).erc20Allowances
        .permit2,
    ).toBe(amount);
    expect(
      step2.getHolding(client.account.address, steakUsdc.asset)
        .permit2BundlerAllowance.amount,
    ).toBe(amount);
    expect(
      step2.getHolding(client.account.address, steakUsdc.address).balance,
    ).toBe(0n);
    expect(
      step2.getPosition(steakUsdc.address, usdc_wstEth.id).supplyShares,
    ).toBe(29_378_343_227455118737n);

    const step4 = steps[4]!;
    expect(
      step4.getHolding(client.account.address, steakUsdc.asset).balance,
    ).toBe(0n);
    expect(
      step4.getVaultUser(steakUsdc.address, client.account.address).allowance,
    ).toBe(0n);
    expect(
      step4.getHolding(client.account.address, steakUsdc.address).balance,
    ).toBe(980_675_703_540782945699252n);
    expect(
      step4.getPosition(steakUsdc.address, usdc_wstEth.id).supplyShares,
    ).toBe(30_357_464_135047367671n);
  });
});
