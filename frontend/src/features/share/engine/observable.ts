// Store nhỏ cho engine ngoài React — component đọc qua useSyncExternalStore.
export class Observable<S extends object> {
  private listeners = new Set<() => void>();

  constructor(protected state: S) {}

  getState = () => this.state;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  protected setState(patch: Partial<S> | ((s: S) => Partial<S>)) {
    const next = typeof patch === "function" ? patch(this.state) : patch;
    this.state = { ...this.state, ...next };
    this.listeners.forEach((l) => l());
  }
}
