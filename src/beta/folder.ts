// Beta: åpne og lagre planer i en mappe brukeren velger, for eksempel en SharePoint-mappe som er
// koblet til PC-en med OneDrive. Nettleseren gir appen tilgang til akkurat den mappen og ingenting
// annet. Det er ingen nettverkskall her: alt går gjennom filsystemet på PC-en.
//
// Mappen huskes mellom øktene ved at nettleserens tilgangsnøkkel til mappen (et «handle») legges i
// IndexedDB. Nøkkelen er bare en peker til mappen; den inneholder ingen plandata. Ved ny økt må
// brukeren bekrefte tilgangen med ett klikk, fordi nettleseren krever det.

import { setStartDir } from '../pickstart';

type Perm = 'granted' | 'denied' | 'prompt';
type PermHandle = FileSystemHandle & {
  queryPermission(o: { mode: 'readwrite' }): Promise<Perm>;
  requestPermission(o: { mode: 'readwrite' }): Promise<Perm>;
};
type DirPicker = (o: { id?: string; mode?: 'readwrite'; startIn?: string }) => Promise<FileSystemDirectoryHandle>;
type OpenFile = (file: File, handle?: FileSystemFileHandle) => Promise<boolean>;

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

export function startBeta(openFile: OpenFile) {
  const picker = (window as unknown as { showDirectoryPicker?: DirPicker }).showDirectoryPicker;
  const version = document.getElementById('version');
  if (version) version.textContent += ' · beta';

  const bar = el('section', '', 'beta-bar no-print');
  bar.setAttribute('aria-label', 'Beta: mappe');
  const head = el('div', '', 'beta-row');
  const tag = el('strong', 'Beta: mappe');
  const state = el('span', '', 'muted');
  const choose = button('Velg mappe', 'Velg mappen planene skal åpnes fra og lagres i');
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

  let dir: FileSystemDirectoryHandle | undefined;

  const say = (text: string, kind: 'muted' | 'ok' | 'error' = 'muted') => {
    log.textContent = text;
    log.className = `${kind} small beta-log`;
  };

  function sync(access: boolean) {
    state.textContent = dir ? `«${dir.name}»${access ? '' : ' (trenger tilgang)'}` : 'Ingen mappe valgt';
    grant.hidden = !dir || access;
    for (const b of [refresh, test]) b.hidden = !dir || !access;
    drop.hidden = !dir;
    choose.textContent = dir ? 'Velg en annen mappe' : 'Velg mappe';
    setStartDir(dir && access ? dir : undefined);
    if (!dir || !access) files.replaceChildren();
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
    files.replaceChildren(
      ...(found.length
        ? found.map(({ handle, file }) => {
            const b = button('', 'Åpne planen. Ctrl+S lagrer en arbeidsfil rett tilbake hit.');
            b.classList.add('beta-file');
            b.append(el('span', file.name), el('span', `${kb(file.size)} · ${when(file.lastModified)}`, 'muted'));
            b.addEventListener('click', () => open(handle));
            return b;
          })
        : [el('span', 'Ingen planfiler (.pdf eller .json) i mappen.', 'muted small')]),
    );
    say(`Fant ${found.length} planfiler i «${dir.name}» på ${ms(t0)}.`);
  }

  async function open(handle: FileSystemFileHandle) {
    const t0 = performance.now();
    say(`Leser ${handle.name} …`);
    try {
      // For filer som bare ligger i skyen («Filer ved behov») laster OneDrive dem ned her
      const file = await handle.getFile();
      await file.arrayBuffer();
      const read = ms(t0);
      if (await openFile(file, handle)) say(`Åpnet ${handle.name} (${kb(file.size)}, lest på ${read}).`, 'ok');
      else say(`${handle.name} ble ikke åpnet.`);
    } catch (e) {
      say(`Kunne ikke lese ${handle.name}: ${why(e)}`, 'error');
    }
  }

  async function use(h: FileSystemDirectoryHandle) {
    dir = h;
    const access = (await (h as unknown as PermHandle).queryPermission({ mode: 'readwrite' })) === 'granted';
    sync(access);
    if (access) await list();
  }

  choose.addEventListener('click', async () => {
    if (!picker) return;
    try {
      const h = await picker({ id: 'schemplan-beta', mode: 'readwrite', startIn: 'documents' });
      await remember(h).catch(() => {});
      await use(h);
    } catch (e) {
      if ((e as Error).name !== 'AbortError') say(`Mappen ble ikke valgt: ${why(e)}`, 'error');
    }
  });
  grant.addEventListener('click', async () => {
    if (!dir) return;
    try {
      const p = await (dir as unknown as PermHandle).requestPermission({ mode: 'readwrite' });
      sync(p === 'granted');
      if (p === 'granted') await list();
      else say('Nettleseren ga ikke tilgang til mappen.', 'error');
    } catch (e) {
      say(`Tilgang feilet: ${why(e)}`, 'error');
    }
  });
  refresh.addEventListener('click', () => void list());
  drop.addEventListener('click', async () => {
    await forget().catch(() => {});
    dir = undefined;
    sync(false);
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
      say(`Skriving virker: skrev, leste tilbake og slettet ${name} (skrevet på ${wrote}, alt på ${ms(t0)}).`, 'ok');
    } catch (e) {
      say(`Skriving feilet: ${why(e)}`, 'error');
    }
  });

  if (!picker) {
    sync(false);
    for (const b of [choose, grant, refresh, test, drop]) b.hidden = true;
    state.textContent = 'Denne nettleseren kan ikke gi appen tilgang til en mappe. Bruk Edge eller Chrome på PC.';
    return;
  }
  sync(false);
  void recall().then((h) => (h ? use(h) : undefined));
}
