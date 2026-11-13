// Løfter planfiler fra eldre formatversjoner til den appen bruker nå, før de sjekkes.
// Når formatet endres på en måte som ikke bare legger til valgfrie felt: øk FORMAT_VERSION
// og legg inn et steg her fra forrige versjon. Stegene kjøres etter hverandre, så en fil
// fra v1 går gjennom alle steg fram til gjeldende versjon.
import { FORMAT_VERSION } from './types';

type Obj = Record<string, unknown>;
/** Steget fra versjon n til n + 1. Får en kopi og kan endre den. */
export type MigrationStep = (data: Obj) => void;

/** Ingen steg ennå: v1 er gjeldende versjon. */
export const MIGRATIONS: Record<number, MigrationStep> = {};

/**
 * Planen løftet til target-versjonen, eller uendret når den er ny nok, har ukjent versjon eller
 * mangler et steg. Valideringen sier da fra om versjonen.
 */
export function migrate(data: Obj, steps: Record<number, MigrationStep> = MIGRATIONS, target = FORMAT_VERSION): Obj {
  if (typeof data.version !== 'number' || data.version >= target) return data;
  for (let v = data.version; v < target; v++) if (!steps[v]) return data;
  const out = structuredClone(data);
  for (let v = data.version; v < target; v++) {
    steps[v](out);
    out.version = v + 1;
  }
  return out;
}
