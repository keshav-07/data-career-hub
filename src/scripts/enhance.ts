/** Progressive enhancement for prose: code-block chrome + copy, and keyboard-reachable scroll regions. */

function languageOf(pre: HTMLElement): string {
  return pre.getAttribute("data-language") ?? "text";
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function enhanceCode(root: ParentNode) {
  root.querySelectorAll<HTMLElement>(".prose pre, [data-code-root] pre").forEach((pre) => {
    if (pre.closest(".code-block")) return;
    const wrapper = document.createElement("div");
    wrapper.className = "code-block";
    const bar = document.createElement("div");
    bar.className = "code-block__bar";
    const lang = document.createElement("span");
    lang.textContent = languageOf(pre);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "code-copy";
    btn.textContent = "Copy";
    btn.setAttribute("aria-label", `Copy ${languageOf(pre)} code to clipboard`);
    const live = document.createElement("span");
    live.className = "visually-hidden";
    live.setAttribute("role", "status");
    bar.append(lang, btn, live);
    pre.parentNode?.insertBefore(wrapper, pre);
    wrapper.append(bar, pre);
    // Long code scrolls horizontally and is reachable by keyboard.
    pre.tabIndex = 0;
    pre.setAttribute("aria-label", `${languageOf(pre)} code`);
    pre.setAttribute("role", "region");

    let timer: number | undefined;
    btn.addEventListener("click", async () => {
      const ok = await copyText(pre.innerText.replace(/\n$/, ""));
      btn.textContent = ok ? "Copied" : "Press Ctrl+C";
      live.textContent = ok
        ? "Code copied to clipboard"
        : "Copy failed. Select the code and press Ctrl+C.";
      if (!ok) {
        const range = document.createRange();
        range.selectNodeContents(pre);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        btn.textContent = "Copy";
        live.textContent = "";
      }, 2000);
    });
  });
}

function enhanceTables(root: ParentNode) {
  root.querySelectorAll<HTMLTableElement>(".prose table, .scroll-table").forEach((table) => {
    if (table.parentElement?.classList.contains("scroll-region")) return;
    const wrap = document.createElement("div");
    wrap.className = "scroll-region";
    wrap.tabIndex = 0;
    wrap.setAttribute("role", "region");
    const caption = table.querySelector("caption")?.textContent?.trim();
    wrap.setAttribute("aria-label", caption ? `${caption} (scrollable table)` : "Scrollable table");
    table.parentNode?.insertBefore(wrap, table);
    wrap.append(table);
  });
}

export function initEnhance() {
  enhanceCode(document);
  enhanceTables(document);
}
