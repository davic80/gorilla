# Gorilla es un sitio estático puro: no hay backend, ni sesiones, ni base de
# datos. El contenedor final es solo nginx sirviendo el bundle, así que pesa
# unos pocos MB y arranca al instante.

# --- Build ------------------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app

# Las dependencias van en su propia capa: mientras no cambie el lockfile, esta
# capa se reutiliza y el build solo repite la compilación.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
# `npm run build` incluye el typecheck: una imagen no puede salir de aquí con
# errores de tipos.
RUN npm run build

# --- Serve ------------------------------------------------------------------
FROM nginx:1.27-alpine AS serve

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1/ || exit 1
