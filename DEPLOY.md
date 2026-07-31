# Despliegue

Gorilla es un sitio estático. La imagen es nginx sirviendo el bundle y no tiene
estado: no hay base de datos, ni volúmenes, ni secretos que custodiar. Volver a
una versión anterior es cambiar un tag y levantar de nuevo.

## Cómo encaja en el servidor

```
Cloudflare (DNS only, nube gris)
        │
        ▼
  cloud-caddy-1  ← termina TLS (Let's Encrypt) y enruta por hostname
        │  red docker: cloud_default
        ▼
     gorilla     ← nginx:80, solo alcanzable desde dentro
```

El Caddy compartido vive en `~/padelscores/cloud`. Gorilla es un proyecto compose
aparte que se engancha a su misma red, igual que `gasolineras`, `reeldown` y
`pixelface`.

## Publicar una versión

Cada push a `main` dispara CI: typecheck, tests, build y publicación de
`ghcr.io/davic80/gorilla:latest` junto a un tag con el SHA del commit. No hay que
construir nada a mano.

## Primera instalación en el servidor

```bash
ssh david@46.225.211.9
mkdir -p ~/gorilla && cd ~/gorilla
```

Deja ahí `docker-compose.yml` y un `.env`:

```bash
PROXY_NETWORK=cloud_default
GORILLA_TAG=latest
```

Autentica contra GHCR una sola vez (la imagen es privada mientras lo sea el
repositorio) y arranca:

```bash
docker compose up -d
```

Añade el hostname al Caddyfile compartido (`~/padelscores/cloud/Caddyfile`):

```
gorilla.ojoalprecio.com {
    reverse_proxy gorilla:80
}
```

Y recarga Caddy sin cortar el resto de sitios:

```bash
docker exec cloud-caddy-1 caddy reload --config /etc/caddy/Caddyfile
```

En Cloudflare hace falta un registro `A` apuntando a `46.225.211.9` **en modo
DNS only (nube gris)**. Con la nube naranja, Cloudflare intercepta el desafío
HTTP-01 y Caddy no consigue emitir el certificado.

## Actualizar

```bash
cd ~/gorilla && docker compose pull && docker compose up -d
```

## Volver atrás

```bash
GORILLA_TAG=<sha-del-commit-bueno> docker compose up -d
```

## Comprobaciones

```bash
docker compose ps
docker compose logs --tail 50
docker exec cloud-caddy-1 wget -qO- http://gorilla/ | head -5
```
