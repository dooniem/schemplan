import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';

// Sikkerhetssperre: nettleseren nekter appen å sende data noe sted (connect-src 'none'),
// og alt innhold må komme fra appen selv. GitHub Pages lar oss ikke sette HTTP-headere,
// så regelen legges i en <meta>-tag. Den legges bare inn ved bygg, fordi Vites
// utviklingsserver trenger en websocket for å laste siden på nytt.
export const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

function cspMeta(): Plugin {
  return {
    name: 'csp-meta',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '<meta charset="UTF-8" />',
        `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`,
      );
    },
  };
}

// Service worker for installert app: listen over filer som skal lagres for bruk uten nett
// fylles inn fra bygget, så den alltid stemmer med filnavnene som har versjon i seg.
function serviceWorker(): Plugin {
  return {
    name: 'service-worker',
    apply: 'build',
    generateBundle(_, bundle) {
      const files = Object.keys(bundle).filter((f) => !f.endsWith('.map'));
      const extra = ['manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'favicon-32.png'];
      const source = readFileSync('sw-template.js', 'utf8')
        .replace('__VERSION__', process.env.npm_package_version ?? '0.0.0')
        .replace('__FILES__', JSON.stringify([...files, ...extra]));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

export default defineConfig({
  // Appen ligger på https://dooniem.github.io/schemplan/
  base: '/schemplan/',
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '0.0.0'),
  },
  plugins: [cspMeta(), serviceWorker()],
  build: {
    // Ingen eksterne kilder: alt pakkes inn i appen
    assetsInlineLimit: 0,
    // PDF-delen (pdf-lib, skrift) er stor, men lastes først når brukeren lagrer eller åpner en PDF
    chunkSizeWarningLimit: 1000,
  },
});
