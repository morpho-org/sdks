// Vitest needs to serialize BigInts to JSON, so we need to add a toJSON method to BigInt.prototype.
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/BigInt#use_within_json
// @ts-ignore
BigInt.prototype.toJSON = function () {
  return this.toString();
};

declare global {
  namespace NodeJS {
    interface Process {
      __tinypool_state__: {
        isChildProcess: boolean;
        isTinypoolWorker: boolean;
        workerData: null;
        workerId: number;
      };
    }
  }
}
