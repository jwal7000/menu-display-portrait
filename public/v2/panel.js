/**
 * panel.js — rotating panel under the pastry menu (portrait v2).
 *
 * The four views live in panel-views.js (shared components); this file fetches their data,
 * rotates them and lays them out. Views, about 20 s each, in this order:
 *   drinks    ../data/bev-{loc}.json (built by menu-build from bev-items-config.json)
 *             + staff sold-out overrides from the beverages repo (same file bev.js reads)
 *             + add-ons from the beverages site
 *   promos    ../data/promos-{loc}.json (built by menu-build from the store's Dropbox promo
 *             folders); one slide per turn, so several slides take turns
 *   featured  items menu-build marked featured (Square category "Menu Screen – Featured")
 *             that are on today's menu and not sold out, three per turn
 *   picks     staff-picks-{loc}.json, written by the Staff picks tab of admin.html; unexpired
 *             picks whose item is on today's pastry menu or drinks list
 * The pastry menu comes from menu.js through the "fdb:menu" event, with staff sold-out
 * overrides and the noon Breakfast cutoff already applied.
 *
 * A view with nothing to show is skipped. With no views at all the panel is hidden and
 * the pastry menu gets the whole screen.
 *
 * URL options (for testing): ?view=drinks|promos|featured|picks holds one view;
 * ?every=<seconds>.
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

  const VIEWS = FdbPanelViews.create({ assets: { promos: "../promos/", logo: "../logo.png" } });
  const HOLD_ID = HOLD === "promo" ? "promos" : HOLD;   // old name for the promos view

  const panel = document.getElementById("panel");
  const state = { bev: null, bevSoldOut: new Set(), addons: null, promos: [], picks: [], picksUpdated: null, menu: null };
  let viewIdx = -1;

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
      getJson(URLS.picks).then(d => {
        state.picks = Array.isArray(d.picks) ? d.picks : [];
        state.picksUpdated = d._updated_at || null;
      }).catch(() => {}),
    ]);
  }

  // The first pastry menu (staff picks need it). The panel waits for it, up to 10 s.
  const firstMenu = new Promise(resolve => {
    window.addEventListener("fdb:menu", e => { state.menu = e.detail; resolve(); });
    setTimeout(resolve, 10000);
  });

  // ── rotation ─────────────────────────────────────────────────────────────

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

  function render(view, content, available) {
    panel.innerHTML = "";
    const head  = el("div", "panel-head");
    const pills = el("div", "panel-pills");
    available.forEach(v => pills.append(el("span", "panel-pill" + (v === view ? " on" : ""), v.pill)));
    head.append(el("div", "panel-title", view.title), pills);
    const body = el("div", "panel-body");
    const box  = el("div", "panel-view view-" + view.id);
    box.append(content);
    body.append(box);
    panel.append(head, body);
    document.body.classList.add("has-panel");
    fitView(box, body);
    box.querySelectorAll("img").forEach(img => img.addEventListener("load", () => fitView(box, body)));
  }

  function next() {
    const held  = VIEWS.filter(v => v.id === HOLD_ID);
    const order = held.length ? held : VIEWS;
    // Try each view once, starting after the current one; the first with content wins.
    for (let k = 1; k <= order.length; k++) {
      const view = order[(viewIdx + k) % order.length];
      const content = view.build(state);
      if (content) {
        viewIdx = (viewIdx + k) % order.length;
        render(view, content, VIEWS.filter(v => v.has(state)));
        return;
      }
    }
    document.body.classList.remove("has-panel");   // nothing to show: pastry gets the screen
    panel.innerHTML = "";
  }

  // ── boot ─────────────────────────────────────────────────────────────────

  Promise.all([refresh(), firstMenu]).then(() => {
    next();
    setInterval(next, EVERY);
    setInterval(refresh, REFRESH);
  });
})();
