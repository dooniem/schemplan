// Hjelpevinduet: «Kom i gang» (steg som følger rullingen, med bildet ved siden av), søkbare emner
// og «Om appen». Innholdet står i content.ts, bildene i ./img.
import { GROUPS, TOPICS, TOUR, type HelpImage, type HelpTopic } from './content';
import './help.css';

const IMG = import.meta.glob<string>('./img/*.webp', { eager: true, query: '?url', import: 'default' });
const src = (name: string) => IMG[`./img/${name}.webp`] ?? '';

type Tab = 'tour' | 'topics' | 'about';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, html?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
};

const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

const motionOk = () => !matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Et bilde, eller en rekke bilder (før, etter …) med knapper. Rekken bytter av seg selv til brukeren velger. */
function picture(img: HelpImage, alt: string, eager = false): HTMLElement {
  const fig = el('figure', 'hp-fig');
  const mk = (name: string, label: string) => {
    const i = el('img');
    i.src = src(name);
    i.alt = label;
    i.decoding = 'async';
    if (!eager) i.loading = 'lazy';
    return i;
  };
  if (typeof img === 'string') {
    fig.append(mk(img, alt));
    return fig;
  }
  fig.classList.add('hp-seq');
  const frames = el('div', 'hp-frames');
  const imgs = img.frames.map((f) => mk(f.img, `${f.label}: ${alt}`));
  frames.append(...imgs);
  const seg = el('div', 'hp-seq-seg');
  seg.setAttribute('role', 'group');
  seg.setAttribute('aria-label', 'Velg bilde');
  const btns = img.frames.map((f) => {
    const b = el('button', undefined, escapeHtml(f.label));
    b.type = 'button';
    return b;
  });
  seg.append(...btns);
  const cap = el('figcaption', 'hp-seq-note');
  let cur = 0;
  let timer = 0;
  const show = (i: number) => {
    cur = i;
    imgs.forEach((x, j) => x.classList.toggle('is-on', j === i));
    btns.forEach((b, j) => b.setAttribute('aria-pressed', String(j === i)));
    cap.innerHTML = img.frames[i].note ?? '';
    cap.hidden = !img.frames[i].note;
  };
  const stop = () => { clearInterval(timer); timer = 0; };
  btns.forEach((b, i) => b.addEventListener('click', () => { stop(); fig.dataset.chosen = '1'; show(i); }));
  // Bytter bare når bildet vises og brukeren ikke har bedt om mindre bevegelse.
  // Uten bevegelse vises resultatet (siste bilde), og knappene viser de andre.
  show(motionOk() ? 0 : imgs.length - 1);
  if (motionOk()) {
    new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !timer && !fig.dataset.chosen) timer = window.setInterval(() => show((cur + 1) % imgs.length), 3200);
      else if (!e.isIntersecting) stop();
    }).observe(fig);
  }
  fig.append(frames, seg, cap);
  return fig;
}

/** Normaliserer for søk: små bokstaver, uten tegn som ikke er bokstaver eller tall. */
const norm = (s: string) => s.toLowerCase().replace(/<[^>]*>/g, ' ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/** Emnene som passer alle ordene, med treff i tittelen først. */
export function searchTopics(q: string, topics: HelpTopic[] = TOPICS): HelpTopic[] {
  const words = norm(q).split(' ').filter(Boolean);
  if (!words.length) return topics;
  const scored = topics.map((t) => {
    const title = norm(t.title);
    const all = `${title} ${norm(t.group)} ${norm(t.text)} ${norm(t.when ?? '')} ${norm((t.steps ?? []).join(' '))} ${norm(t.words ?? '')}`;
    if (!words.every((w) => all.includes(w))) return null;
    const score = words.reduce((s, w) => s + (title.includes(w) ? 2 : 0) + (` ${title}`.includes(` ${w}`) ? 1 : 0), 0);
    return { t, score };
  }).filter((x): x is { t: HelpTopic; score: number } => !!x);
  return scored.sort((a, b) => b.score - a.score).map((x) => x.t);
}

/** Tittelen med søkeordene markert. */
function marked(title: string, q: string): string {
  const words = norm(q).split(' ').filter(Boolean);
  let html = escapeHtml(title);
  if (!words.length) return html;
  const re = new RegExp(`(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'giu');
  html = html.replace(re, '<mark>$1</mark>');
  return html;
}

export function setupHelp(dialog: HTMLDialogElement, opener: HTMLElement) {
  const tabs = Array.from(dialog.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
  const panes: Record<Tab, HTMLElement> = {
    tour: dialog.querySelector('#help-tour')!,
    topics: dialog.querySelector('#help-topics')!,
    about: dialog.querySelector('#help-about')!,
  };
  const search = dialog.querySelector<HTMLInputElement>('#help-search')!;
  let tab: Tab = 'tour';

  const setTab = (t: Tab, focus = false) => {
    tab = t;
    for (const b of tabs) {
      const on = b.dataset.tab === t;
      b.setAttribute('aria-selected', String(on));
      b.tabIndex = on ? 0 : -1;
      if (on && focus) b.focus();
    }
    for (const [k, p] of Object.entries(panes)) p.hidden = k !== t;
  };
  tabs.forEach((b, i) => {
    b.addEventListener('click', () => setTab(b.dataset.tab as Tab));
    b.addEventListener('keydown', (e) => {
      const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!d) return;
      e.preventDefault();
      setTab(tabs[(i + d + tabs.length) % tabs.length].dataset.tab as Tab, true);
    });
  });

  // ---- Kom i gang ----
  const steps = el('ol', 'tour-steps');
  const stage = el('div', 'tour-stage');
  const frames: HTMLElement[] = [];
  const counter = el('p', 'tour-count');
  TOUR.forEach((s, i) => {
    const li = el('li', 'tour-step');
    li.dataset.i = String(i);
    li.append(el('h4', undefined, escapeHtml(s.title)), el('p', undefined, s.text));
    const inline = picture(s.img, s.alt);
    inline.classList.add('tour-inline');
    li.append(inline);
    const t = TOPICS.find((x) => x.id === s.topic);
    if (t) {
      const more = el('button', 'hp-link', `${escapeHtml(s.more)}<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6"/></svg>`);
      more.type = 'button';
      more.addEventListener('click', () => openTopic(t.id));
      li.append(more);
    }
    steps.append(li);
    const f = picture(s.img, s.alt, i === 0);
    f.classList.add('tour-frame');
    stage.append(f);
    frames.push(f);
  });
  stage.append(counter);
  const end = el('div', 'tour-end');
  end.append(el('p', undefined, 'Det var det viktigste. Alt annet appen kan, finner du under emnene.'));
  const allBtn = el('button', 'button', 'Se alle emner');
  allBtn.type = 'button';
  allBtn.addEventListener('click', () => setTab('topics', true));
  end.append(allBtn);
  const intro = el('div', 'tour-intro');
  intro.append(el('h3', undefined, 'Kom i gang'), el('p', 'help-lede', `${TOUR.length} steg fra planen i Project til ferdig PDF. Rull nedover, så følger bildet med.`));
  const col = el('div', 'tour-col');
  col.append(intro, steps, end);
  panes.tour.append(col, stage);

  let current = -1;
  const setStep = (i: number) => {
    if (i === current) return;
    current = i;
    frames.forEach((f, j) => f.classList.toggle('is-on', j === i));
    steps.querySelectorAll('.tour-step').forEach((s, j) => s.classList.toggle('is-on', j === i));
    counter.textContent = `Steg ${i + 1} av ${TOUR.length}`;
  };
  setStep(0);
  // Steget som krysser midten av ruten er det aktive
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) setStep(Number((e.target as HTMLElement).dataset.i));
  }, { root: panes.tour, rootMargin: '-40% 0px -55% 0px' });
  steps.querySelectorAll('.tour-step').forEach((s) => io.observe(s));
  // Øverst er alltid første steg aktivt, nederst det siste
  panes.tour.addEventListener('scroll', () => {
    const p = panes.tour;
    if (p.scrollTop < 8) setStep(0);
    else if (p.scrollTop + p.clientHeight >= p.scrollHeight - 8) setStep(TOUR.length - 1);
  }, { passive: true });

  // ---- Emner ----
  const nav = el('nav', 'topic-nav');
  nav.setAttribute('aria-label', 'Emner');
  const view = el('article', 'topic-view');
  view.setAttribute('aria-live', 'polite');
  panes.topics.append(nav, view);
  let selected = TOPICS[0].id;

  const showTopic = (id: string) => {
    const t = TOPICS.find((x) => x.id === id);
    if (!t) return;
    selected = id;
    view.replaceChildren();
    view.append(el('h3', undefined, escapeHtml(t.title)));
    view.append(el('p', 'topic-text', t.text));
    if (t.img) view.append(picture(t.img, t.alt ?? t.title, true));
    if (t.when) {
      const sec = el('section', 'topic-when');
      sec.append(el('h4', undefined, 'Når du bruker det'), el('p', 'topic-text', t.when));
      view.append(sec);
    }
    if (t.steps?.length) {
      const sec = el('section', 'topic-steps');
      const ol = el('ol');
      for (const st of t.steps) ol.append(el('li', undefined, st));
      sec.append(el('h4', undefined, 'Eksempel'), ol);
      view.append(sec);
    }
    const see = (t.see ?? []).map((s) => TOPICS.find((x) => x.id === s)).filter((x): x is HelpTopic => !!x);
    if (see.length) {
      const box = el('div', 'topic-see');
      box.append(el('h4', undefined, 'Se også'));
      const ul = el('ul');
      for (const s of see) {
        const b = el('button', 'hp-link', escapeHtml(s.title));
        b.type = 'button';
        b.addEventListener('click', () => { showTopic(s.id); view.scrollTop = 0; });
        const li = el('li');
        li.append(b);
        ul.append(li);
      }
      box.append(ul);
      view.append(box);
    }
    nav.querySelectorAll<HTMLButtonElement>('button[data-id]').forEach((b) => {
      if (b.dataset.id === id) b.setAttribute('aria-current', 'true');
      else b.removeAttribute('aria-current');
    });
    view.scrollTop = 0;
  };

  const renderNav = () => {
    const q = search.value;
    const hits = searchTopics(q);
    nav.replaceChildren();
    if (!hits.length) {
      nav.append(el('h4', undefined, '0 treff'));
      const empty = el('div', 'topic-empty');
      empty.append(el('h3', undefined, `Ingen emner om «${escapeHtml(q.trim())}»`));
      empty.append(el('p', 'topic-text', 'Prøv et annet ord, for eksempel navnet på en knapp eller et valg i menyene.'));
      const clear = el('button', 'button', 'Vis alle emner');
      clear.type = 'button';
      clear.addEventListener('click', () => { search.value = ''; renderNav(); search.focus(); });
      empty.append(clear);
      view.replaceChildren(empty);
      return;
    }
    const groups = q.trim() ? [{ name: `${hits.length} treff`, list: hits }] : GROUPS.map((g) => ({ name: g, list: hits.filter((t) => t.group === g) }));
    for (const g of groups) {
      if (!g.list.length) continue;
      nav.append(el('h4', undefined, escapeHtml(g.name)));
      const ul = el('ul');
      for (const t of g.list) {
        const b = el('button', undefined, marked(t.title, q));
        b.type = 'button';
        b.dataset.id = t.id;
        b.addEventListener('click', () => showTopic(t.id));
        const li = el('li');
        li.append(b);
        ul.append(li);
      }
      nav.append(ul);
    }
    showTopic(hits.some((t) => t.id === selected) && !q.trim() ? selected : hits[0].id);
  };
  renderNav();

  search.addEventListener('input', () => {
    if (tab !== 'topics') setTab('topics');
    renderNav();
  });
  search.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      nav.querySelector<HTMLButtonElement>('button[aria-current]')?.focus();
    } else if (e.key === 'Escape' && search.value) {
      e.preventDefault(); // tømmer søket i stedet for å lukke vinduet
      search.value = '';
      renderNav();
    }
  });

  function openTopic(id: string) {
    if (search.value) { search.value = ''; renderNav(); }
    setTab('topics');
    showTopic(id);
    nav.querySelector<HTMLButtonElement>(`button[data-id="${id}"]`)?.focus();
  }

  // ---- Åpne og lukke ----
  opener.addEventListener('click', () => {
    dialog.showModal();
    if (tab === 'tour') panes.tour.focus({ preventScroll: true });
  });
  dialog.querySelector('#help-close')!.addEventListener('click', () => dialog.close());
  // Klikk utenfor vinduet lukker det
  dialog.addEventListener('click', (e) => e.target === dialog && dialog.close());
  setTab('tour');
}
