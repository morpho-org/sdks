import type {
  ActionOutput,
  RequirementSignature,
  RequirementTypedData,
  VaultV2DepositAction,
} from "@morpho-org/morpho-sdk";
import type { Address } from "viem";
import { expectTypeOf } from "vitest";
import { toSimulationAuthorizations } from "../decode/index.js";
import type {
  BlueAuthorizationTypedData,
  Erc2612TypedData,
  Permit2SignatureTransferTypedData,
} from "./authorizations.js";
import type { FinalSimulateParams, PreviewSimulateParams } from "./request.js";

describe("released SDK composition", () => {
  test("behavior: getRequirements and unsigned/signed buildTx compose with preview/final", () => {
    const compose = async (params: {
      readonly output: ActionOutput<
        VaultV2DepositAction,
        readonly RequirementSignature[]
      >;
      readonly owner: Address;
      readonly chainId: number;
      readonly signatures: readonly RequirementSignature[];
    }) => {
      const requirements = await params.output.getRequirements({
        useSimplePermit: true,
      });
      const authorizations = toSimulationAuthorizations({
        chainId: params.chainId,
        owner: params.owner,
        requirements,
      });
      const preview = {
        chainId: params.chainId,
        mode: "preview",
        authorizations,
        transactions: [{ ...params.output.buildTx(), from: params.owner }],
      } as const satisfies PreviewSimulateParams;
      const final = {
        chainId: params.chainId,
        mode: "final",
        transactions: [
          { ...params.output.buildTx(params.signatures), from: params.owner },
        ],
      } as const satisfies FinalSimulateParams;
      return { preview, final };
    };
    expectTypeOf<
      Awaited<ReturnType<typeof compose>>["preview"]
    >().toExtend<PreviewSimulateParams>();
    expectTypeOf<
      Awaited<ReturnType<typeof compose>>["final"]
    >().toExtend<FinalSimulateParams>();
  });

  test("behavior: checked payloads remain SDK-compatible; broad SDK payloads require parsing", () => {
    expectTypeOf<Erc2612TypedData>().toExtend<RequirementTypedData>();
    expectTypeOf<Permit2SignatureTransferTypedData>().toExtend<RequirementTypedData>();
    expectTypeOf<BlueAuthorizationTypedData>().toExtend<RequirementTypedData>();
    expectTypeOf<RequirementTypedData>().not.toExtend<
      | Erc2612TypedData
      | Permit2SignatureTransferTypedData
      | BlueAuthorizationTypedData
    >();
  });
});
