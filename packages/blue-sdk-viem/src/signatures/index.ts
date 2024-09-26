import * as _Manager from "./manager";
import * as _Permit from "./permit";
import * as _Permit2 from "./permit2";
import { verifySignature as _verifySignature } from "./utils";

export * from "./types";

export namespace SignatureUtils {
  export const Permit = _Permit;
  export const Permit2 = _Permit2;
  export const Manager = _Manager;

  export const verifySignature = _verifySignature;
}
