import type { Address, TypedDataDefinition } from "viem";
import { expectTypeOf } from "vitest";
import type {
  BlueAuthorizationTypedData,
  Erc2612TypedData,
  Permit2SignatureTransferTypedData,
  SimulationAuthorization,
} from "./authorizations.js";

describe("SimulationAuthorization", () => {
  test("default", () => {
    expectTypeOf<SimulationAuthorization["type"]>().toEqualTypeOf<
      | "erc20Approval"
      | "erc2612Permit"
      | "permit2SignatureTransfer"
      | "blueAuthorization"
      | "blueAuthorizationSignature"
    >();
    expectTypeOf<Erc2612TypedData>().toExtend<
      TypedDataDefinition<Erc2612TypedData["types"], "Permit">
    >();
    expectTypeOf<Permit2SignatureTransferTypedData>().toExtend<
      TypedDataDefinition<
        Permit2SignatureTransferTypedData["types"],
        "PermitTransferFrom"
      >
    >();
    expectTypeOf<BlueAuthorizationTypedData>().toExtend<
      TypedDataDefinition<BlueAuthorizationTypedData["types"], "Authorization">
    >();
  });

  test("behavior: Permit2 binds an explicit owner and excludes PermitSingle", () => {
    expectTypeOf<{
      type: "permit2SignatureTransfer";
      typedData: Permit2SignatureTransferTypedData;
    }>().not.toExtend<SimulationAuthorization>();
    expectTypeOf<{
      type: "permit2SignatureTransfer";
      owner: Address;
      typedData: Omit<Permit2SignatureTransferTypedData, "primaryType"> & {
        primaryType: "PermitSingle";
      };
    }>().not.toExtend<SimulationAuthorization>();
    expectTypeOf<{
      type: "signature";
      token: Address;
      spender: Address;
      amount: bigint;
    }>().not.toExtend<SimulationAuthorization>();
  });

  test("behavior: exact primary types bind their message and schema", () => {
    expectTypeOf<Erc2612TypedData["message"]>().not.toExtend<
      Permit2SignatureTransferTypedData["message"]
    >();
    expectTypeOf<BlueAuthorizationTypedData["message"]>().not.toExtend<
      Erc2612TypedData["message"]
    >();
    expectTypeOf<
      Permit2SignatureTransferTypedData["types"]["TokenPermissions"][1]
    >().toEqualTypeOf<{ readonly name: "amount"; readonly type: "uint256" }>();
  });
});
