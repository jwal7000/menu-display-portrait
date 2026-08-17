/**
 * menu.js — Five Daughters Bakery Digital Menu Board (Portrait)
 *
 * Fetches ../output/menu.json, renders the menu, and refreshes every 60s.
 * On fetch failure, keeps the last successful menu and shows a warning banner.
 * No framework dependencies — plain ES2020 JavaScript.
 *
 * Portrait layout: 2-column section grid, no promo sidebar.
 */

(function () {
  "use strict";

  // ── Config ────────────────────────────────────────────────────────────────

  const MENU_JSON_PATH   = "../output/menu.json";
  const REFRESH_INTERVAL = 60 * 1000; // 60 seconds

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

  // ── DOM builders ─────────────────────────────────────────────────────────

  /**
   * Convert a Dropbox share URL (?dl=0) to a direct image URL (?raw=1).
   * Other URLs are passed through unchanged.
   */
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

  /**
   * Build a single item row (<li>).
   */
  function buildItemRow(item) {
    const li = document.createElement("li");
    li.className = "item-row" + (item.sold_out ? " sold-out" : "");

    // Thumbnail
    const imageUrl = resolveImageUrl(item.image_url);
    if (imageUrl) {
      li.classList.add("has-image");
      const img = document.createElement("img");
      img.className = "item-thumb";
      img.src = imageUrl;
      img.alt = item.name;
      img.loading = "lazy";
      img.onerror = () => {
        img.style.display = "none";
        li.classList.remove("has-image");
      };
      li.appendChild(img);
    }

    // Text content
    const textWrap = document.createElement("span");
    textWrap.className = "item-text";

    const nameEl = document.createElement("span");
    nameEl.className = "item-name";
    nameEl.textContent = item.name;

    const dotsEl = document.createElement("span");
    dotsEl.className = "item-dots";
    dotsEl.setAttribute("aria-hidden", "true");

    const priceEl = document.createElement("span");
    if (item.sold_out) {
      priceEl.className = "item-sold-out-label";
      priceEl.textContent = "Sold Out";
    } else {
      priceEl.className = "item-price";
      priceEl.textContent = item.price ?? "";
    }

    textWrap.appendChild(nameEl);
    textWrap.appendChild(dotsEl);
    textWrap.appendChild(priceEl);
    li.appendChild(textWrap);

    // Variations
    if (Array.isArray(item.variations) && item.variations.length > 1) {
      li.classList.add("has-variations");
      dotsEl.style.display = "none";
      priceEl.style.display = "none";

      const varList = document.createElement("ul");
      varList.className = "item-variations";

      for (const v of item.variations) {
        const varLi = document.createElement("li");
        varLi.className = "variation-row" + (v.sold_out ? " sold-out" : "");

        const vName = document.createElement("span");
        vName.className = "variation-name";
        vName.textContent = v.variation_name ?? "";

        const vDots = document.createElement("span");
        vDots.className = "variation-dots";
        vDots.setAttribute("aria-hidden", "true");

        const vPrice = document.createElement("span");
        if (v.sold_out) {
          vPrice.className = "variation-sold-out-label";
          vPrice.textContent = "Sold Out";
        } else {
          vPrice.className = "variation-price";
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

  /**
   * Build a section card (<div.section-card>).
   */
  function buildSectionCard(section) {
    const card = document.createElement("div");
    card.className = "section-card";

    const header = document.createElement("div");
    header.className = "section-header";

    const title = document.createElement("h2");
    title.className = "section-name";
    title.textContent = section.name;

    header.appendChild(title);
    card.appendChild(header);

    const items = section.items ?? [];
    if (items.length === 0) {
      const empty = document.createElement("p");
      empty.className = "section-empty";
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
   * Render the full menu from a menu.json data object.
   * Portrait layout: 2-column section grid, no promo sidebar.
   */
  function renderMenu(data) {
    const locName = data.location_name ?? "";
    const ts      = data.generated_at ?? "";

    locationNameEl.textContent  = locName;
    if (footerLocationEl) footerLocationEl.textContent = locName;
    if (footerUpdatedEl)  footerUpdatedEl.textContent  = ts ? "Last updated " + formatFullTimestamp(ts) : "";

    const grid = document.createElement("div");
    grid.className = "sections-grid";

    const sections = data.sections ?? [];
    let renderedCount = 0;
    const skipIdx = new Set();

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
      empty.className = "loading-state";
      empty.textContent = "No menu items available.";
      menuRoot.appendChild(empty);
      return;
    }

    // Swap in (build off-DOM first to avoid flash)
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

      lastGoodMenu = data;
      renderMenu(data);
      setWarning(false);
      isFirstLoad = false;

    } catch (err) {
      console.warn("[menu.js] Failed to load menu.json:", err.message);

      if (lastGoodMenu) {
        setWarning(true);
      } else {
        menuRoot.innerHTML = "";
        const errEl = document.createElement("div");
        errEl.className = "loading-state";
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
