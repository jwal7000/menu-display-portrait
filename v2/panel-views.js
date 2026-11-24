/**
 * panel-views.js — the rotating panel's four views, as self-contained components.
 *
 * Used by portrait v2 (panel.js). Kept free of page specifics (no fetching, timers or DOM
 * lookups; asset paths are passed in) so the horizontal carousel page can drive the same views
 * later.
 *
 *   const views = FdbPanelViews.create({ assets: { promos: "../promos/", logo: "../logo.png" } });
 *
 * gives the views in display order. Each is
 *   { id, title, pill, has(data) → boolean, build(data) → Element | null }
 * has() is a cheap check that the view has something to show; build() makes one slide (null
 * when empty). Views that page through their content (promos one slide at a time, featured
 * three items at a time) move on each time build() is called.
 *
 * data, filled in by the page:
 *   bev          bev-{loc}.json (drinks list)            bevSoldOut  Set of sold-out drink names
 *   addons       beverages site addons.json              promos      promos-{loc}.json slides
 *   menu         today's pastry menu ({loc}.json, with staff sold-out overrides applied)
 *   picks        staff-picks-{loc}.json picks            picksUpdated  that file's _updated_at
 *
 * Order and rules:
 *   drinks    the drinks list (cooler items left off)
 *   promos    the store's Dropbox promo images that are current today
 *   featured  pastry items in Square's "Menu Screen – Featured" category (menu-build marks them
 *             featured: true) that are on today's menu and not sold out; three at a time
 *   picks     staff picks that haven't expired and whose item is on today's menu or drinks list
 */
(function () {
  "use strict";

  // ── shared helpers ───────────────────────────────────────────────────────

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null && text !== "") e.textContent = text;
    return e;
  }

  /** Today as YYYY-MM-DD in the device's time zone. */
  function today() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  const menuItems = data => ((data.menu && data.menu.sections) || []).flatMap(s => s.items || []);
  const drinkItems = data => ((data.bev && data.bev.sections) || [])
    .flatMap(s => [...(s.items || []), ...(s.sub_sections || []).flatMap(x => x.items || [])]);

  /** { name, price, image, description } for an item on today's pastry menu or drinks list, else null. */
  function findItem(data, name) {
    const p = menuItems(data).find(i => i.name === name);
    if (p) return { name, price: p.price, image: p.photo_url, description: p.description };
    const d = drinkItems(data).find(i => i.name === name);
    return d ? { name, price: d.price } : null;
  }

  /** One line of description: a leading "(Made with vegan ingredients)" would use it all up. */
  function shortDescription(text) {
    const t = String(text || "").replace(/^\([^)]*\)\s*/, "").trim();
    return t ? t.charAt(0).toUpperCase() + t.slice(1) : "";
  }

  // Picks expire at midnight Central on the 1st of the month after they're saved (admin.html
  // stores expires_at). Older picks without it count from the file's _updated_at.
  const PICKS_TZ = "America/Chicago";
  function nextMonthStart(now) {
    const [y, m] = now.toLocaleDateString("en-CA", { timeZone: PICKS_TZ }).split("-").map(Number);
    const ny = m === 12 ? y + 1 : y, nm = m === 12 ? 1 : m + 1;
    const day = `${ny}-${String(nm).padStart(2, "0")}-01`;
    for (const offset of [5, 6]) {   // CDT, CST
      const t = new Date(Date.UTC(ny, nm - 1, 1, offset));
      if (t.toLocaleDateString("en-CA", { timeZone: PICKS_TZ }) === day &&
          t.toLocaleTimeString("en-GB", { timeZone: PICKS_TZ, hour12: false }) === "00:00:00") return t;
    }
    return new Date(Date.UTC(ny, nm - 1, 1, 6));
  }
  function pickExpired(p, fileUpdatedAt, now = Date.now()) {
    const at = p.expires_at || (fileUpdatedAt ? nextMonthStart(new Date(fileUpdatedAt)).toISOString() : null);
    return !at || Date.parse(at) <= now;
  }

  // ── the views ────────────────────────────────────────────────────────────

  function create({ assets }) {
    const A = Object.assign({ promos: "../promos/", logo: "../logo.png" }, assets);

    /** Square frame: the Square photo cropped to fill, or the logo on white when there's none. */
    function itemPhoto(src) {
      const frame = el("div", "sp-photo");
      const img = el("img");
      img.alt = "";
      const fallback = () => { img.onerror = null; img.className = "sp-logo"; img.src = A.logo; frame.classList.add("none"); };
      if (src) { img.onerror = fallback; img.src = src; } else fallback();
      frame.append(img);
      return frame;
    }

    /** The item card staff picks and featured items share: photo, name, one-line description, price. */
    function itemCard(item, cls) {
      const card = el("div", "sp-card" + (cls ? " " + cls : ""));
      card.append(itemPhoto(item.image), el("div", "sp-item", item.name));
      card.append(el("div", "sp-desc", shortDescription(item.description) || " "));   // keeps cards aligned
      card.append(el("div", "sp-price", item.price));
      return card;
    }

    function cardGrid(cards) {
      const grid = el("div", `sp-grid n${cards.length}`);
      grid.append(...cards);
      return grid;
    }

    // drinks ──────────────────────────────────────────────────────────────
    // Sections not listed go to the shortest column. Grab-and-go cooler items (OTHER DRINKS,
    // JUICES) are left off: they're in plain sight in the case.
    const DRINK_COLS = { "ESPRESSO": 0, "COFFEE + NITRO": 1, "SEASONAL DRINKS": 1, "NON ESPRESSO": 2 };
    const DRINK_SKIP = new Set(["OTHER DRINKS", "JUICES (12oz)"]);
    const drinkSections = data => ((data.bev && data.bev.sections) || []).filter(s => !DRINK_SKIP.has(s.name));

    function drinkRow(data, item) {
      const ok  = item.available !== false && !(data.bevSoldOut && data.bevSoldOut.has(item.name));
      const row = el("div", "dr-row" + (ok ? "" : " so"));
      row.append(el("span", "n", item.name), el("span", "d"), el("span", "p", ok ? item.price : "SOLD OUT"));
      return row;
    }

    function drinkSection(data, sec) {
      const box = el("div", "dr-sec");
      const h   = el("h3", null, sec.name.toLowerCase());
      if (sec.temp_label) h.append(el("span", "dr-label", sec.temp_label));
      box.append(h);
      (sec.items || []).forEach(i => box.append(drinkRow(data, i)));
      (sec.sub_sections || []).forEach((sub, k) => {
        if (k === 0 && !sec.temp_label && sub.temp_label) h.append(el("span", "dr-label", sub.temp_label));
        else if (sub.temp_label) box.append(el("div", "dr-label dr-sub", sub.temp_label));
        (sub.items || []).forEach(i => box.append(drinkRow(data, i)));
      });
      return box;
    }

    function addonsLine(a) {
      if (!a) return null;
      const parts = [];
      if (a.milk && a.milk.items) {
        const prices = [...new Set(a.milk.items.map(m => m.price))];
        parts.push(a.milk.items.map(m => m.name).join(" or ") + (prices.length === 1 ? " " + prices[0].replace(/\s+/g, "") : ""));
      }
      if (a.syrups && a.syrups.items) {
        parts.push(`Syrups ${a.syrups.price_note ? a.syrups.price_note.replace(/\s+/g, "") + ": " : ""}${a.syrups.items.join(", ").toLowerCase()}`);
      }
      return parts.length ? el("div", "dr-add", parts.join(" · ")) : null;
    }

    const drinks = {
      id: "drinks", title: "Coffee & Drinks", pill: "Drinks",
      has: data => drinkSections(data).length > 0,
      build(data) {
        const sections = drinkSections(data);
        if (!sections.length) return null;
        const cols = [el("div"), el("div"), el("div")];
        const rows = [0, 0, 0];
        const size = s => 1 + (s.items || []).length + (s.sub_sections || []).reduce((n, x) => n + 1 + x.items.length, 0);
        for (const s of sections) {
          const c = s.name in DRINK_COLS ? DRINK_COLS[s.name] : rows.indexOf(Math.min(...rows));
          cols[c].append(drinkSection(data, s));
          rows[c] += size(s);
        }
        const add = addonsLine(data.addons);
        if (add) cols[0].append(add);
        const grid = el("div", "dr-grid");
        grid.append(...cols);
        return grid;
      },
    };

    // promos ──────────────────────────────────────────────────────────────
    const liveSlides = data => {
      const d = today();
      return (data.promos || []).filter(s => s && s.image && (!s.starts || s.starts <= d) && (!s.ends || s.ends >= d));
    };
    let promoIdx = -1;

    const promos = {
      id: "promos", title: "Promos", pill: "Promos",
      has: data => liveSlides(data).length > 0,
      build(data) {
        const slides = liveSlides(data);
        if (!slides.length) return null;
        promoIdx = (promoIdx + 1) % slides.length;
        const s   = slides[promoIdx];
        const img = el("img");
        img.src = A.promos + encodeURIComponent(s.image);
        img.alt = s.title || "";
        if (s.type !== "card") {
          const g = el("div", "pr-graphic");
          g.append(img);
          return g;
        }
        const wrap = el("div", "pr");
        const pic  = el("div", "pr-img");
        pic.append(img);
        const text = el("div");
        text.append(el("div", "pr-tag", s.tag), el("div", "pr-title", s.title), el("div", "pr-body", s.body));
        if (s.price) text.append(el("div", "pr-price", s.price));
        wrap.append(pic, text);
        return wrap;
      },
    };

    // featured ────────────────────────────────────────────────────────────
    const FEATURED_PER_SLIDE = 3;
    const featuredItems = data => menuItems(data).filter(i => i.featured && !i.sold_out);
    let featuredPage = -1;

    const featured = {
      id: "featured", title: "Featured", pill: "Featured",
      has: data => featuredItems(data).length > 0,
      build(data) {
        const items = featuredItems(data);
        if (!items.length) return null;
        const pages = Math.ceil(items.length / FEATURED_PER_SLIDE);
        featuredPage = (featuredPage + 1) % pages;
        const page = items.slice(featuredPage * FEATURED_PER_SLIDE, (featuredPage + 1) * FEATURED_PER_SLIDE);
        return cardGrid(page.map(i => itemCard(
          { name: i.name, price: i.price, image: i.photo_url, description: i.description }, "ft-card")));
      },
    };

    // staff picks ─────────────────────────────────────────────────────────
    /** Unexpired picks whose item is on today's menu or drinks list, at most three, with { found }. */
    const currentPicks = data => (data.picks || [])
      .filter(p => p && p.item && !pickExpired(p, data.picksUpdated))
      .map(p => ({ ...p, found: findItem(data, p.item) }))
      .filter(p => p.found)
      .slice(0, 3);

    const picks = {
      id: "picks", title: "Staff Picks", pill: "Staff picks",
      has: data => currentPicks(data).length > 0,
      build(data) {
        const list = currentPicks(data);
        if (!list.length) return null;
        return cardGrid(list.map(p => {
          const card = itemCard(p.found);   // shown the same whether or not it's sold out
          card.append(p.note ? el("div", "sp-note", p.note) : el("div", "sp-spacer"));
          const who = el("div", "sp-who", p.staff);
          if (p.role) who.append(el("small", null, p.role));
          card.append(who);
          return card;
        }));
      },
    };

    return [drinks, promos, featured, picks];
  }

  window.FdbPanelViews = { create, findItem, pickExpired, nextMonthStart, shortDescription };
})();
