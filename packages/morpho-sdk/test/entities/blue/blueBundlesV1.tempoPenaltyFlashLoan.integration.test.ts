import { getChainAddresses, MarketParams, MathLib } from "@morpho-org/blue-sdk";
import { blueAbi } from "@morpho-org/blue-sdk-viem";
import { getChainAddress } from "@morpho-org/morpho-ts";
import { getErpcForkUrl } from "@morpho-org/test";
import { createViemTest } from "@morpho-org/test/vitest";
import {
  encodeAbiParameters,
  erc20Abi,
  keccak256,
  maxUint128,
  maxUint256,
  numberToHex,
} from "viem";
import { tempo } from "viem/chains";
import { describe, expect } from "vitest";
import { VaultV2BlueReallocationData } from "../../../src/entities/index.js";
import {
  blueSupplyCollateralBorrow,
  morphoViemExtension,
} from "../../../src/index.js";

const FORK_BLOCK = 46_605_340n;
const LOAN_TOKEN = "0x20c0000000000000000000006a37DA5C996874BE";
const COLLATERAL_TOKEN = "0x20C000000000000000000000c412Ec89D0c08be5";
const VAULT = "0x0D136e26B4D9e4836fc5cb202baeb49Cb6f5df48";
const MARKET_PARAMS = new MarketParams({
  loanToken: LOAN_TOKEN,
  collateralToken: COLLATERAL_TOKEN,
  oracle: "0xb5D7B3DE3e71945306FF12476b3d85f3Bd5192c3",
  irm: "0x112fd4042E442C3C12C67AD23587b0afe36eB74E",
  lltv: 860_000_000_000_000_000n,
});

// Production-sized plan values from the Tempo penalty flash-loan RCA.
const COLLATERAL_ASSETS = 2_000_000n;
const BORROW_ASSETS = 100_000_000_000n;
const FIXED_IDLE_LEG_ASSETS = 99_813_838_280n;
const FIXED_PENALTY_ASSETS = 9_981_384n;
const MAIN_IDLE_LEG_ASSETS = 99_804_567_897n;
const MAIN_PENALTY_ASSETS = 9_980_457n;
const MAX_LTV = MARKET_PARAMS.lltv - MathLib.WAD / 200n;
const TEMPO_TIP20_BALANCES_SLOT = 9n;

const forkSecret =
  process.env.ERPC_SECRET || process.env.MORPHO_ERPC_DEV_API_KEY;
const tempoTest = createViemTest(tempo, {
  forkUrl: getErpcForkUrl(tempo.id, forkSecret),
  forkBlockNumber: FORK_BLOCK,
  pruneHistory: false,
  stepsTracing: false,
});

describe.skipIf(!forkSecret)(
  "BlueBundlesV1 Tempo penalty flash-loan borrow",
  () => {
    tempoTest(
      "fixed plan executes under the penalty flash loan",
      async ({ client }) => {
        const borrower = client.account.address;
        const block = await client.getBlock({ blockNumber: FORK_BLOCK });
        const [loanDecimals, collateralDecimals] = await Promise.all([
          client.readContract({
            address: LOAN_TOKEN,
            abi: erc20Abi,
            functionName: "decimals",
            blockNumber: FORK_BLOCK,
          }),
          client.readContract({
            address: COLLATERAL_TOKEN,
            abi: erc20Abi,
            functionName: "decimals",
            blockNumber: FORK_BLOCK,
          }),
        ]);
        expect(loanDecimals).toBe(6);
        expect(collateralDecimals).toBe(6);

        const { blue } = getChainAddresses(tempo.id);
        const blueBundlesV1 = getChainAddress(
          tempo.id,
          "bundles.blueBundlesV1",
        );
        const market = client
          .extend(morphoViemExtension())
          .morpho.blue(MARKET_PARAMS, tempo.id);
        const reallocationData = await market.getVaultV2BlueReallocationData({
          vaultAddresses: [VAULT],
          block: { number: block.number, timestamp: block.timestamp },
        });
        const plan = market.getVaultV2BlueReallocations({
          reallocationData,
          options: {
            maxPenalty: MathLib.WAD,
            operation: { type: "borrow", amount: BORROW_ASSETS },
          },
        });
        expect(plan.reallocations).toEqual([
          expect.objectContaining({
            assets: FIXED_IDLE_LEG_ASSETS,
            from: { type: "idle" },
          }),
        ]);

        await client.setFeeTokenBalance({
          account: borrower,
          amount: maxUint128,
        });
        await client.setStorageAt({
          address: COLLATERAL_TOKEN,
          index: keccak256(
            encodeAbiParameters(
              [{ type: "address" }, { type: "uint256" }],
              [borrower, TEMPO_TIP20_BALANCES_SLOT],
            ),
          ),
          value: numberToHex(COLLATERAL_ASSETS, { size: 32 }),
        });
        expect(
          await client.balanceOf({ erc20: COLLATERAL_TOKEN, owner: borrower }),
        ).toBe(COLLATERAL_ASSETS);
        await client.approve({
          address: COLLATERAL_TOKEN,
          args: [blueBundlesV1, COLLATERAL_ASSETS],
        });
        await client.writeContract({
          address: blue,
          abi: blueAbi,
          functionName: "setAuthorization",
          args: [blueBundlesV1, true],
        });

        const action = blueSupplyCollateralBorrow({
          market: { chainId: tempo.id, marketParams: MARKET_PARAMS },
          args: {
            userAddress: borrower,
            collateralAssets: COLLATERAL_ASSETS,
            borrowAssets: BORROW_ASSETS,
            maxLtv: MAX_LTV,
            reallocations: plan.reallocations,
            deadline: maxUint256,
          },
        });
        expect(action.action.args.reallocationPenaltyAssets).toBe(
          FIXED_PENALTY_ASSETS,
        );
        expect(action.action.args.referralFeeAssets).toBe(0n);

        const balanceBefore = await client.balanceOf({
          erc20: LOAN_TOKEN,
          owner: borrower,
        });
        const hash = await client.sendTransaction(action);
        const receipt = await client.waitForTransactionReceipt({ hash });
        expect(receipt.status).toBe("success");
        expect(
          (await client.balanceOf({ erc20: LOAN_TOKEN, owner: borrower })) -
            balanceBefore,
        ).toBe(BORROW_ASSETS - FIXED_PENALTY_ASSETS);
      },
    );

    tempoTest(
      "main's plan reverts with transfer reverted",
      async ({ client }) => {
        const borrower = client.account.address;
        const block = await client.getBlock({ blockNumber: FORK_BLOCK });
        const [loanDecimals, collateralDecimals] = await Promise.all([
          client.readContract({
            address: LOAN_TOKEN,
            abi: erc20Abi,
            functionName: "decimals",
            blockNumber: FORK_BLOCK,
          }),
          client.readContract({
            address: COLLATERAL_TOKEN,
            abi: erc20Abi,
            functionName: "decimals",
            blockNumber: FORK_BLOCK,
          }),
        ]);
        expect(loanDecimals).toBe(6);
        expect(collateralDecimals).toBe(6);

        const { blue } = getChainAddresses(tempo.id);
        const blueBundlesV1 = getChainAddress(
          tempo.id,
          "bundles.blueBundlesV1",
        );
        const market = client
          .extend(morphoViemExtension())
          .morpho.blue(MARKET_PARAMS, tempo.id);
        const reallocationData = await market.getVaultV2BlueReallocationData({
          vaultAddresses: [VAULT],
          block: { number: block.number, timestamp: block.timestamp },
        });
        const mainData = new VaultV2BlueReallocationData({
          ...reallocationData,
          blueBalances: {
            ...reallocationData.blueBalances,
            [LOAN_TOKEN]: maxUint256,
          },
        });
        const plan = market.getVaultV2BlueReallocations({
          reallocationData: mainData,
          options: {
            maxPenalty: MathLib.WAD,
            operation: { type: "borrow", amount: BORROW_ASSETS },
          },
        });
        expect(plan.reallocations).toEqual([
          expect.objectContaining({
            assets: MAIN_IDLE_LEG_ASSETS,
            from: { type: "idle" },
          }),
        ]);

        await client.setFeeTokenBalance({
          account: borrower,
          amount: maxUint128,
        });
        await client.setStorageAt({
          address: COLLATERAL_TOKEN,
          index: keccak256(
            encodeAbiParameters(
              [{ type: "address" }, { type: "uint256" }],
              [borrower, TEMPO_TIP20_BALANCES_SLOT],
            ),
          ),
          value: numberToHex(COLLATERAL_ASSETS, { size: 32 }),
        });
        expect(
          await client.balanceOf({ erc20: COLLATERAL_TOKEN, owner: borrower }),
        ).toBe(COLLATERAL_ASSETS);
        await client.approve({
          address: COLLATERAL_TOKEN,
          args: [blueBundlesV1, COLLATERAL_ASSETS],
        });
        await client.writeContract({
          address: blue,
          abi: blueAbi,
          functionName: "setAuthorization",
          args: [blueBundlesV1, true],
        });

        const action = blueSupplyCollateralBorrow({
          market: { chainId: tempo.id, marketParams: MARKET_PARAMS },
          args: {
            userAddress: borrower,
            collateralAssets: COLLATERAL_ASSETS,
            borrowAssets: BORROW_ASSETS,
            maxLtv: MAX_LTV,
            reallocations: plan.reallocations,
            deadline: maxUint256,
          },
        });
        expect(action.action.args.reallocationPenaltyAssets).toBe(
          MAIN_PENALTY_ASSETS,
        );
        expect(action.action.args.referralFeeAssets).toBe(0n);

        await expect(
          client.call({
            account: borrower,
            to: action.to,
            data: action.data,
            value: action.value,
          }),
        ).rejects.toThrow("transfer reverted");
      },
    );
  },
);
