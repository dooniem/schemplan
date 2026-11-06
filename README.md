# schemplan

Web-app for skjematisk plan fra MS Project. Appen kjører helt i nettleseren og lagrer aldri prosjektdata.

- **Adresse:** https://dooniem.github.io/schemplan/
- **Data:** kommer fra MS Project via VBA og leses lokalt fra brukerens egen maskin.
- **Resultat:** PDF i A3, stående eller liggende.

## Sikkerhet
Appen er statiske filer uten server. En Content-Security-Policy (`connect-src 'none'`) gjør at nettleseren
nekter appen å sende data noe sted. Status vises øverst i appen.

## Utvikling
```
npm ci
npm run dev
npm test
npm run build
```
Hver endring på `main` bygges og publiseres automatisk til GitHub Pages.
