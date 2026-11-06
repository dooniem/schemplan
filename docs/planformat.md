# Planformat v1

Filen som **Generate in Web** i MS Project lager, og som web-appen leser. Det er ren JSON i UTF-8.
Typene i koden ligger i `src/format/types.ts`, og `src/format/validate.ts` sjekker filen når den åpnes.

Formatet inneholder både **plandefinisjonen** (lanes, bokser, farger, innstillinger fra `modSchemData`)
og **det Excel ville tegnet** (`resolved`: start, slutt og fag per boks, regnet ut av `getSchemTaskData`).
Fra fase 3 bygges den samme planen inn som vedlegg i PDF-arbeidsfilen.

## Toppnivå

| Felt | Innhold |
| --- | --- |
| `format` | Alltid `"schemplan"` |
| `version` | `1`. Økes ved endringer som eldre apper ikke forstår |
| `exportedAt` | Tidspunkt for eksporten, lokal tid |
| `anonymized` | `true` hvis tekstene er gjort om til fyllord |
| `plan` | Overskrift, kalender, layout og valg |
| `colors` | Farge per fag |
| `holidays` | Ferier fra prosjektkalenderen (unntak over 5 dager) |
| `lanes` | Lanes med bokser, i rekkefølge |
| `tasks` | Aktivitetene boksene viser til |

## plan

| Felt | Innhold |
| --- | --- |
| `title` | Overskriften fra userformen |
| `schemNumber` | Hvilken av de fire planene i .mpp-filen (1–4) |
| `calendar.mode` | `"month"` eller `"week"` |
| `calendar.start`, `calendar.end` | Første og siste dag i kalenderen |
| `calendar.workingDaysPerWeek` | Arbeidsdager per uke i prosjektkalenderen (brukes i ukesvisning) |
| `calendar.bottomCalendar` | Ekstra kalender nederst |
| `layout.orientation` | `"landscape"` eller `"portrait"` |
| `layout.heightMode` | `"fill"` eller `"compact"` |
| `layout.textSize` | Skriftstørrelse i punkter |
| `layout.calloutMaxWidthCm` | Største bredde på callouts |
| `layout.excelWidthMultiplier` | Background size fra Excel. Brukes ikke av appen |
| `options.legend` | Vis tegnforklaring |
| `options.flag20Only` | Bare aktiviteter med Flag20 = Yes |
| `options.filterOutput` | Lane- og boksfilter fra userformen er brukt |
| `options.colorBy` | `"trade"` (farge per fag) eller `"lane"` (lanefarge) |

## colors

`{ "name": "Betong", "fill": "#A6A6A6", "border": null, "text": "#FFFFFF" }`.
`border: null` betyr ingen kantlinje (lagret som `#` i VBA). Fargen `(none)` brukes for bokser uten fag.

## lanes og bokser

```json
{ "id": "1", "name": "Grunnarbeider", "fill": null, "shown": true, "boxes": [
  { "id": "1_3", "text": "Graving|og sprengning", "taskIds": [102, 103], "rotation": 0,
    "milestone": null, "shown": true,
    "resolved": { "start": "2026-03-02", "finish": "2026-05-15", "isMilestone": false, "trade": "Grunnarbeid" } }
]}
```

- `text` er lagret som i VBA: `|` er linjeskift, `/|` er en loddrett strek, `*` først betyr tvunget callout.
- `rotation` er `0`, `90` eller `-90`.
- `callout` (valgfri): `auto` (standard), `on` eller `off`. Settes av brukeren i appen. Uten feltet bestemmer appen, og `*` først i teksten betyr callout.
- `calloutSide` (valgfri): `auto` (standard), `left` eller `right`.
- `shown: false` betyr at lanen eller boksen er filtrert bort i userformen.
- `resolved: null` betyr at boksen ikke tegnes, fordi ingen aktiviteter finnes eller ingen er med i Flag20-utvalget.
- `milestone` er stilen for milepæler: `dateSource` (`deadline`/`scheduled`), `symbol` (`flag`/`diamond`),
  `verticalLine`, `color` (`red`, `yellow`, `green`, `blue`, `orange`, `black`), `rotateText`, `showDate`.

## tasks

`{ "uid": 102, "name": "…", "start": "2026-03-02", "finish": "2026-04-10", "deadline": null, "milestone": false,
"summary": false, "flag20": false, "percentComplete": 0, "trade": "Grunnarbeid" }`

Tas med for å kunne vise fremdrift og endringer mellom revisjoner senere.

## Anonymisering

Med anonymisering byttes hver bokstav i lane-navn, bokstekster, aktivitetsnavn og overskrift ut med fyllord.
Tall, mellomrom og tegnene `| / *` beholdes, så linjeskift, callouts og tekstbredder blir omtrent like.
Fagnavn og datoer beholdes. Bare anonymiserte filer skal deles som testfiler, og ingen ekte planer skal inn i repoet.

## Advarsler appen gir

- Bokser uten gyldige aktiviteter
- Bokser helt utenfor kalenderen
- Bokser som går utenfor kalenderen i ukesvisning (Excel hopper over dem uten å si fra)
- Fag uten farge
- Bokser som viser til aktiviteter som ikke finnes i Project
