# schemplan

## Faste regler
- Ingen data lagres i appen: ingen server, ingen localStorage/IndexedDB for plandata, ingen telemetri.
- Sikkerhetssperren (CSP med `connect-src 'none'`) i `vite.config.ts` skal aldri svekkes. Ingen CDN-er eller eksterne kall; alt pakkes inn.
- Repoet er offentlig. Ingen prosjektdata, eksempelfiler, VBA eller dokumentasjon av formatet eller oppsettet skal inn. Det ligger internt.
- Kommentarer i koden forklarer koden, ikke datakilden eller oppsettet rundt.
- Brukergrensesnitt og kommentarer på norsk.

## Kommandoer
- `npm run dev`, `npm test`, `npm run build`
