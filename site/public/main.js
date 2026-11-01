// AI Document Editor site: progressive enhancement only. Without this file every section still reads,
// every panel shows and every download link works.
(() => {
  const root = document.documentElement;
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
  const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const canObserve = 'IntersectionObserver' in window;

  /** Calls fn once, when el first scrolls into view. */
  function onceVisible(el, fn, threshold = 0.2) {
    if (!canObserve) return fn();
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { io.disconnect(); fn(); }
    }, { threshold, rootMargin: '0px 0px -8% 0px' });
    io.observe(el);
  }

  // Scroll reveals. Anything already on screen is marked shown in the same task the `js` class is
  // added, so nothing above the fold blinks out and back in.
  const reveals = $$('.reveal');
  if (!canObserve) reveals.forEach((el) => el.classList.add('in'));
  else {
    reveals.forEach((el) => {
      const box = el.getBoundingClientRect();
      if (box.top < innerHeight && box.bottom > 0) el.classList.add('in');
      else onceVisible(el, () => el.classList.add('in'), 0.12);
    });
  }
  root.classList.add('js');

  // Mobile menu
  const menuBtn = $('.menu-btn');
  const nav = $('#nav');
  const setMenu = (open) => { menuBtn.setAttribute('aria-expanded', open); nav.classList.toggle('is-open', open); };
  menuBtn.addEventListener('click', () => setMenu(menuBtn.getAttribute('aria-expanded') !== 'true'));
  nav.addEventListener('click', (e) => { if (e.target.closest('a')) setMenu(false); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && nav.classList.contains('is-open')) { setMenu(false); menuBtn.focus(); }
  });

  // Mark the nav link of the section being read.
  const navLinks = new Map($$('.nav a[href^="#"]').map((a) => [a.hash.slice(1), a]));
  if (canObserve) {
    const spy = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        navLinks.forEach((a) => a.removeAttribute('aria-current'));
        navLinks.get(e.target.id)?.setAttribute('aria-current', 'location');
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    $$('main section[id]').forEach((s) => spy.observe(s));
  }

  // Download toast. The link itself is never intercepted: the browser follows it and saves the file.
  const toast = $('#toast');
  const toastLive = $('#toast-live');
  let toastTimer;
  const hideToast = () => {
    toast.classList.remove('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.hidden = true; }, 250);
  };
  document.addEventListener('click', (e) => {
    if (!e.target.closest('[data-download]')) return;
    clearTimeout(toastTimer);
    toast.hidden = false;
    requestAnimationFrame(() => toast.classList.add('show'));
    toastLive.textContent = '';
    setTimeout(() => { toastLive.textContent = toast.textContent.trim().replace(/\s+/g, ' '); }, 100);
    toastTimer = setTimeout(hideToast, 9000);
  });
  $('.toast-close').addEventListener('click', hideToast);

  // Screenshot: tap toggles colour on touch screens (hover does it elsewhere).
  const shot = $('.shot');
  shot.addEventListener('click', () => shot.classList.toggle('is-colour'));

  // Copy buttons
  $$('[data-copy]').forEach((btn) => btn.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(btn.dataset.copy); btn.textContent = 'copied'; }
    catch { btn.textContent = 'press ctrl+c'; }
    setTimeout(() => { btn.textContent = 'copy'; }, 1600);
  }));

  // RAG example: a citation highlights its passage.
  $$('.cite').forEach((a) => a.addEventListener('click', (e) => {
    e.preventDefault();
    const target = document.getElementById(a.hash.slice(1));
    $$('.rag-src li').forEach((li) => li.classList.toggle('is-hit', li === target));
  }));

  // Tabs (WAI-ARIA pattern: arrow keys move, only the selected tab is in the tab order).
  $$('[role="tablist"]').forEach((list) => {
    const tabs = $$('[role="tab"]', list);
    const panels = tabs.map((t) => document.getElementById(t.getAttribute('aria-controls')));
    const select = (i, focus) => {
      tabs.forEach((t, k) => {
        t.setAttribute('aria-selected', k === i);
        t.tabIndex = k === i ? 0 : -1;
        panels[k].hidden = k !== i;
      });
      if (focus) tabs[i].focus();
    };
    tabs.forEach((t, i) => t.addEventListener('click', () => select(i)));
    list.addEventListener('keydown', (e) => {
      const i = tabs.indexOf(document.activeElement);
      const to = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
      if (i < 0 || to === undefined) return;
      e.preventDefault();
      select((to + tabs.length) % tabs.length, true);
    });
    select(0);
  });

  if (reduced) return;

  // Typewriter for the Deep read code. The real code stays in the page (transparent, so screen readers
  // and copy-paste get all of it); a copy on top is typed out character by character.
  $$('[data-type]').forEach((term) => {
    const src = $('.type-src', term);
    const status = $('[data-status]', term);
    onceVisible(term, () => {
      const out = src.cloneNode(true);
      out.className = 'type-out';
      out.setAttribute('aria-hidden', 'true');
      const walker = document.createTreeWalker(out, NodeFilter.SHOW_TEXT);
      const nodes = [];
      while (walker.nextNode()) nodes.push([walker.currentNode, walker.currentNode.data]);
      nodes.forEach(([node]) => { node.data = ''; });
      const caret = document.createElement('span');
      caret.className = 'caret';
      out.append(caret);
      src.after(out);
      term.classList.add('is-typing');
      status.textContent = 'writing…';

      let n = 0;
      let c = 0;
      const tick = () => {
        if (n === nodes.length) {
          out.remove();
          term.classList.remove('is-typing');
          status.textContent = 'ran · no files · no network';
          status.classList.add('is-done');
          return;
        }
        const [node, text] = nodes[n];
        const ch = text[c++];
        node.data = text.slice(0, c);
        if (c >= text.length) { n += 1; c = 0; }
        setTimeout(tick, ch === '\n' ? 260 : 14 + Math.random() * 34);
      };
      setTimeout(tick, 400);
    }, 0.4);
  });

  // Autocomplete demo: type, pause, grey suggestion, Tab, repeat. Pauses while off screen.
  const ac = $('[data-autocomplete]');
  if (ac && canObserve) {
    const typed = $('.ac-typed', ac);
    const ghost = $('.ac-ghost', ac);
    const key = $('.key', ac);
    const lines = [
      ['The launch moves to March because ', 'the vendor needs two more weeks for testing.'],
      ['Thank you for your patience while ', 'we finish reviewing the contract.'],
      ['Revenue grew this quarter, driven mostly by ', 'renewals from our largest customers.'],
    ];
    let visible = false;
    let wake = null;
    new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible && wake) { wake(); wake = null; }
    }, { threshold: 0.5 }).observe(ac);
    const whenVisible = () => (visible ? Promise.resolve() : new Promise((done) => { wake = done; }));

    (async () => {
      for (let i = 0; ; i = (i + 1) % lines.length) {
        await whenVisible();
        const [start, rest] = lines[i];
        typed.textContent = '';
        ghost.textContent = '';
        ghost.classList.remove('is-in');
        await sleep(500);
        for (const ch of start) { typed.textContent += ch; await sleep(35 + Math.random() * 55); }
        await sleep(650);
        ghost.textContent = rest;
        ghost.classList.add('is-in');
        await sleep(1500);
        key.classList.add('is-pressed');
        await sleep(200);
        key.classList.remove('is-pressed');
        typed.textContent = start + rest + ' ';
        ghost.textContent = '';
        await sleep(2400);
      }
    })();
  }
})();
