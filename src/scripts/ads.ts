/**
 * Ads are off unless a publisher id is configured at build time (PUBLIC_ADSENSE_CLIENT), which renders
 * <meta name="dch-ads-client">. Slots have fixed, reserved sizes, so loading an ad never shifts the page.
 * The ad script is requested only after the page has finished loading and the browser is idle.
 */
type AdsWindow = Window & { adsbygoogle?: unknown[] };

export function initAds() {
  const client = document.querySelector<HTMLMetaElement>('meta[name="dch-ads-client"]')?.content;
  const slots = document.querySelectorAll<HTMLElement>("ins.adsbygoogle");
  if (!client || !slots.length) return;
  const start = () => {
    const s = document.createElement("script");
    s.async = true;
    s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(client)}`;
    s.crossOrigin = "anonymous";
    document.head.append(s);
    const w = window as AdsWindow;
    slots.forEach(() => (w.adsbygoogle = w.adsbygoogle || []).push({}));
  };
  const idle = () =>
    "requestIdleCallback" in window
      ? window.requestIdleCallback(start, { timeout: 3000 })
      : setTimeout(start, 1500);
  if (document.readyState === "complete") idle();
  else window.addEventListener("load", idle, { once: true });
}
