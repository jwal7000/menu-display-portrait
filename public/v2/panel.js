/**
 * panel.js — rotating panel under the pastry menu (portrait v2).
 *
 * Views, about 20 s each, in this order:
 *   drinks   ../data/bev-{loc}.json (built by menu-build from bev-items-config.json)
 *            + staff sold-out overrides from the beverages repo (same file bev.js reads)
 *            + add-ons from the beverages site
 *   promo    ../data/promos-{loc}.json (built by menu-build from the Dropbox promo folder);
 *            one slide per turn, so several slides take turns
 *   picks    staff-picks-{loc}.json, written by the Staff picks tab of admin.html.
 *            Each pick is looked up in today's pastry menu (via the "fdb:menu" event from
 *            menu.js) or the drinks list; a pick that isn't on today is left out, and a
 *            sold-out pick says so.
 *
 * A view with nothing to show is skipped. With no views at all the panel is hidden and
 * the pastry menu gets the whole screen.
 *
 * URL options (for testing): ?view=drinks|promo|picks holds one view; ?every=<seconds>.
 */

(function () {
  "use strict";

  const params  = new URLSearchParams(location.search);
  const LOC     = params.get("loc") || "the-factory";
  const HOLD    = params.get("view");
  const EVERY   = Math.max(5, Number(params.get("every")) || 20) * 1000;
  const REFRESH = 60 * 1000;

  const URLS = {
    bev:       `../data/bev-${LOC}.json`,
    promos:    `../data/promos-${LOC}.json`,
    bevOv:     `https://raw.githubusercontent.com/jwal7000/menu-display-beverages/main/public/overrides-${LOC}.json`,
    addons:    "https://jwal7000.github.io/menu-display-beverages/addons.json",
    picks:     `https://raw.githubusercontent.com/jwal7000/menu-display-horizontal/main/public/staff-picks-${LOC}.json`,
  };

  const VIEWS  = ["drinks", "promo", "picks"];
  const TITLES = { drinks: "Coffee & Drinks", promo: "Seasonal", picks: "Staff Picks" };
  const PILLS  = { drinks: "Drinks", promo: "Seasonal", picks: "Staff picks" };

  // Drinks columns. Sections not listed go to the shortest column. Grab-and-go cooler
  // items (OTHER DRINKS, JUICES) are left off: they're in plain sight in the case.
  const DRINK_COLS = { "ESPRESSO": 0, "COFFEE + NITRO": 1, "SEASONAL DRINKS": 1, "NON ESPRESSO": 2 };
  const DRINK_SKIP = new Set(["OTHER DRINKS", "JUICES (12oz)"]);

  const panel = document.getElementById("panel");
  const state = { bev: null, bevSoldOut: new Set(), addons: null, promos: [], picks: [], menu: null };
  let viewIdx  = -1;
  let slideIdx = -1;

  // ── helpers ──────────────────────────────────────────────────────────────

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null && text !== "") e.textContent = text;
    return e;
  }

  async function getJson(url) {
    const res = await fetch(url + (url.includes("?") ? "&" : "?") + "t=" + Date.now());
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  /** Today as YYYY-MM-DD in the device's time zone. */
  function today() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  // ── data ─────────────────────────────────────────────────────────────────
  // Each source is fetched on its own; a failure keeps the last good copy.

  async function refresh() {
    await Promise.all([
      getJson(URLS.bev).then(d => { state.bev = d; }).catch(() => {}),
      getJson(URLS.bevOv).then(d => {
        const now = Date.now();
        const exp = d.sold_out_today_expires ? new Date(d.sold_out_today_expires).getTime() : 0;
        state.bevSoldOut = new Set([
          ...(Array.isArray(d.sold_out_indefinite) ? d.sold_out_indefinite : []),
          ...(Array.isArray(d.sold_out_today) && now < exp ? d.sold_out_today : []),
        ]);
      }).catch(() => {}),
      state.addons ? null : getJson(URLS.addons).then(d => { state.addons = d; }).catch(() => {}),
      getJson(URLS.promos).then(d => { state.promos = Array.isArray(d.slides) ? d.slides : []; }).catch(() => {}),
      getJson(URLS.picks).then(d => { state.picks = Array.isArray(d.picks) ? d.picks : []; }).catch(() => {}),
    ]);
  }

  // The first pastry menu (staff picks need it). The panel waits for it, up to 10 s.
  const firstMenu = new Promise(resolve => {
    window.addEventListener("fdb:menu", e => { state.menu = e.detail; resolve(); });
    setTimeout(resolve, 10000);
  });

  // ── drinks ───────────────────────────────────────────────────────────────

  function drinkAvailable(item) {
    return item.available !== false && !state.bevSoldOut.has(item.name);
  }

  function drinkRow(item) {
    const ok  = drinkAvailable(item);
    const row = el("div", "dr-row" + (ok ? "" : " so"));
    row.append(el("span", "n", item.name), el("span", "d"), el("span", "p", ok ? item.price : "SOLD OUT"));
    return row;
  }

  function drinkSection(sec) {
    const box = el("div", "dr-sec");
    const h   = el("h3", null, sec.name.toLowerCase());
    if (sec.temp_label) h.append(el("span", "dr-label", sec.temp_label));
    box.append(h);
    (sec.items || []).forEach(i => box.append(drinkRow(i)));
    (sec.sub_sections || []).forEach((sub, k) => {
      if (k === 0 && !sec.temp_label && sub.temp_label) h.append(el("span", "dr-label", sub.temp_label));
      else if (sub.temp_label) box.append(el("div", "dr-label dr-sub", sub.temp_label));
      (sub.items || []).forEach(i => box.append(drinkRow(i)));
    });
    return box;
  }

  function addonsLine() {
    const a = state.addons;
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

  function buildDrinks() {
    const sections = (state.bev && state.bev.sections || []).filter(s => !DRINK_SKIP.has(s.name));
    if (!sections.length) return null;
    const cols = [el("div"), el("div"), el("div")];
    const rows = [0, 0, 0];
    const size = s => 1 + (s.items || []).length + (s.sub_sections || []).reduce((n, x) => n + 1 + x.items.length, 0);
    for (const s of sections) {
      const c = s.name in DRINK_COLS ? DRINK_COLS[s.name] : rows.indexOf(Math.min(...rows));
      cols[c].append(drinkSection(s));
      rows[c] += size(s);
    }
    const add = addonsLine();
    if (add) cols[0].append(add);
    const grid = el("div", "dr-grid");
    grid.append(...cols);
    return grid;
  }

  // ── seasonal promos ──────────────────────────────────────────────────────

  function liveSlides() {
    const d = today();
    return state.promos.filter(s => s.image && (!s.starts || s.starts <= d) && (!s.ends || s.ends >= d));
  }

  function buildPromo() {
    const slides = liveSlides();
    if (!slides.length) return null;
    slideIdx = (slideIdx + 1) % slides.length;
    const s   = slides[slideIdx];
    const img = el("img");
    img.src = "../promos/" + encodeURIComponent(s.image);
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
  }

  // ── staff picks ──────────────────────────────────────────────────────────

  /**
   * { price, soldOut, image, description } for an item on today's pastry menu or drinks
   * list, else null. Photos and descriptions come from Square via the pastry menu JSON;
   * drinks have neither.
   */
  function findItem(name) {
    for (const s of (state.menu && state.menu.sections) || []) {
      for (const i of s.items || []) {
        if (i.name === name) return { price: i.price, soldOut: !!i.sold_out, image: i.photo_url, description: i.description };
      }
    }
    for (const s of (state.bev && state.bev.sections) || []) {
      const items = [...(s.items || []), ...(s.sub_sections || []).flatMap(x => x.items || [])];
      for (const i of items) if (i.name === name) return { price: i.price, soldOut: !drinkAvailable(i) };
    }
    return null;
  }

  /** One line of description: a leading "(Made with vegan ingredients)" would use it all up. */
  function shortDescription(text) {
    const t = String(text || "").replace(/^\([^)]*\)\s*/, "").trim();
    return t ? t.charAt(0).toUpperCase() + t.slice(1) : "";
  }

  /** Square frame: the Square photo cropped to fill, or the logo on white when there's none. */
  function pickPhoto(src) {
    const frame = el("div", "sp-photo");
    const img = el("img");
    img.alt = "";
    const fallback = () => { img.onerror = null; img.className = "sp-logo"; img.src = "../logo.png"; frame.classList.add("none"); };
    if (src) { img.onerror = fallback; img.src = src; } else fallback();
    frame.append(img);
    return frame;
  }

  function buildPicks() {
    const picks = state.picks
      .map(p => ({ ...p, found: p && p.item ? findItem(p.item) : null }))
      .filter(p => p.found)
      .slice(0, 3);
    if (!picks.length) return null;
    const grid = el("div", `sp-grid n${picks.length}`);
    for (const p of picks) {
      const card = el("div", "sp-card" + (p.found.soldOut ? " so" : ""));
      const photo = pickPhoto(p.found.image);
      if (p.found.soldOut) photo.append(el("span", "sp-badge", "SOLD OUT TODAY"));
      card.append(photo, el("div", "sp-item", p.item));
      const desc = shortDescription(p.found.description);
      card.append(el("div", "sp-desc", desc || "\u00a0"));   // blank line keeps cards aligned
      card.append(el("div", "sp-price", p.found.price));
      if (p.note) card.append(el("div", "sp-note", p.note));
      else card.append(el("div", "sp-spacer"));
      const who = el("div", "sp-who", p.staff);
      if (p.role) who.append(el("small", null, p.role));
      card.append(who);
      grid.append(card);
    }
    return grid;
  }

  // ── rotation ─────────────────────────────────────────────────────────────

  const BUILDERS = { drinks: buildDrinks, promo: buildPromo, picks: buildPicks };

  /** Scale a view down if it's taller than the panel (e.g. a long drinks list). */
  function fitView(view, body) {
    view.style.transform = "";
    view.style.width = "";
    const avail = body.clientHeight - parseFloat(getComputedStyle(body).paddingTop) - parseFloat(getComputedStyle(body).paddingBottom);
    const need  = view.scrollHeight;
    if (need > avail + 1) {
      const k = Math.max(0.7, avail / need);
      view.style.width = (100 / k) + "%";
      view.style.transform = `scale(${k})`;
    }
  }

  function render(name, content, available) {
    panel.innerHTML = "";
    const head  = el("div", "panel-head");
    const pills = el("div", "panel-pills");
    available.forEach(v => pills.append(el("span", "panel-pill" + (v === name ? " on" : ""), PILLS[v])));
    head.append(el("div", "panel-title", TITLES[name]), pills);
    const body = el("div", "panel-body");
    const view = el("div", "panel-view view-" + name);
    view.append(content);
    body.append(view);
    panel.append(head, body);
    document.body.classList.add("has-panel");
    fitView(view, body);
    view.querySelectorAll("img").forEach(img => img.addEventListener("load", () => fitView(view, body)));
  }

  function next() {
    const order = HOLD && VIEWS.includes(HOLD) ? [HOLD] : VIEWS;
    // Try each view once, starting after the current one; the first with content wins.
    for (let k = 1; k <= order.length; k++) {
      const name = order[(viewIdx + k) % order.length];
      const content = BUILDERS[name]();
      if (content) { viewIdx = (viewIdx + k) % order.length; render(name, content, availableViews(VIEWS)); return; }
    }
    document.body.classList.remove("has-panel");   // nothing to show: pastry gets the screen
    panel.innerHTML = "";
  }

  /** The views that currently have content, for the pills. Cheap: just checks the data. */
  function availableViews(order) {
    return order.filter(v =>
      v === "drinks" ? !!(state.bev && state.bev.sections && state.bev.sections.length)
      : v === "promo" ? liveSlides().length > 0
      : state.picks.some(p => p && p.item && findItem(p.item)));
  }

  // ── boot ─────────────────────────────────────────────────────────────────

  Promise.all([refresh(), firstMenu]).then(() => {
    next();
    setInterval(next, EVERY);
    setInterval(refresh, REFRESH);
  });
})();
