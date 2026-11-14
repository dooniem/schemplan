// Beta: åpne og lagre planer i en mappe brukeren velger, for eksempel en SharePoint-mappe som er
// koblet til PC-en med OneDrive. Nettleseren gir appen tilgang til akkurat den mappen og ingenting
// annet. Det er ingen nettverkskall her: alt går gjennom filsystemet på PC-en.
//
// Brukeren velger én gang en toppmappe, helst den øverste med firmanavnet. Når planen kommer fra
// Project med stien til mappen Project-filen ligger i, finner appen prosjektmappen under toppmappen selv.
//
// Mappen huskes mellom øktene ved at nettleserens tilgangsnøkkel til mappen (et «handle») legges i
// IndexedDB. Nøkkelen er bare en peker til mappen; den inneholder ingen plandata. Ved ny økt må
// brukeren bekrefte tilgangen med ett klikk, fordi nettleseren krever det.

import { setStartDir, watchWantedFolder } from '../pickstart';

type Perm = 'granted' | 'denied' | 'prompt';
type PermHandle = FileSystemHandle & {
  queryPermission(o: { mode: 'readwrite' }): Promise<Perm>;
  requestPermission(o: { mode: 'readwrite' }): Promise<Perm>;
};
type DirPicker = (o: { id?: string; mode?: 'readwrite'; startIn?: string }) => Promise<FileSystemDirectoryHandle>;
type Hooks = {
  /** Åpner en plan. Med handle lagrer Ctrl+S arbeidsfilen tilbake dit. */
  openFile: (file: File, handle?: FileSystemFileHandle) => Promise<boolean>;
  /** Oppdaterer planen fra Project med redigeringene i arbeidsfilen. */
  updateWith: (file: File, handle?: FileSystemFileHandle) => Promise<void>;
};

// ---- Huske mappen (IndexedDB, bare tilgangsnøkkelen) ----
const DB = 'schemplan-beta';
const STORE = 'mappe';
const KEY = 'mappe';

function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idb<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const d = await db();
  return new Promise<T>((resolve, reject) => {
    const req = fn(d.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
  }).finally(() => d.close());
}
const remember = (h: FileSystemDirectoryHandle) => idb<void>('readwrite', (s) => s.put(h, KEY));
const forget = () => idb<void>('readwrite', (s) => s.delete(KEY));
const recall = () => idb<FileSystemDirectoryHandle | undefined>('readonly', (s) => s.get(KEY)).catch(() => undefined);

// ---- Hjelpere ----
function el<K extends keyof HTMLElementTagNameMap>(tag: K, text = '', cls = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (text) e.textContent = text;
  if (cls) e.className = cls;
  return e;
}
function button(text: string, title = ''): HTMLButtonElement {
  const b = el('button', text, 'button small');
  b.type = 'button';
  if (title) b.title = title;
  return b;
}
const kb = (n: number) => `${Math.max(1, Math.round(n / 1024))} kB`;
const ms = (t0: number) => `${Math.round(performance.now() - t0)} ms`;
const when = (t: number) => new Date(t).toLocaleString('nb-NO', { dateStyle: 'short', timeStyle: 'short' });
const why = (e: unknown) => `${(e as Error).name}: ${(e as Error).message}`;

/** Finner mappen med den lokale stien under toppmappen. Toppmappens navn må være en del av stien. */
async function findUnder(root: FileSystemDirectoryHandle, path: string): Promise<{ dir: FileSystemDirectoryHandle; parts: string[] } | null> {
  const segs = path.split(/[\\/]+/).filter(Boolean);
  const name = root.name.toLowerCase();
  for (let i = 0; i < segs.length; i++) {
    if (segs[i].toLowerCase() !== name) continue;
    try {
      let dir = root;
      for (const seg of segs.slice(i + 1)) dir = await dir.getDirectoryHandle(seg);
      return { dir, parts: segs.slice(i + 1) };
    } catch {
      // Prøv neste sted i stien med samme navn
    }
  }
  return null;
}

export function startBeta({ openFile, updateWith }: Hooks) {
  const picker = (window as unknown as { showDirectoryPicker?: DirPicker }).showDirectoryPicker;
  const version = document.getElementById('version');
  if (version) version.textContent += ' · beta';

  const bar = el('section', '', 'beta-bar no-print');
  bar.setAttribute('aria-label', 'Beta: mappe');
  const head = el('div', '', 'beta-row');
  const tag = el('strong', 'Beta: mappe');
  const state = el('span', '', 'muted');
  const choose = button('Velg mappe', 'Velg den øverste mappen med firmanavnet, så finner appen prosjektmappene under den selv');
  const grant = button('Gi tilgang', 'Nettleseren må få bekreftet at appen fortsatt kan bruke mappen');
  const refresh = button('Oppdater liste');
  const test = button('Test skriving', 'Lager en liten testfil i mappen, leser den tilbake og sletter den');
  const drop = button('Glem mappen', 'Appen slutter å huske mappen. Filene i mappen røres ikke.');
  head.append(tag, state, choose, grant, refresh, test, drop);
  const files = el('div', '', 'beta-files');
  const log = el('p', '', 'muted small beta-log');
  log.setAttribute('aria-live', 'polite');
  bar.append(head, files, log);
  document.querySelector('.topbar')?.after(bar);

  // Arbeidsfilene i prosjektmappen vises også i spørsmålet fra «Oppdater i Web»
  const updList = el('div', '', 'beta-files beta-update');
  document.querySelector('#update-dialog .ask-actions')?.before(updList);

  let root: FileSystemDirectoryHandle | undefined;
  let access = false;
  let wanted = '';
  /** Mappen som vises og lagres i: prosjektmappen hvis den er funnet, ellers toppmappen. */
  let dir: FileSystemDirectoryHandle | undefined;
  let where = '';

  const say = (text: string, kind: 'muted' | 'ok' | 'error' = 'muted') => {
    log.textContent = text;
    log.className = `${kind} small beta-log`;
  };

  function sync() {
    state.textContent = !root
      ? wanted
        ? `Planen ligger i ${wanted}`
        : 'Ingen mappe valgt'
      : `«${root.name}»${access ? where : ' (trenger tilgang)'}`;
    grant.hidden = !root || access;
    for (const b of [refresh, test]) b.hidden = !dir || !access;
    drop.hidden = !root;
    choose.textContent = root ? 'Velg en annen mappe' : 'Velg mappe';
    setStartDir(dir && access ? dir : undefined);
    if (!dir || !access) {
      files.replaceChildren();
      updList.replaceChildren();
    }
  }

  /** Finn prosjektmappen under toppmappen og vis filene der. */
  async function settle() {
    dir = root;
    where = '';
    if (root && access && wanted) {
      const t0 = performance.now();
      const found = await findUnder(root, wanted);
      if (found) {
        dir = found.dir;
        where = found.parts.length ? ` › ${found.parts.join(' › ')} (fra Project)` : ' (fra Project)';
        say(`Fant prosjektmappen på ${ms(t0)}.`, 'ok');
      } else {
        say(`Fant ikke ${wanted} under «${root.name}». Velg en mappe som har prosjektmappen inni seg, helst den øverste med firmanavnet.`, 'error');
      }
    } else if (!root && wanted) {
      say('Klikk «Velg mappe» og velg den øverste mappen med firmanavnet. Da finner appen prosjektmappen selv, også neste gang.');
    }
    sync();
    if (dir && access) await list();
  }

  async function list() {
    if (!dir) return;
    const t0 = performance.now();
    const found: { handle: FileSystemFileHandle; file: File }[] = [];
    try {
      for await (const h of (dir as unknown as { values(): AsyncIterable<FileSystemHandle> }).values()) {
        if (h.kind !== 'file' || !/\.(pdf|json)$/i.test(h.name)) continue;
        const handle = h as FileSystemFileHandle;
        found.push({ handle, file: await handle.getFile() });
      }
    } catch (e) {
      say(`Kunne ikke lese mappen: ${why(e)}`, 'error');
      return;
    }
    found.sort((a, b) => b.file.lastModified - a.file.lastModified);
    const fileButton = ({ file }: (typeof found)[number], title: string, act: () => void) => {
      const b = button('', title);
      b.classList.add('beta-file');
      b.append(el('span', file.name), el('span', `${kb(file.size)} · ${when(file.lastModified)}`, 'muted'));
      b.addEventListener('click', act);
      return b;
    };
    files.replaceChildren(
      ...(found.length
        ? found.map((f) => fileButton(f, 'Åpne planen. Ctrl+S lagrer en arbeidsfil rett tilbake hit.', () => open(f.handle)))
        : [el('span', 'Ingen planfiler (.pdf eller .json) i mappen.', 'muted small')]),
    );
    const pdfs = found.filter((f) => /\.pdf$/i.test(f.file.name));
    updList.replaceChildren(
      ...(pdfs.length
        ? [el('p', `Arbeidsfiler i «${dir.name}»:`, 'small'), ...pdfs.map((f) => fileButton(f, 'Oppdater med redigeringene i denne arbeidsfilen', () => update(f.handle)))]
        : []),
    );
    if (!log.classList.contains('error')) say(`Fant ${found.length} planfiler i «${dir.name}» på ${ms(t0)}.`);
  }

  async function read(handle: FileSystemFileHandle): Promise<{ file: File; time: string }> {
    const t0 = performance.now();
    // For filer som bare ligger i skyen («Filer ved behov») laster OneDrive dem ned her
    const file = await handle.getFile();
    await file.arrayBuffer();
    return { file, time: ms(t0) };
  }

  async function open(handle: FileSystemFileHandle) {
    say(`Leser ${handle.name} …`);
    try {
      const { file, time } = await read(handle);
      if (await openFile(file, handle)) say(`Åpnet ${handle.name} (${kb(file.size)}, lest på ${time}).`, 'ok');
      else say(`${handle.name} ble ikke åpnet.`);
    } catch (e) {
      say(`Kunne ikke lese ${handle.name}: ${why(e)}`, 'error');
    }
  }

  async function update(handle: FileSystemFileHandle) {
    try {
      const { file, time } = await read(handle);
      await updateWith(file, handle);
      say(`Leste ${handle.name} på ${time}. Ctrl+S lagrer den oppdaterte planen tilbake til den.`, 'ok');
    } catch (e) {
      say(`Kunne ikke lese ${handle.name}: ${why(e)}`, 'error');
    }
  }

  async function use(h: FileSystemDirectoryHandle) {
    root = h;
    access = (await (h as unknown as PermHandle).queryPermission({ mode: 'readwrite' })) === 'granted';
    await settle();
  }

  choose.addEventListener('click', async () => {
    if (!picker) return;
    try {
      const h = await picker({ id: 'schemplan-beta', mode: 'readwrite', startIn: 'documents' });
      await remember(h).catch(() => {});
      say('');
      await use(h);
    } catch (e) {
      if ((e as Error).name !== 'AbortError') say(`Mappen ble ikke valgt: ${why(e)}`, 'error');
    }
  });
  grant.addEventListener('click', async () => {
    if (!root) return;
    try {
      access = (await (root as unknown as PermHandle).requestPermission({ mode: 'readwrite' })) === 'granted';
      if (!access) say('Nettleseren ga ikke tilgang til mappen.', 'error');
      await settle();
    } catch (e) {
      say(`Tilgang feilet: ${why(e)}`, 'error');
    }
  });
  refresh.addEventListener('click', () => void list());
  drop.addEventListener('click', async () => {
    await forget().catch(() => {});
    root = dir = undefined;
    access = false;
    where = '';
    sync();
    say('Appen husker ikke mappen lenger.');
  });
  test.addEventListener('click', async () => {
    if (!dir) return;
    const name = `schemplan-test-${Date.now()}.txt`;
    const text = `Testfil fra Skjematisk plan (beta), ${new Date().toISOString()}. Kan slettes.`;
    const t0 = performance.now();
    try {
      const h = await dir.getFileHandle(name, { create: true });
      const w = await h.createWritable();
      await w.write(text);
      await w.close();
      const wrote = ms(t0);
      const back = await (await h.getFile()).text();
      if (back !== text) throw new Error('innholdet som ble lest tilbake, var ikke det samme');
      await dir.removeEntry(name);
      say(`Skriving virker i «${dir.name}»: skrev, leste tilbake og slettet ${name} (skrevet på ${wrote}, alt på ${ms(t0)}).`, 'ok');
    } catch (e) {
      say(`Skriving feilet: ${why(e)}`, 'error');
    }
  });

  if (!picker) {
    sync();
    for (const b of [choose, grant, refresh, test, drop]) b.hidden = true;
    state.textContent = 'Denne nettleseren kan ikke gi appen tilgang til en mappe. Bruk Edge eller Chrome på PC.';
    return;
  }
  sync();
  const ready = recall().then((h) => (h ? use(h) : undefined));
  watchWantedFolder((path) => {
    wanted = path;
    void ready.then(settle);
  });
}
