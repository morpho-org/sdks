import * as _Manager from "./manager.js";
import * as _Permit from "./permit.js";
import * as _Permit2 from "./permit2.js";
import {
  getMessage as _getMessage,
  safeSignTypedData as _safeSignTypedData,
  verifySignature as _verifySignature,
} from "./utils.js";

export * from "./types.js";

export namespace SignatureUtils {
  export const Permit = _Permit;
  export const Permit2 = _Permit2;
  export const Manager = _Manager;

  export const safeSignTypedData = _safeSignTypedData;
  export const verifySignature = _verifySignature;
  export const getMessage = _getMessage;
}
