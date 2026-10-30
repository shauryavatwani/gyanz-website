/* gyanz.co.in: smooth scroll, text reveals, nav, the chat toggle and the gallery. No window scroll listeners:
   page scroll comes from Lenis events (the reading bar is set from them), the nav hairline is CSS, and reveals use IntersectionObserver. No dependencies except vendor/lenis.min.js.
   Every page loads this on its own. Everything here is progressive: the pages read fully without it, and under reduced motion
   it adds nothing that moves. Only transform and opacity are animated. */
(() => {
  const root = document.documentElement;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  /* Smooth scroll. Not created at all under reduced motion; destroyed if that turns on later. */
  let lenis = null;
  function syncLenis() {
    if (reduced.matches) { if (lenis) { lenis.destroy(); lenis = null; } return; }
    if (lenis || !window.Lenis) return;
    lenis = new window.Lenis({ autoRaf: true, lerp: 0.085, wheelMultiplier: 0.85, smoothWheel: true, syncTouch: false, anchors: { offset: -68 } });
    lenis.on("scroll", onScroll);
  }

  function countUp(n, skip) {
    const to = Number(n.dataset.count), ms = 1100, t0 = performance.now();
    if (skip) { n.textContent = String(to); return; }
    const tick = (now) => {
      const k = clamp((now - t0) / ms, 0, 1);
      n.textContent = String(Math.round(to * (1 - Math.pow(1 - k, 3))));
      if (k < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  /* An IntersectionObserver only reports a change, so an element jumped past (End key, an anchor, a fast flick) would stay hidden.
     Each scroll frame therefore shows anything now above the viewport at once. */
  const pendingBlocks = new Set();
  const settle = (el) => setTimeout(() => el.classList.add("set"), 1600);   // after the rise, hover takes over (see .reveal.set)
  const pendingHeads = new Map();
  function sweep() {
    // Backstop for the observers: a page restored by Back/Forward (or the phone's page cache) can leave an observer silent,
    // so anything on screen or above it is shown here too, from the scroll frames and a short timer.
    const seen = (el) => { const r = el.getBoundingClientRect(); return r.bottom >= 0 && r.top < innerHeight * 0.92 && r.height > 0; };
    pendingBlocks.forEach((el) => {
      if (!seen(el)) return;
      el.classList.add("in");
      settle(el);
      $$("[data-count]", el).forEach((n) => countUp(n, false));
      pendingBlocks.delete(el);
    });
    pendingHeads.forEach((words, h) => {
      if (!seen(h)) return;
      words.forEach((w) => w.classList.add("in"));
      pendingHeads.delete(h);
    });
    pendingBlocks.forEach((el) => {
      if (el.getBoundingClientRect().bottom >= 0) return;
      el.classList.add("skip", "in", "set");
      $$("[data-count]", el).forEach((n) => countUp(n, true));
      pendingBlocks.delete(el);
    });
    pendingHeads.forEach((words, h) => {
      if (h.getBoundingClientRect().bottom >= 0) return;
      h.classList.add("h-now");
      words.forEach((w) => w.classList.add("in"));
      pendingHeads.delete(h);
    });
  }

  /* Blocks rise once as they enter. Anything already above the viewport shows at once, so a fast scroll never meets a blank section. */
  function reveals() {
    const items = $$(".reveal");
    $$("[data-stagger]").forEach((group) => {
      $$(".reveal", group).filter((el) => el.parentElement === group).forEach((el, i) => el.style.setProperty("--d", Math.min(i, 4)));
    });
    if (!("IntersectionObserver" in window) || reduced.matches || !window.Lenis) { items.forEach((el) => el.classList.add("in", "skip", "set")); return; }
    $$("[data-count]").forEach((n) => { n.textContent = "0"; });   // counted up once on reveal; the HTML holds the real number
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!pendingBlocks.has(e.target)) { io.unobserve(e.target); return; }   // sweep() already showed it
        if (!e.isIntersecting && e.boundingClientRect.top >= 0) return;
        const above = !e.isIntersecting && e.boundingClientRect.bottom < 0;
        if (above) e.target.classList.add("skip", "set");
        e.target.classList.add("in");
        if (!above) settle(e.target);
        $$("[data-count]", e.target).forEach((n) => countUp(n, above));
        pendingBlocks.delete(e.target);
        io.unobserve(e.target);
      });
    }, { threshold: 0.15, rootMargin: "0px 0px -8% 0px" });
    items.forEach((el) => { pendingBlocks.add(el); io.observe(el); });
  }

  /* Headings rise word by word out of a mask. Big statements ([data-scrub]) scrub word opacity with the scroll instead (CSS only).
     Only text nodes are split, so <em> and links keep working, and the real spaces stay between the words. */
  function wrapWords(el, make) {
    const out = [];
    const walk = (node) => Array.from(node.childNodes).forEach((c) => {
      if (c.nodeType === 3) {
        const frag = document.createDocumentFragment();
        c.textContent.split(/(\s+)/).forEach((p) => {
          if (!p) return;
          if (/^\s+$/.test(p)) { frag.appendChild(document.createTextNode(p)); return; }
          const w = make(p, out.length);
          out.push(w);
          frag.appendChild(w);
        });
        node.replaceChild(frag, c);
      } else if (c.nodeType === 1) walk(c);
    });
    walk(el);
    return out;
  }
  function headings() {
    if (reduced.matches || !window.Lenis) { $$("main h1").forEach((h) => h.classList.add("split")); return; }
    const inView = (el) => el.getBoundingClientRect().top < innerHeight * 0.85;
    const hs = $$("main h1, main h2").filter((h) => !h.classList.contains("vh") && !h.closest(".legal") && (!h.hasAttribute("data-scrub") || inView(h)));
    const scrubs = $$("[data-scrub]").filter((el) => !hs.includes(el) && !inView(el));
    scrubs.forEach((el) => wrapWords(el, (p, i) => {
      const w = document.createElement("span");
      w.className = "w"; w.style.setProperty("--i", Math.min(i, 12)); w.textContent = p;
      return w;
    }));
    const groups = hs.map((h) => ({ h, words: wrapWords(h, (p, i) => {
      const w = document.createElement("span"), x = document.createElement("span");
      w.className = "wd"; x.className = "wi"; x.textContent = p;
      w.style.setProperty("--w", i);
      w.appendChild(x);
      return w;
    }) }));
    groups.forEach((g) => g.h.classList.add("split"));
    if (!("IntersectionObserver" in window)) { groups.forEach((g) => g.words.forEach((w) => w.classList.add("in"))); return; }
    const byEl = new Map(groups.map((g) => [g.h, g.words]));
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!pendingHeads.has(e.target)) { io.unobserve(e.target); return; }
        if (!e.isIntersecting && e.boundingClientRect.top >= 0) return;
        if (!e.isIntersecting) e.target.classList.add("h-now");   // already scrolled past: no animation
        byEl.get(e.target).forEach((w) => w.classList.add("in"));
        pendingHeads.delete(e.target);
        io.unobserve(e.target);
      });
    }, { threshold: 0.15, rootMargin: "0px 0px -8% 0px" });
    groups.forEach((g) => { pendingHeads.set(g.h, g.words); io.observe(g.h); });
  }
  function fontsThen(fn) {
    let done = false;
    const go = () => { if (!done) { done = true; fn(); } };
    const ready = window.document.fonts && document.fonts.load
      ? Promise.all([document.fonts.load("700 1em Fraunces"), document.fonts.load("italic 700 1em Fraunces")]).then(() => document.fonts.ready)
      : Promise.resolve();
    ready.then(go, go);
    setTimeout(go, 1200);                                          // never hold the headings back for slow fonts
  }

  /* Nav, progress bar, hero drift: all read in one scroll handler. */
  const nav = $("#nav");
  const drift = $("[data-drift]");
  const bar = $(".progress i");
  const legal = $("#legal");
  let lastY = scrollY, acc = 0, ticking = false;

  function frame() {
    ticking = false;
    sweep();
    const y = lenis ? lenis.scroll : scrollY;
    // nav: slides away on the way down, back on the way up, after 8px in one direction. Never without Lenis (reduced motion).
    const d = y - lastY;
    lastY = y;
    if (!lenis || y < 480 || nav.contains(document.activeElement)) { nav.classList.remove("hide"); acc = 0; }
    else {
      if (d !== 0 && Math.sign(d) !== Math.sign(acc)) acc = 0;
      acc += d;
      if (acc > 8) nav.classList.add("hide"); else if (acc < -8) nav.classList.remove("hide");
    }

    // reading bar: full at the end of the useful content (the legal text, where a page has it, is not counted)
    if (bar) {
      const end = (legal ? legal.getBoundingClientRect().top + scrollY : document.documentElement.scrollHeight) - innerHeight;
      bar.style.transform = "scaleX(" + (end > 0 ? clamp(scrollY / end, 0, 1) : 1).toFixed(4) + ")";
    }

    // hero: the card drifts at 0.92x page speed for the first 600px
    if (drift) drift.style.transform = !lenis || y > 900 ? "" : "translate3d(0," + (clamp(y, 0, 600) * 0.08).toFixed(1) + "px,0)";
  }
  function onScroll() { if (!ticking) { ticking = true; requestAnimationFrame(frame); } }

  /* English | Hinglish: both chats share one grid cell, so nothing moves when they swap. */
  function chat() {
    const en = $("#talk-en"), hi = $("#talk-hi");
    if (!en || !hi) return;
    const show = (lang) => {
      const on = lang === "hi" ? hi : en, off = lang === "hi" ? en : hi;
      off.classList.remove("on"); off.setAttribute("aria-hidden", "true"); off.inert = true;
      on.classList.add("on"); on.removeAttribute("aria-hidden"); on.inert = false;
    };
    hi.setAttribute("aria-hidden", "true"); hi.inert = true;
    $$("input[name=talk-lang]").forEach((r) => r.addEventListener("change", () => show(r.value)));
  }

  /* Get to know Gyanz: arrows move one card; the buttons dim at either end. The rail itself scrolls natively and takes the keyboard. */
  function gallery() {
    const rail = $("[data-rail]"), btns = $$("[data-gnav] button");
    if (!rail || btns.length !== 2) return;
    const state = () => { btns[0].disabled = rail.scrollLeft < 4; btns[1].disabled = rail.scrollLeft + rail.clientWidth >= rail.scrollWidth - 4; };
    btns.forEach((b) => b.addEventListener("click", () => {
      const card = rail.firstElementChild;
      rail.scrollBy({ left: Number(b.dataset.dir) * (card.getBoundingClientRect().width + 16), behavior: reduced.matches ? "auto" : "smooth" });
    }));
    rail.addEventListener("scroll", state, { passive: true });
    state();
  }

  /* Theme: dark by default. The head script applies the saved choice before paint; this button changes and saves it. */
  function theme() {
    const btn = $("[data-theme-toggle]");
    if (!btn) return;
    const meta = $('meta[name="theme-color"]');
    const apply = (t) => {
      root.setAttribute("data-theme", t);
      btn.setAttribute("aria-label", t === "light" ? "Switch to dark theme" : "Switch to light theme");
      if (meta) meta.setAttribute("content", t === "light" ? "#F5F7FA" : "#0B1220");
    };
    apply(root.getAttribute("data-theme") === "light" ? "light" : "dark");
    btn.addEventListener("click", () => {
      const next = root.getAttribute("data-theme") === "light" ? "dark" : "light";
      apply(next);
      try { localStorage.setItem("gyanz-theme", next); } catch (e) { /* private window: the choice just lasts for this page */ }
    });
  }

  reduced.addEventListener("change", () => { syncLenis(); onScroll(); });
  nav.addEventListener("focusin", () => nav.classList.remove("hide"));

  /* A tab that was in the background (or a page restored by Back/Forward) can miss its observer callbacks: show whatever is on screen when it returns. */
  const recheck = () => { lastY = scrollY; sweep(); frame(); };
  addEventListener("pageshow", recheck);
  addEventListener("focus", recheck);
  addEventListener("resize", recheck);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) recheck(); });
  let tries = 0;
  const backstop = setInterval(() => { sweep(); if (++tries > 12) clearInterval(backstop); }, 400);

  reveals();
  syncLenis();
  theme();
  chat();
  gallery();
  frame();
  fontsThen(headings);

  /* Back/Forward: the browser restores the scroll before fonts and split headings settle the page height, so it lands short. Put the saved spot back once the layout is final. */
  /* The saved spot belongs to one history entry, not to one address: Home can be in the history twice. */
  let yId = "";
  try { yId = history.state && history.state.gyanzId; if (!yId) { yId = Math.random().toString(36).slice(2) + Date.now().toString(36); history.replaceState(Object.assign({}, history.state, { gyanzId: yId }), ""); } } catch (e) {}
  const yKey = "gyanz-y:" + (yId || location.pathname);
  addEventListener("pagehide", () => { try { sessionStorage.setItem(yKey, String(Math.round(scrollY))); } catch (e) {} });
  try {
    const entry = performance.getEntriesByType("navigation")[0], y = +sessionStorage.getItem(yKey);
    if (entry && entry.type === "back_forward" && y > 0) fontsThen(() => { if (lenis) lenis.scrollTo(y, { immediate: true, force: true }); else scrollTo(0, y); recheck(); });
  } catch (e) {}
})();
