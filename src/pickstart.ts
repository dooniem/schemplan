// Mappen Lagre som-dialogene starter i. Settes bare i betaen, når brukeren har valgt en mappe;
// ellers er den tom og dialogene oppfører seg som før.
let dir: FileSystemDirectoryHandle | undefined;

export function setStartDir(d: FileSystemDirectoryHandle | undefined) {
  dir = d;
}

/** Legges til valgene for showSaveFilePicker. */
export function startIn(): { startIn?: FileSystemDirectoryHandle } {
  return dir ? { startIn: dir } : {};
}

// Betaen: stien til mappen planen kom fra (sendt med fra Project). Appen kan ikke åpne en mappe ut fra
// en sti alene, men finner den under en mappe brukeren allerede har gitt tilgang til.
let wanted = '';
let onWanted: ((path: string) => void) | undefined;

export function setWantedFolder(path: string) {
  wanted = path;
  onWanted?.(path);
}

export function watchWantedFolder(fn: (path: string) => void) {
  onWanted = fn;
  if (wanted) fn(wanted);
}
