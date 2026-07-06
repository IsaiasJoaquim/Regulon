export class AsyncLocalStorage<T = unknown> {
  private store: T | undefined = undefined;

  run<R>(store: T, callback: () => R): R {
    const previous = this.store;
    this.store = store;
    try {
      return callback();
    } finally {
      this.store = previous;
    }
  }

  getStore(): T | undefined {
    return this.store;
  }

  enterWith(store: T): void {
    this.store = store;
  }
}
