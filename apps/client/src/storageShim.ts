/**
 * Storage guard: in sandboxed iframes (e.g. embedded/static hosting) DOM
 * storage can throw on access. Replace with an in-memory shim so the app
 * still runs (settings/names just don't persist). Must be imported before
 * any module that touches storage.
 */
function ensure(name: "localStorage" | "sessionStorage"): void {
  try {
    window[name].getItem("__probe__");
  } catch {
    const mem = new Map<string, string>();
    const shim: Pick<Storage, "getItem" | "setItem" | "removeItem" | "clear"> = {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, String(v)),
      removeItem: (k: string) => void mem.delete(k),
      clear: () => mem.clear(),
    };
    Object.defineProperty(window, name, { value: shim, configurable: true });
  }
}
ensure("localStorage");
ensure("sessionStorage");
