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
