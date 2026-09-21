/**
 * menu.js — Five Daughters Bakery Digital Menu Board (Portrait)
 *
 * Polls ../output/menu.json every 30 seconds and updates the display.
 * Uses a smart diff: if only sold_out flags changed, patches the DOM
 * incrementally (no flash, no full re-render). Full re-render only
 * when menu structure changes (new items, price changes, etc.).
 *
 * Portrait layout: 2-column section grid, no promo sidebar.
 * No framework dependencies — plain ES2020 JavaScript.
 */

(function () {
  "use strict";

  // ── Config ────────────────────────────────────────────────────────────────

  const params         = new URLSearchParams(window.location.search);
  const LOC            = params.get("loc") || "the-factory";
  const MENU_JSON_PATH = `./data/${LOC}.json`;
  const REFRESH_INTERVAL = 30 * 1000; // 30 seconds — picks up 2-min inventory patches quickly

  // ── Element refs ──────────────────────────────────────────────────────────

  const menuRoot         = document.getElementById("menu-root");
  const locationNameEl   = document.getElementById("location-name");
  const connectionWarn   = document.getElementById("connection-warning");
  const footerLocationEl = document.getElementById("footer-location");
  const footerUpdatedEl  = document.getElementById("footer-updated");

  // ── State ─────────────────────────────────────────────────────────────────

  let lastGoodMenu = null;
  let isFirstLoad  = true;

  // ── Utilities ─────────────────────────────────────────────────────────────

  function formatFullTimestamp(isoString) {
    if (!isoString) return "";
    const d = new Date(isoString);
    return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })
      + " · " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  function setWarning(visible) {
    if (visible) {
      connectionWarn.classList.remove("hidden");
      document.body.classList.add("has-warning");
    } else {
      connectionWarn.classList.add("hidden");
      document.body.classList.remove("has-warning");
    }
  }

  /** Convert a Dropbox share URL (?dl=0) to a direct image URL (?raw=1). */
  function resolveImageUrl(url) {
    if (!url) return null;
    if (url.includes("dropbox.com")) {
      const [base, query] = url.split("?");
      const params = new URLSearchParams(query || "");
      params.delete("dl");
      params.delete("st");
      params.set("raw", "1");
      const qs = params.toString();
      return base + (qs ? "?" + qs : "");
    }
    return url;
  }

  // ── Structural diff ───────────────────────────────────────────────────────

  /**
   * Returns true if the menu structure changed in a way that requires a full
   * re-render (sections added/removed, items added/removed, names or prices
   * changed). Returns false if only sold_out flags changed — safe to patch.
   */
  function structureChanged(oldData, newData) {
    const os = oldData?.sections || [];
    const ns = newData?.sections || [];
    if (os.length !== ns.length) return true;

    for (let i = 0; i < ns.length; i++) {
      if (os[i].name !== ns[i].name) return true;
      const oi = os[i].items || [];
      const ni = ns[i].items || [];
      if (oi.length !== ni.length) return true;

      for (let j = 0; j < ni.length; j++) {
        const a = oi[j], b = ni[j];
        if (a.item_id !== b.item_id) return true;
        if (a.name    !== b.name)    return true;
        if (a.price   !== b.price)   return true;

        const av = a.variations || [], bv = b.variations || [];
        if (av.length !== bv.length) return true;
        for (let k = 0; k < bv.length; k++) {
          if (av[k].variation_id   !== bv[k].variation_id)   return true;
          if (av[k].variation_name !== bv[k].variation_name) return true;
          if (av[k].price          !== bv[k].price)          return true;
        }
      }
    }
    return false;
  }

  // ── Incremental sold_out patch ────────────────────────────────────────────

  /**
   * Patch a single item row's sold_out state without re-rendering.
   * Targets the row via data-item-id attribute.
   */
  function patchItemRow(itemId, soldOut, price) {
    const row = menuRoot.querySelector(`[data-item-id="${CSS.escape(itemId)}"]`);
    if (!row) return;

    row.classList.toggle("sold-out", soldOut);

    const priceEl = row.querySelector(".item-price, .item-sold-out-label");
    if (priceEl) {
      if (soldOut) {
        priceEl.className   = "item-sold-out-label";
        priceEl.textContent = "Sold Out";
      } else {
        priceEl.className   = "item-price";
        priceEl.textContent = price ?? row.dataset.price ?? "";
      }
    }
  }

  /**
   * Patch a single variation row's sold_out state without re-rendering.
   * Targets the row via data-variation-id attribute.
   */
  function patchVariationRow(variationId, soldOut, price) {
    const row = menuRoot.querySelector(`[data-variation-id="${CSS.escape(variationId)}"]`);
    if (!row) return;

    row.classList.toggle("sold-out", soldOut);

    const priceEl = row.querySelector(".variation-price, .variation-sold-out-label");
    if (priceEl) {
      if (soldOut) {
        priceEl.className   = "variation-sold-out-label";
        priceEl.textContent = "Sold Out";
      } else {
        priceEl.className   = "variation-price";
        priceEl.textContent = price ?? row.dataset.price ?? "";
      }
    }
  }

  /**
   * Walk the diff between two menu snapshots and patch only the items whose
   * sold_out status changed. No DOM elements are added or removed.
   */
  function applyIncrementalUpdate(oldData, newData) {
    const oldSections = oldData?.sections || [];
    const newSections = newData?.sections || [];
    let patches = 0;

    for (let i = 0; i < newSections.length; i++) {
      const oldItems = oldSections[i]?.items || [];
      const newItems = newSections[i]?.items || [];

      for (let j = 0; j < newItems.length; j++) {
        const o = oldItems[j];
        const n = newItems[j];
        if (!o) continue;

        if (Array.isArray(n.variations) && n.variations.length > 0) {
          // Multi-variation: check each variation independently
          const ov = o.variations || [];
          for (let k = 0; k < n.variations.length; k++) {
            const nv = n.variations[k];
            const ovk = ov[k];
            if (ovk && nv.sold_out !== ovk.sold_out) {
              patchVariationRow(nv.variation_id, nv.sold_out, nv.price);
              patches++;
            }
          }
          // Also patch the item-level sold_out (controls overall opacity)
          if (n.sold_out !== o.sold_out) {
            const row = menuRoot.querySelector(`[data-item-id="${CSS.escape(n.item_id)}"]`);
            if (row) row.classList.toggle("sold-out", n.sold_out);
            patches++;
          }
        } else {
          // Single-variation
          if (n.sold_out !== o.sold_out) {
            patchItemRow(n.item_id, n.sold_out, n.price);
            patches++;
          }
        }
      }
    }

    if (patches > 0) {
      console.log(`[menu.js] Incremental patch — ${patches} sold_out change(s)`);
    }
    return patches;
  }

  // ── DOM builders ─────────────────────────────────────────────────────────

  /** Build a single item row (<li>). */
  function buildItemRow(item) {
    const li = document.createElement("li");
    li.className = "item-row" + (item.sold_out ? " sold-out" : "");

    // data attributes for incremental patching
    li.dataset.itemId = item.item_id || "";
    li.dataset.price  = item.price   || "";

    // Thumbnail
    const imageUrl = resolveImageUrl(item.image_url);
    if (imageUrl) {
      li.classList.add("has-image");
      const img = document.createElement("img");
      img.className = "item-thumb";
      img.src       = imageUrl;
      img.alt       = item.name;
      img.loading   = "lazy";
      img.onerror   = () => {
        img.style.display = "none";
        li.classList.remove("has-image");
      };
      li.appendChild(img);
    }

    // Text content
    const textWrap = document.createElement("span");
    textWrap.className = "item-text";

    const nameEl = document.createElement("span");
    nameEl.className   = "item-name";
    nameEl.textContent = item.name;

    const dotsEl = document.createElement("span");
    dotsEl.className = "item-dots";
    dotsEl.setAttribute("aria-hidden", "true");

    const priceEl = document.createElement("span");
    if (item.sold_out) {
      priceEl.className   = "item-sold-out-label";
      priceEl.textContent = "Sold Out";
    } else {
      priceEl.className   = "item-price";
      priceEl.textContent = item.price ?? "";
    }

    textWrap.appendChild(nameEl);
    textWrap.appendChild(dotsEl);
    textWrap.appendChild(priceEl);
    li.appendChild(textWrap);

    // Variations
    if (Array.isArray(item.variations) && item.variations.length > 1) {
      li.classList.add("has-variations");
      dotsEl.style.display  = "none";
      priceEl.style.display = "none";

      const varList = document.createElement("ul");
      varList.className = "item-variations";

      for (const v of item.variations) {
        const varLi = document.createElement("li");
        varLi.className = "variation-row" + (v.sold_out ? " sold-out" : "");

        // data attributes for incremental patching
        varLi.dataset.variationId = v.variation_id || "";
        varLi.dataset.price       = v.price        || "";

        const vName = document.createElement("span");
        vName.className   = "variation-name";
        vName.textContent = v.variation_name ?? "";

        const vDots = document.createElement("span");
        vDots.className = "variation-dots";
        vDots.setAttribute("aria-hidden", "true");

        const vPrice = document.createElement("span");
        if (v.sold_out) {
          vPrice.className   = "variation-sold-out-label";
          vPrice.textContent = "Sold Out";
        } else {
          vPrice.className   = "variation-price";
          vPrice.textContent = v.price ?? "";
        }

        varLi.appendChild(vName);
        varLi.appendChild(vDots);
        varLi.appendChild(vPrice);
        varList.appendChild(varLi);
      }

      li.appendChild(varList);
    }

    return li;
  }

  /** Build a section card (<div.section-card>). */
  function buildSectionCard(section) {
    const card = document.createElement("div");
    card.className = "section-card";

    const header = document.createElement("div");
    header.className = "section-header";

    const title = document.createElement("h2");
    title.className   = "section-name";
    title.textContent = section.name;

    header.appendChild(title);
    card.appendChild(header);

    const items = section.items ?? [];
    if (items.length === 0) {
      const empty = document.createElement("p");
      empty.className   = "section-empty";
      empty.textContent = "Nothing available right now";
      card.appendChild(empty);
      return card;
    }

    const list = document.createElement("ul");
    list.className = "item-list";
    list.setAttribute("aria-label", section.name + " items");

    for (const item of items) {
      list.appendChild(buildItemRow(item));
    }

    card.appendChild(list);
    return card;
  }

  /**
   * Full re-render of the menu from a menu.json data object.
   * Only called when structure changes (sections, items, prices).
   * Portrait layout: 2-column section grid, no promo sidebar.
   */
  function renderMenu(data) {
    const locName = data.location_name ?? "";
    const ts      = data.generated_at  ?? "";

    locationNameEl.textContent = locName;
    if (footerLocationEl) footerLocationEl.textContent = locName;
    if (footerUpdatedEl)  footerUpdatedEl.textContent  =
      ts ? "Last updated " + formatFullTimestamp(ts) : "";

    const grid     = document.createElement("div");
    grid.className = "sections-grid";

    const sections      = data.sections ?? [];
    let   renderedCount = 0;
    const skipIdx       = new Set();

    for (let i = 0; i < sections.length; i++) {
      if (skipIdx.has(i)) continue;

      const section = sections[i];

      // Stack Paleo directly below Rolls in one grid cell
      if (section.name === "Rolls") {
        const paleoIdx = sections.findIndex((s, j) => j > i && s.name === "Paleo");
        if (paleoIdx !== -1) {
          const stack = document.createElement("div");
          stack.className = "section-stack";
          stack.appendChild(buildSectionCard(section));
          stack.appendChild(buildSectionCard(sections[paleoIdx]));
          grid.appendChild(stack);
          skipIdx.add(paleoIdx);
          renderedCount++;
          continue;
        }
      }

      const card = buildSectionCard(section);
      if (card) {
        grid.appendChild(card);
        renderedCount++;
      }
    }

    if (renderedCount === 0) {
      menuRoot.innerHTML = "";
      const empty = document.createElement("div");
      empty.className   = "loading-state";
      empty.textContent = "No menu items available.";
      menuRoot.appendChild(empty);
      return;
    }

    // Swap in off-DOM to avoid flash
    menuRoot.innerHTML = "";
    menuRoot.appendChild(grid);
  }

  // ── Data fetching ─────────────────────────────────────────────────────────

  async function fetchMenu() {
    if (!isFirstLoad) {
      document.body.classList.add("refreshing");
    }

    try {
      const url      = MENU_JSON_PATH + "?t=" + Date.now();
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();

      if (!lastGoodMenu || isFirstLoad) {
        // First load — always do a full render
        renderMenu(data);
      } else if (structureChanged(lastGoodMenu, data)) {
        // Structure changed — full re-render
        console.log("[menu.js] Structure change detected — full re-render");
        renderMenu(data);
      } else {
        // Only sold_out may have changed — patch incrementally
        applyIncrementalUpdate(lastGoodMenu, data);
      }

      lastGoodMenu = data;
      setWarning(false);
      isFirstLoad  = false;

    } catch (err) {
      console.warn("[menu.js] Failed to load menu.json:", err.message);

      if (lastGoodMenu) {
        setWarning(true);
      } else {
        menuRoot.innerHTML = "";
        const errEl = document.createElement("div");
        errEl.className   = "loading-state";
        errEl.textContent = "Unable to load menu. Retrying…";
        menuRoot.appendChild(errEl);
        setWarning(true);
      }
    } finally {
      document.body.classList.remove("refreshing");
    }
  }

  // ── Boot ──────────────────────────────────────────────────────────────────

  fetchMenu();
  setInterval(fetchMenu, REFRESH_INTERVAL);

})();
