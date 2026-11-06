# VBA for Generate in Web

Koden her limes inn i Magnus' eksisterende moduler i MS Project. Den lager en JSON-fil i planformat v1
(se `docs/planformat.md`) som web-appen leser.

| Fil | Hvor den skal |
| --- | --- |
| `ExportSchematicJson.bas.txt` | Limes inn **nederst** i `SchemDataModule` |
| `SchematicSchedule-generate-in-web.txt` | Fire små endringer i userformen `SchematicSchedule` |

Eksporten bruker samme innsamling som Generate: samme datoer, Flag20-utvalg, filter og farger.
Den tegner ingenting i Excel. Filen lagres ved siden av .mpp-filen (eller i Nedlastinger hvis prosjektet
er åpnet direkte fra SharePoint), og den anonymiserte varianten kan deles som testfil.
