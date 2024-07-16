import * as _Manager from "./manager";
import * as _Permit from "./permit";
import * as _Permit2 from "./permit2";
import {
  safeSignTypedData as _safeSignTypedData,
  verifySignature as _verifySignature,
  getMessage as _getMessage,
} from "./utils";

export * from "./types";

export namespace SignatureUtils {
  export import Permit = _Permit;
  export import Permit2 = _Permit2;
  export import Manager = _Manager;

  export const safeSignTypedData = _safeSignTypedData;
  export const verifySignature = _verifySignature;
  export const getMessage = _getMessage;
}
