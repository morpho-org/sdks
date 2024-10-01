import { expect } from "chai";
import { MaxUint256, ZeroAddress, toBigInt } from "ethers";
import { ERC20__factory } from "ethers-types";
import { ethers } from "hardhat";
import { deal } from "hardhat-deal";
import _cloneDeep from "lodash/cloneDeep";
import _omit from "lodash/omit";

import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { setNextBlockTimestamp } from "@nomicfoundation/hardhat-network-helpers/dist/src/helpers/time";

import { BlueService, ChainService } from "@morpho-org/blue-core-sdk";
import { MetaMorphoService } from "@morpho-org/blue-metamorpho-sdk";
import {
  ChainId,
  Holding,
  MathLib,
  NATIVE_ADDRESS,
  Token,
  User,
  addresses,
} from "@morpho-org/blue-sdk";
import { MAINNET_MARKETS } from "@morpho-org/blue-sdk/lib/tests/mocks/markets";
import { mine, setUp } from "@morpho-org/morpho-test";

import {
  Erc20Errors,
  Operation,
  SimulationData,
  SimulationService,
  simulateOperations,
} from "../../../src";
import { steakUsdc } from "../fixtures";

const { morpho, bundler, permit2, usdc } = addresses[ChainId.EthMainnet];

describe("SimulationService", () => {
  let signer: SignerWithAddress;

  let simulationService: SimulationService;

  const dataObserver = setUp(async () => {
    signer = (await ethers.getSigners())[0]!;
  });

  afterEach(async () => {
    // Wait for all fetch promises to resolve before reset.
    await simulationService?.data;

    simulationService?.chainService.close();
    simulationService?.metaMorphoService.blueService.close();
    simulationService?.metaMorphoService.close();
    simulationService?.close();
  });

  test("should resolve empty data when instanciated empty", async () => {
    simulationService = new SimulationService(
      new MetaMorphoService(
        new BlueService(new ChainService(signer), { users: [signer.address] }),
      ),
    );

    const { value, block } = await simulationService.data;

    expect(_omit(value, "cacheId")).to.eql(
      _omit(
        new SimulationData(
          {
            globalData: {
              feeRecipient: ZeroAddress,
              stEthPerWstEth: 1164970742506368622n,
            },
            marketsConfig: {},
            markets: {},
            tokensData: {
              "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE": new Token({
                address: NATIVE_ADDRESS,
                decimals: 18,
                symbol: "ETH",
                name: "Ether",
              }),
            },
            usersData: {
              [bundler]: new User({
                address: bundler,
                isBundlerAuthorized: false,
                morphoNonce: 0n,
              }),
              [signer.address]: new User({
                address: signer.address,
                isBundlerAuthorized: false,
                morphoNonce: 0n,
              }),
            },
            positions: {
              [bundler]: {},
              [signer.address]: {},
            },
            holdings: {
              [bundler]: {
                [NATIVE_ADDRESS]: new Holding({
                  erc20Allowances: {
                    bundler: MaxUint256,
                    morpho: MaxUint256,
                    permit2: MaxUint256,
                  },
                  balance: 0n,
                  permit2Allowances: {
                    bundler: {
                      amount: 0n,
                      expiration: 0n,
                      nonce: 0n,
                    },
                    morpho: {
                      amount: 0n,
                      expiration: 0n,
                      nonce: 0n,
                    },
                  },
                  token: NATIVE_ADDRESS,
                  user: bundler,
                }),
              },
              [signer.address]: {
                [NATIVE_ADDRESS]: new Holding({
                  erc20Allowances: {
                    bundler: MaxUint256,
                    morpho: MaxUint256,
                    permit2: MaxUint256,
                  },
                  balance: 10000000000000000000000n,
                  permit2Allowances: {
                    bundler: {
                      amount: 0n,
                      expiration: 0n,
                      nonce: 0n,
                    },
                    morpho: {
                      amount: 0n,
                      expiration: 0n,
                      nonce: 0n,
                    },
                  },
                  token: NATIVE_ADDRESS,
                  user: signer.address,
                }),
              },
            },
          },
          {
            vaultsConfig: {},
            vaultsData: {},
            vaultsMarketsConfig: {},
            vaultUsers: {},
          },
          ChainId.EthMainnet,
          toBigInt(block.number),
          toBigInt(block.timestamp),
        ),
        "cacheId",
      ),
    );
  });

  test("should fail transfer with insufficient balance", async () => {
    simulationService = new SimulationService(
      new MetaMorphoService(
        new BlueService(new ChainService(signer), {
          users: [signer.address],
          markets: [MAINNET_MARKETS.usdc_wstEth.id],
        }),
      ),
    );

    const { value: data } = await simulationService.data;

    const operations: Operation[] = [
      {
        type: "Erc20_Transfer",
        sender: morpho,
        address: usdc,
        args: {
          amount: 1_000000n,
          from: signer.address,
          to: morpho,
        },
      },
    ];
    simulationService.getSimulatedData$(operations).subscribe(dataObserver);

    expect(() => simulateOperations(operations, data)).to.throw(
      new Erc20Errors.InsufficientBalance(usdc, signer.address).message,
    );

    expect(dataObserver.next.getCalls().length).to.equal(0);
    expect(dataObserver.error.getCalls().length).to.equal(1);
  });

  test("should fail transfer with insufficient allowance", async () => {
    const amount = 1_000000n;
    await deal(usdc, signer.address, amount);

    simulationService = new SimulationService(
      new MetaMorphoService(
        new BlueService(new ChainService(signer), {
          users: [signer.address],
          markets: [MAINNET_MARKETS.usdc_wstEth.id],
        }),
      ),
    );

    const operations: Operation[] = [
      {
        type: "Erc20_Transfer",
        sender: morpho,
        address: usdc,
        args: {
          amount,
          from: signer.address,
          to: morpho,
        },
      },
    ];
    simulationService.getSimulatedData$(operations).subscribe(dataObserver);

    const { value: data } = await simulationService.data;

    expect(() => simulateOperations(operations, data)).to.throw(
      new Erc20Errors.InsufficientAllowance(usdc, signer.address, morpho)
        .message,
    );

    expect(dataObserver.next.getCalls().length).to.equal(0);
    expect(dataObserver.error.getCalls().length).to.equal(1);
  });

  test("should simulate transfer", async () => {
    const amount = 1_000000n;

    await deal(usdc, signer.address, amount);

    simulationService = new SimulationService(
      new MetaMorphoService(
        new BlueService(new ChainService(signer), {
          users: [signer.address],
          markets: [MAINNET_MARKETS.usdc_wstEth.id],
        }),
      ),
    );

    const { value: data0 } = await simulationService.data;

    const operations: Operation[] = [
      {
        type: "Erc20_Approve",
        sender: signer.address,
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
          from: signer.address,
          to: morpho,
        },
      },
    ];
    simulationService.getSimulatedData$(operations).subscribe(dataObserver);

    const steps = simulateOperations(operations, data0);

    expect(steps.length).to.equal(3);

    expect(data0).to.eql(steps[0]);

    const erc20 = ERC20__factory.connect(usdc, signer);

    await setNextBlockTimestamp(data0.timestamp);
    await erc20.approve(morpho, amount);
    await mine(0);

    const step1 = _cloneDeep(steps[1]!);
    const { value: data1 } = await simulationService.data;

    step1.blockNumber += 1n;

    expect(_omit(data1, "cacheId")).to.eql(_omit(step1, "cacheId"));

    await setNextBlockTimestamp(data1.timestamp);
    await erc20
      .connect(await ethers.getImpersonatedSigner(morpho))
      .transferFrom(signer.address, morpho, amount);
    await mine(0);

    const step2 = _cloneDeep(steps[2]!);
    const { value: data2 } = await simulationService.data;

    step2.blockNumber += 2n;

    expect(_omit(data2, "cacheId")).to.eql(_omit(step2, "cacheId"));

    expect(dataObserver.next.getCalls().length).to.equal(2);
    expect(dataObserver.error.getCalls().length).to.equal(1); // Insufficient balance after actual approve + transfer.
  });

  test("should simulate steakUSDC deposit via bundler", async () => {
    const amount = 1_000_000_000000n;
    await deal(steakUsdc.asset, signer.address, amount);

    simulationService = new SimulationService(
      new MetaMorphoService(
        new BlueService(new ChainService(signer), { users: [signer.address] }),
        { vaults: [steakUsdc.address] },
      ),
    );

    const { value: data0 } = await simulationService.data;

    const operations: Operation[] = [
      {
        type: "Erc20_Approve",
        sender: signer.address,
        address: steakUsdc.asset,
        args: {
          spender: permit2,
          amount,
        },
      },
      {
        type: "Erc20_Permit2",
        sender: signer.address,
        address: steakUsdc.asset,
        args: {
          amount,
          spender: bundler,
          expiration: MathLib.MAX_UINT_48,
          nonce: 0n,
        },
      },
      {
        type: "Erc20_Transfer2",
        sender: bundler,
        address: steakUsdc.asset,
        args: {
          amount,
          from: signer.address,
          to: bundler,
        },
      },
      {
        type: "MetaMorpho_Deposit",
        sender: bundler,
        address: steakUsdc.address,
        args: {
          assets: amount,
          owner: signer.address,
        },
      },
    ];
    simulationService.getSimulatedData$(operations).subscribe(dataObserver);

    const steps = simulateOperations(operations, data0);

    expect(steps.length).to.equal(5);

    expect(
      steps[0].getHolding(signer.address, steakUsdc.asset).balance,
    ).to.equal(amount);
    expect(
      steps[0].getVaultUserData(steakUsdc.address, signer.address).allowance,
    ).to.equal(0);
    expect(
      steps[0].getHolding(signer.address, steakUsdc.asset).permit2Allowances
        .bundler.amount,
    ).to.equal(0);
    expect(
      steps[0].getHolding(signer.address, steakUsdc.address).balance,
    ).to.equal(0);
    expect(
      steps[0].getPosition(steakUsdc.address, MAINNET_MARKETS.usdc_wstEth.id)
        .supplyShares,
    ).to.equal(29_378_343_227455118737n);

    const step1 = steps[1]!;
    expect(step1.getHolding(signer.address, steakUsdc.asset).balance).to.equal(
      amount,
    );
    expect(
      step1.getHolding(signer.address, steakUsdc.asset).erc20Allowances.permit2,
    ).to.equal(amount);
    expect(
      step1.getHolding(signer.address, steakUsdc.asset).permit2Allowances
        .bundler.amount,
    ).to.equal(0);
    expect(
      step1.getHolding(signer.address, steakUsdc.address).balance,
    ).to.equal(0);
    expect(
      step1.getPosition(steakUsdc.address, MAINNET_MARKETS.usdc_wstEth.id)
        .supplyShares,
    ).to.equal(29_378_343_227455118737n);

    const step2 = steps[2]!;
    expect(step2.getHolding(signer.address, steakUsdc.asset).balance).to.equal(
      amount,
    );
    expect(
      step2.getHolding(signer.address, steakUsdc.asset).erc20Allowances.permit2,
    ).to.equal(amount);
    expect(
      step2.getHolding(signer.address, steakUsdc.asset).permit2Allowances
        .bundler.amount,
    ).to.equal(amount);
    expect(
      step2.getHolding(signer.address, steakUsdc.address).balance,
    ).to.equal(0);
    expect(
      step2.getPosition(steakUsdc.address, MAINNET_MARKETS.usdc_wstEth.id)
        .supplyShares,
    ).to.equal(29_378_343_227455118737n);

    const step4 = steps[4]!;
    expect(step4.getHolding(signer.address, steakUsdc.asset).balance).to.equal(
      0,
    );
    expect(
      step4.getVaultUserData(steakUsdc.address, signer.address).allowance,
    ).to.equal(0);
    expect(
      step4.getHolding(signer.address, steakUsdc.address).balance,
    ).to.equal(980_675_703_540782945699252n);
    expect(
      step4.getPosition(steakUsdc.address, MAINNET_MARKETS.usdc_wstEth.id)
        .supplyShares,
    ).to.equal(30_357_464_135047367671n);

    expect(dataObserver.next.getCalls().length).to.equal(1);
    expect(dataObserver.error.getCalls().length).to.equal(0);
  });
});
