import { defineConfig } from 'vite';
import pkg from './package.json';

export default defineConfig({
  // La version viaja al bundle para que el pie diga que build se esta jugando.
  // Con CI publicando en cada push, saber eso de un vistazo ahorra dudas.
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
});
