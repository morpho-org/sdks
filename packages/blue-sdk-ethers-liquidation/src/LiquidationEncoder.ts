import { AbstractSigner, Provider } from "ethers";
import { ExecutorEncoder } from "executooor";

export class LiquidationEncoder extends ExecutorEncoder {
  constructor(address: string, runner: AbstractSigner<Provider>) {
    super(address, runner);
  }

  get provider() {
    return this.runner.provider!;
  }
}
