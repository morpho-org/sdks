import chai, { Assertion } from "chai";
import chaiAsPromised from "chai-as-promised";
import sinonChai from "sinon-chai";

chai.use(sinonChai);
chai.use(chaiAsPromised);

// @ts-ignore
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/BigInt#use_within_json
BigInt.prototype.toJSON = function () {
  return this.toString();
};

// Extend Chai's Assertion interface to include the custom method
declare global {
  namespace Chai {
    interface ExpectStatic {
      any: any;
      anything: any;
      number: any;
      string: any;
      bigint: any;
    }
  }
}

const ANY = new String("[any value]");
const ANYTHING = new String("[any defined value]");
const NUMBER = new String("[any number]");
const STRING = new String("[any string]");
const BIGINT = new String("[any bigint]");

Object.defineProperty(chai.expect, "any", {
  get: function () {
    return ANY;
  },
});
Object.defineProperty(chai.expect, "anything", {
  get: function () {
    return ANYTHING;
  },
});
Object.defineProperty(chai.expect, "number", {
  get: function () {
    return NUMBER;
  },
});
Object.defineProperty(chai.expect, "string", {
  get: function () {
    return STRING;
  },
});
Object.defineProperty(chai.expect, "bigint", {
  get: function () {
    return BIGINT;
  },
});

function customEqual(obj1: any, obj2: any): boolean {
  if (Object(obj1) !== obj1 || Object(obj2) !== obj2) {
    return obj1 === obj2;
  }

  const keys1 = Object.keys(obj1);
  const keys2 = Object.keys(obj2);

  if (keys1.length !== keys2.length) {
    return false;
  }

  for (let key of keys1) {
    switch (obj2[key]) {
      case ANY: {
        break;
      }
      case ANYTHING: {
        if (obj1[key] == undefined) return false;
        break;
      }
      case STRING: {
        if (typeof obj1[key] !== "string") return false;
        break;
      }
      case NUMBER: {
        if (typeof obj1[key] !== "number") return false;
        break;
      }
      case BIGINT: {
        if (typeof obj1[key] !== "bigint") return false;
        break;
      }
      default: {
        if (!customEqual(obj1[key], obj2[key])) return false;
        break;
      }
    }
  }

  return true;
}

Assertion.overwriteMethod("eql", function (_super) {
  return function (this: Chai.AssertionStatic, arg: any) {
    if (typeof arg === "object" && typeof this._obj === "object") {
      const result = customEqual(this._obj, arg);
      this.assert(
        result,
        "expected #{this} to deeply equal #{exp}",
        "expected #{this} not to deeply equal #{exp}",
        arg,
        this._obj,
      );
    } else {
      _super.apply(this, arguments);
    }
  };
});
