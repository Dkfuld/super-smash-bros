/** Clipboard + embed-context helpers shared by results/share UI. */

export function copyText(text: string): Promise<boolean> {
  return navigator.clipboard
    ? navigator.clipboard.writeText(text).then(() => true).catch(() => fallbackCopy(text))
    : Promise.resolve(fallbackCopy(text));
}

function fallbackCopy(text: string): boolean {
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

/** True inside an embed (artifact viewer, iframe host) where our URL isn't shareable and downloads are blocked. */
export function isEmbedded(): boolean {
  try {
    return window.top !== window;
  } catch {
    return true;
  }
}
