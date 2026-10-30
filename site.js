/* gyanz.co.in: smooth scroll, text reveals, nav, the pinned story, the chat toggle and the gallery. No window scroll listeners:
   page scroll comes from Lenis events, the progress bar and nav hairline are CSS, and reveals use IntersectionObserver. No dependencies except vendor/lenis.min.js.
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
  const pendingHeads = new Map();
  function sweep() {
    pendingBlocks.forEach((el) => {
      if (el.getBoundingClientRect().bottom >= 0) return;
      el.classList.add("now", "in");
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
    if (!("IntersectionObserver" in window) || reduced.matches || !window.Lenis) { items.forEach((el) => el.classList.add("in", "now")); return; }
    $$("[data-count]").forEach((n) => { n.textContent = "0"; });   // counted up once on reveal; the HTML holds the real number
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting && e.boundingClientRect.top >= 0) return;
        const above = !e.isIntersecting && e.boundingClientRect.bottom < 0;
        if (above) e.target.classList.add("now");
        e.target.classList.add("in");
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

  /* Nav, progress bar, hero drift, the pinned story: all read in one scroll handler. */
  const nav = $("#nav");
  const drift = $("[data-drift]");
  const how = $("#how");
  const track = how && $("[data-track]", how);
  const stepEls = how ? $$("[data-steps] > li", how) : [];
  const nodes = how ? $$("[data-nodes] > .node", how) : [];
  const capOut = how && $("[data-cap-out]", how);
  const staticCap = capOut ? capOut.textContent : "";
  let lastY = scrollY, acc = 0, step = -1, ticking = false;

  function setStep(i) {
    if (i === step) return;
    step = i;
    stepEls.forEach((el, k) => { if (k === i) el.setAttribute("aria-current", "step"); else el.removeAttribute("aria-current"); });
    nodes.forEach((n, k) => { n.classList.toggle("on", k <= i); n.classList.toggle("drawn", k < i); });
    if (capOut && stepEls[i]) capOut.textContent = stepEls[i].dataset.cap;
  }

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

    // hero: the card drifts at 0.92x page speed for the first 600px
    if (drift) drift.style.transform = !lenis || y > 900 ? "" : "translate3d(0," + (clamp(y, 0, 600) * 0.08).toFixed(1) + "px,0)";

    // pinned story
    if (how && track && how.classList.contains("pin")) {
      const r = track.getBoundingClientRect();
      const span = r.height - innerHeight;
      const p = span > 0 ? clamp(-r.top / span, 0, 1) : 0;
      setStep(Math.min(stepEls.length - 1, Math.floor(p * stepEls.length)));
    }
  }
  function onScroll() { if (!ticking) { ticking = true; requestAnimationFrame(frame); } }

  /* The story pins only on a big, motion-friendly screen. Otherwise it stays a plain list with everything lit. */
  const pinQuery = matchMedia("(min-width: 861px) and (min-height: 620px) and (prefers-reduced-motion: no-preference)");
  function syncPin() {
    if (!how) return;
    if (pinQuery.matches && lenis) {
      how.classList.add("pin"); step = -1;
      $$(".reveal", how).forEach((el) => el.classList.add("in", "now"));   // the pinned story is not part of the reveals
      frame();
    } else {
      how.classList.remove("pin");
      step = -1;
      stepEls.forEach((el) => el.removeAttribute("aria-current"));
      nodes.forEach((n) => n.classList.remove("on", "drawn"));
      if (capOut) capOut.textContent = staticCap;
    }
  }

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

  reduced.addEventListener("change", () => { syncLenis(); syncPin(); onScroll(); });
  pinQuery.addEventListener("change", syncPin);
  nav.addEventListener("focusin", () => nav.classList.remove("hide"));

  reveals();
  syncLenis();
  theme();
  chat();
  gallery();
  syncPin();
  frame();
  fontsThen(headings);
})();
