# schemplan

Web-app som tegner skjematisk plan (A3, stående og liggende) fra data eksportert fra MS Project via VBA.
Publiseres som statisk side på GitHub Pages: https://dooniem.github.io/schemplan/

## Faste regler
- Ingen prosjektdata lagres i appen: ingen server, ingen localStorage/IndexedDB for plandata, ingen telemetri.
- Sikkerhetssperren (CSP med `connect-src 'none'`) i `vite.config.ts` skal aldri svekkes. Ingen CDN-er eller eksterne kall; alt pakkes inn.
- Repoet er offentlig. Ekte prosjektdata skal aldri inn, heller ikke som testfiler. Bruk anonymiserte eksempler.
- Arbeidsfilen er en PDF med planen innebygd som vedlegg. Eksportvalg: Arbeidsfil, Ekstern (renset), Kompakt.
- All layout i millimeter på A3-arket (1 SVG-enhet = 1 mm), samme mål på skjerm og i PDF.
- Brukergrensesnitt og kommentarer på norsk.

## Kommandoer
- `npm run dev` – utviklingsserver (uten CSP, fordi Vite trenger websocket)
- `npm test` – enhetstester (Vitest)
- `npm run build` – typesjekk og bygg til `dist/`

## Veikart
Fase 0 oppsett, 1 dataformat og VBA-eksport, 2 visning og A3-PDF, 3 PDF som arbeidsfil, port, 4 redigering,
5 Generate/Update in Web fra Project, 6 pilot og migrering, 7 nye funksjoner. Excel-løpet er i drift til fase 7.
