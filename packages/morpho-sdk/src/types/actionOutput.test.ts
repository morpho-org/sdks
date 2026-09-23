import type { Hex } from "viem";
import { describe, expectTypeOf, test } from "vitest";
import type { BlueActions } from "../entities/blue/blue.js";
import type {
  MakeOffersOutput,
  MidnightActionOutput,
  MidnightActionSignatures,
  MorphoBlue,
  MorphoVaultV1,
  MorphoVaultV2,
} from "../entities/index.js";
import type { VaultV1Actions } from "../entities/vaultV1/vaultV1.js";
import type { VaultV2Actions } from "../entities/vaultV2/vaultV2.js";
import type { BuilderOnlyActionOutput as RootBuilderOutput } from "../index.js";
import type {
  BuilderOnlyActionOutput as FacadeBuilderOutput,
  ActionOutput as FacadeOutput,
} from "../types.js";
import type {
  ActionOutput,
  ActionRequirement,
  AuthorizationRequirementSignature,
  BlueAuthorizationAction,
  BuilderOnlyActionOutput,
  ERC20ApprovalAction,
  MempoolSubmitOffersAction,
  MidnightTakeLendAction,
  PermitRequirementSignature,
  Requirement,
  RequirementSignature,
  Transaction,
  TransactionAction,
} from "./action.js";

type Outputs<T> = {
  [K in keyof T as T[K] extends (...args: never[]) => { buildTx: unknown }
    ? K
    : never]: T[K] extends (...args: never[]) => infer R ? R : never;
};
type OutputContracts<T> = {
  [K in keyof T]: T[K] extends { buildTx: infer B; getRequirements: infer G }
    ? [B, G]
    : T[K] extends { buildTx: infer B }
      ? [B]
      : never;
};
type TokenRequirements = (
  | Readonly<Transaction<ERC20ApprovalAction>>
  | Requirement<PermitRequirementSignature>
)[];
type BlueRequirements = (
  | TokenRequirements[number]
  | Readonly<Transaction<BlueAuthorizationAction>>
  | Requirement<AuthorizationRequirementSignature>
)[];
type InterfaceBlueRequirements = (
  | Readonly<Transaction<ERC20ApprovalAction>>
  | Readonly<Transaction<BlueAuthorizationAction>>
  | Requirement
)[];
type LegacyOutput<A extends TransactionAction, R, P extends unknown[]> = {
  readonly buildTx: (
    signatures?: readonly RequirementSignature[],
  ) => Readonly<Transaction<A>>;
  readonly getRequirements: (...params: P) => Promise<R>;
};

describe("ActionOutput", () => {
  test("default: preserves all three existing generic defaults", () => {
    expectTypeOf<ActionOutput["buildTx"]>().toEqualTypeOf<
      (signatures?: RequirementSignature) => Readonly<Transaction>
    >();
    expectTypeOf<Parameters<ActionOutput["getRequirements"]>>().toEqualTypeOf<
      [params?: { readonly useSimplePermit?: boolean }]
    >();
    expectTypeOf<ReturnType<ActionOutput["getRequirements"]>>().toEqualTypeOf<
      Promise<readonly ActionRequirement[]>
    >();
    expectTypeOf<FacadeOutput>().toEqualTypeOf<ActionOutput>();
    expectTypeOf<RootBuilderOutput>().toEqualTypeOf<FacadeBuilderOutput>();
  });

  test("behavior: token requirements retain narrow signatures and mutable arrays", () => {
    type TokenMethods = Pick<
      Outputs<MorphoBlue>,
      "supply" | "supplyCollateral" | "repay"
    >;
    type Expected = {
      [K in keyof TokenMethods]: LegacyOutput<
        Extract<
          TransactionAction,
          {
            type: K extends "supply"
              ? "blueSupply"
              : K extends "repay"
                ? "blueRepay"
                : "blueSupplyCollateral";
          }
        >,
        TokenRequirements,
        [params?: { readonly useSimplePermit?: boolean }]
      >;
    };
    expectTypeOf<OutputContracts<TokenMethods>>().toEqualTypeOf<
      OutputContracts<Expected>
    >();
    expectTypeOf<
      OutputContracts<Pick<Outputs<BlueActions>, keyof TokenMethods>>
    >().toEqualTypeOf<OutputContracts<Expected>>();
    expectTypeOf<ReturnType<MorphoVaultV1["deposit"]>>().toEqualTypeOf<
      LegacyOutput<
        Extract<TransactionAction, { type: "vaultV1Deposit" }>,
        TokenRequirements,
        [params?: { readonly useSimplePermit?: boolean }]
      >
    >();
    expectTypeOf<ReturnType<MorphoVaultV2["deposit"]>>().toEqualTypeOf<
      LegacyOutput<
        Extract<TransactionAction, { type: "vaultV2Deposit" }>,
        TokenRequirements,
        [params?: { readonly useSimplePermit?: boolean }]
      >
    >();
    expectTypeOf<ReturnType<MorphoVaultV1["migrateToV2"]>>().toEqualTypeOf<
      LegacyOutput<
        Extract<TransactionAction, { type: "vaultV1MigrateToV2" }>,
        TokenRequirements,
        []
      >
    >();
  });

  test("behavior: Blue concrete and interface requirement contracts stay distinct", () => {
    type Methods =
      | "borrow"
      | "withdraw"
      | "refinance"
      | "repayWithdrawCollateral"
      | "supplyCollateralBorrow";
    type Expected<R> = {
      [K in Methods]: LegacyOutput<
        Extract<TransactionAction, { type: `blue${Capitalize<K>}` }>,
        R,
        K extends "borrow" | "withdraw" | "refinance"
          ? []
          : [params?: { readonly useSimplePermit?: boolean }]
      >;
    };
    expectTypeOf<
      OutputContracts<Pick<Outputs<MorphoBlue>, Methods>>
    >().toEqualTypeOf<OutputContracts<Expected<BlueRequirements>>>();
    expectTypeOf<
      OutputContracts<Pick<Outputs<BlueActions>, Methods>>
    >().toEqualTypeOf<OutputContracts<Expected<InterfaceBlueRequirements>>>();
  });

  test("behavior: builder-only actions have zero arguments and no resolver", () => {
    type Builders = Pick<Outputs<MorphoVaultV1>, "withdraw" | "redeem"> &
      Pick<Outputs<MorphoVaultV2>, "forceWithdraw" | "forceRedeem"> &
      Pick<Outputs<MorphoBlue>, "withdrawCollateral">;
    type Expected = {
      [K in keyof Builders]: BuilderOnlyActionOutput<
        Extract<
          TransactionAction,
          {
            type: K extends "withdraw" | "redeem"
              ? `vaultV1${Capitalize<K>}`
              : K extends "withdrawCollateral"
                ? "blueWithdrawCollateral"
                : `vaultV2${Capitalize<K>}`;
          }
        >
      >;
    };
    expectTypeOf<OutputContracts<Builders>>().toEqualTypeOf<
      OutputContracts<Expected>
    >();
    expectTypeOf<ReturnType<MorphoVaultV2["withdraw"]>>().toEqualTypeOf<
      BuilderOnlyActionOutput<
        Extract<TransactionAction, { type: "vaultV2Withdraw" }>
      >
    >();
    expectTypeOf<ReturnType<MorphoVaultV2["redeem"]>>().toEqualTypeOf<
      BuilderOnlyActionOutput<
        Extract<TransactionAction, { type: "vaultV2Redeem" }>
      >
    >();
    expectTypeOf<
      Parameters<BuilderOnlyActionOutput["buildTx"]>
    >().toEqualTypeOf<[]>();
    expectTypeOf<keyof BuilderOnlyActionOutput>().toEqualTypeOf<"buildTx">();
  });

  test("behavior: vault interfaces and concrete outputs agree", () => {
    expectTypeOf<ReturnType<VaultV1Actions["deposit"]>>().toEqualTypeOf<
      ReturnType<MorphoVaultV1["deposit"]>
    >();
    expectTypeOf<ReturnType<VaultV1Actions["withdraw"]>>().toEqualTypeOf<
      ReturnType<MorphoVaultV1["withdraw"]>
    >();
    expectTypeOf<ReturnType<VaultV1Actions["redeem"]>>().toEqualTypeOf<
      ReturnType<MorphoVaultV1["redeem"]>
    >();
    expectTypeOf<ReturnType<VaultV1Actions["migrateToV2"]>>().toEqualTypeOf<
      ReturnType<MorphoVaultV1["migrateToV2"]>
    >();
    expectTypeOf<ReturnType<VaultV1Actions["inKindRedeem"]>>().toEqualTypeOf<
      ReturnType<MorphoVaultV1["inKindRedeem"]>
    >();
    expectTypeOf<ReturnType<VaultV2Actions["deposit"]>>().toEqualTypeOf<
      ReturnType<MorphoVaultV2["deposit"]>
    >();
    expectTypeOf<ReturnType<VaultV2Actions["withdraw"]>>().toEqualTypeOf<
      ReturnType<MorphoVaultV2["withdraw"]>
    >();
    expectTypeOf<ReturnType<VaultV2Actions["redeem"]>>().toEqualTypeOf<
      ReturnType<MorphoVaultV2["redeem"]>
    >();
    expectTypeOf<ReturnType<VaultV2Actions["forceWithdraw"]>>().toEqualTypeOf<
      ReturnType<MorphoVaultV2["forceWithdraw"]>
    >();
    expectTypeOf<ReturnType<VaultV2Actions["forceRedeem"]>>().toEqualTypeOf<
      ReturnType<MorphoVaultV2["forceRedeem"]>
    >();
    expectTypeOf<ReturnType<VaultV2Actions["inKindRedeem"]>>().toEqualTypeOf<
      ReturnType<MorphoVaultV2["inKindRedeem"]>
    >();
  });

  test("behavior: Midnight defaults and maker metadata remain compatible", () => {
    expectTypeOf<MidnightActionOutput<MidnightTakeLendAction>>().toEqualTypeOf<
      ActionOutput<MidnightTakeLendAction, undefined, undefined>
    >();
    expectTypeOf<
      Parameters<MidnightActionOutput<MidnightTakeLendAction>["buildTx"]>
    >().toEqualTypeOf<[signatures?: undefined]>();
    expectTypeOf<
      Parameters<MakeOffersOutput["getRequirements"]>
    >().toEqualTypeOf<[params?: undefined]>();
    expectTypeOf<MakeOffersOutput["buildTx"]>().toEqualTypeOf<
      (
        signatures?: MidnightActionSignatures,
      ) => Readonly<Transaction<MempoolSubmitOffersAction>>
    >();
    expectTypeOf<MakeOffersOutput["groups"]>().toEqualTypeOf<readonly Hex[]>();
    expectTypeOf<MakeOffersOutput["root"]>().toEqualTypeOf<Hex>();
    expectTypeOf<MakeOffersOutput["ratifierType"]>().toEqualTypeOf<
      "ecrecover" | "setter"
    >();
    expectTypeOf<
      ReturnType<MakeOffersOutput["getRequirements"]>
    >().toEqualTypeOf<Promise<readonly ActionRequirement[]>>();
  });
});
