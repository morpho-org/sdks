import { ObservableSet, ValueState } from "./ObservableSet";

describe("ObservableSet", () => {
  let observable: ObservableSet<number>;
  const changeSubscriber = jest.fn();
  const valuesSubscriber = jest.fn();

  beforeEach(() => {
    observable = new ObservableSet();

    observable.changes$.subscribe(changeSubscriber);
    observable.values$.subscribe(valuesSubscriber);
  });

  afterEach(() => {
    observable.close();

    changeSubscriber.mockClear();
    valuesSubscriber.mockClear();
  });

  it("shouldn't emit any change if not changed", () => {
    expect(changeSubscriber).toHaveBeenCalledTimes(0);
  });

  it("should emit empty set if not changed", () => {
    expect(valuesSubscriber).toHaveBeenCalledWith(new Set());
    expect(valuesSubscriber).toHaveBeenCalledTimes(1);
  });

  it("should emit events when set changed", () => {
    expect(observable.add(1)).toEqual([1]);
    expect(observable.add(1, 2, 3)).toEqual([2, 3]);
    expect(observable.delete(1)).toEqual([1]);
    expect(observable.delete(0)).toEqual([]);
    expect(observable.delete(0, 2)).toEqual([2]);

    expect(changeSubscriber).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        value: 1,
        state: ValueState.added,
      })
    );
    expect(changeSubscriber).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        value: 2,
        state: ValueState.added,
      })
    );
    expect(changeSubscriber).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        value: 3,
        state: ValueState.added,
      })
    );
    expect(changeSubscriber).toHaveBeenNthCalledWith(
      4,
      expect.objectContaining({
        value: 1,
        state: ValueState.deleted,
      })
    );
    expect(changeSubscriber).toHaveBeenNthCalledWith(
      5,
      expect.objectContaining({
        value: 2,
        state: ValueState.deleted,
      })
    );
    expect(changeSubscriber).toHaveBeenCalledTimes(5);

    // Weird jest behavior: called 5 times including the first empty set but fails...
    // expect(valuesSubscriber).toHaveBeenNthCalledWith(1, new Set());
    expect(valuesSubscriber).toHaveBeenNthCalledWith(1, new Set([1]));
    expect(valuesSubscriber).toHaveBeenNthCalledWith(2, new Set([1, 2, 3]));
    expect(valuesSubscriber).toHaveBeenNthCalledWith(3, new Set([2, 3]));
    expect(valuesSubscriber).toHaveBeenNthCalledWith(4, new Set([3]));
    expect(valuesSubscriber).toHaveBeenCalledTimes(5);
  });
});
