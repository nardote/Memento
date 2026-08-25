# Memento

Memoria local, legible y sincronizable para agentes de IA. No usa base de
datos: cada recuerdo es un archivo Markdown, el filesystem es el almacén y Git
puede encargarse de compartirlos.

## Inicio rápido

```bash
./memento init
./memento save --project demo --type decision --title "Usar archivos" \
  --content "Markdown será la fuente de verdad."
./memento search archivos --project demo
./memento context --project demo
```

Por defecto busca `.memory/` desde el directorio actual hacia sus padres. Puede
usarse otro almacén con `--root RUTA` o `MEMENTO_HOME`.

## Comandos

```text
memento init
memento save --project P --title T [--type TIPO] [--tags a,b] [--content TEXTO]
memento search CONSULTA [--project P] [--limit N]
memento context --project P [--limit N]
memento show ID
memento delete ID
memento doctor
memento mcp
memento serve-http
memento node show|set
memento tasks list|approve|run
memento inbox list|ack
```

Si se omite `--content`, `save` lee el contenido desde stdin.

## Integración MCP

El servidor usa JSON-RPC delimitado por líneas sobre stdin/stdout y ofrece:

- `memory_save`
- `memory_search`
- `memory_get`
- `memory_context`
- `memory_delete`
- `activity_add`
- `activity_list`
- `activity_search`

Ejemplo de configuración:

```json
{
  "mcpServers": {
    "memento": {
      "command": "/ruta/absoluta/memento",
      "args": ["mcp", "--root", "/ruta/al/proyecto/.memory"]
    }
  }
}
```

Para Codex en esta máquina, registre el launcher autenticado como MCP global:

```bash
codex mcp add memento -- /ruta/absoluta/run-mcp-local.sh
```

El launcher lee `.memento-token` con permisos privados. El token no se copia a
la configuración de Codex ni se pasa como argumento del proceso.

## MCP remoto por Internet

El transporte HTTP es stateless y escucha solamente en `127.0.0.1` por
defecto. Todas las llamadas a `/mcp` requieren un Bearer token; `/health` es el
único endpoint público.

```bash
export MEMENTO_TOKEN="$(openssl rand -hex 32)"
./memento serve-http --root /ruta/al/proyecto/.memory
```

Prueba local:

```bash
curl http://127.0.0.1:7337/mcp \
  -H "Authorization: Bearer $MEMENTO_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

Para publicarlo con Cloudflare Tunnel, configure un hostname que apunte a
`http://localhost:7337`. El endpoint remoto será:

```text
https://memento.example.com/mcp
```

El cliente debe enviar `Authorization: Bearer <token>` en cada solicitud. Para
un túnel de prueba (la URL cambia en cada ejecución):

```bash
cloudflared tunnel --url http://127.0.0.1:7337
```

El proyecto incluye un launcher que genera y conserva el token con permisos
privados, inicia el MCP y crea el túnel de prueba:

```bash
./run-public.sh
```

La URL se muestra en la terminal. El token queda en `.memento-token` y puede
consultarse localmente con `cat .memento-token`.

En producción use un túnel nombrado y un dominio propio. No ejecute
`serve-http --host 0.0.0.0` sobre un puerto público.

## Usuarios y bitácora de actividades

Cada persona usa un token diferente. Los tokens se muestran una vez y en
`users.json` solamente se conserva su hash SHA-256.

```bash
./memento users add --root .memory --username adrian --role admin --projects '*'
./memento users add --root .memory --username juan --role writer --projects equipo
./memento users add --root .memory --username maria --role reader --projects equipo
./memento users list --root .memory
./memento users revoke --root .memory --username juan
```

Roles:

- `admin`: lectura, escritura y eliminación.
- `writer`: lectura y creación; no puede borrar.
- `reader`: solamente lectura.

`activity_add` toma la identidad exclusivamente del token autenticado. Las
actividades son archivos Markdown inmutables y cada alta se registra además en
`audit/YYYY-MM.jsonl`. Los permisos se comprueban por proyecto.

## Tareas replicadas entre nodos

Cada nodo tiene un ID estable:

```bash
./memento node set memento-adrian --root .memory
./memento node show --root .memory
```

Una tarea contiene una especificación inmutable y su ID es el SHA-256 del JSON
canónico. Modificar cualquier campo cambia el ID y los imports con hash
incorrecto se rechazan. El estado queda separado en approvals, cancellations,
receipts e inbox.

Triggers disponibles en el MVP:

```json
{"type":"event","filters":{"tags_all":["ticket:SKY-1234"]}}
{"type":"at","at":"2026-08-26T09:00:00-03:00"}
```

La única acción ejecutable es segura y declarativa:

```json
{"type":"notify","title":"Nueva información","message":"Revisar SKY-1234"}
```

Herramientas MCP:

- `task_create`, `task_import`, `task_approve`, `task_list`, `task_cancel`
- `task_run_due`
- `event_list`, `event_import`
- `peer_list`, `peer_sync`
- `inbox_list`, `inbox_ack`

Al volver online, el nodo recibe tareas y eventos faltantes, aprueba las tareas
dirigidas a él y ejecuta:

```bash
./memento tasks run --root .memory
./memento inbox list --root .memory
```

Cada combinación de tarea e instancia del trigger produce un `execution_id`
determinista. Los receipts hacen que una segunda evaluación no duplique la
notificación.

### Peers y reconexión

En el nodo B, agregue A usando un token de A con acceso sólo a los proyectos
que deben compartirse:

```bash
./memento peers add --root .memory \
  --name memento-a \
  --url https://memento-a.example.com \
  --token-file ~/.config/memento/peer-a.token
```

Sincronización manual:

```bash
./memento peers sync --root .memory
```

`serve-http` ejecuta un ciclo de sincronización y evaluación al arrancar y lo
repite cada 30 segundos. Cambie el intervalo con
`MEMENTO_PEER_SYNC_INTERVAL`; use `0` para ejecutar sólo al inicio. Los peers
remotos requieren HTTPS; HTTP se acepta únicamente para localhost. Los
snapshots tienen un límite predeterminado de 8 MiB configurable con
`MEMENTO_PEER_MAX_BYTES`.

### Dos nodos Docker para pruebas manuales

El repositorio incluye una topología de prueba con `memento-a` y `memento-b`.
Los dos contenedores quedan publicados **sólo en localhost** (`8781` y `8782`),
en una red Docker privada. No la uses como despliegue público.

```bash
./docker/two-nodes/up.sh
```

El script crea cuatro tokens aleatorios en `.memento-docker-secrets/`, carpeta
ignorada por Git, y arranca ambos nodos. Cada token pertenece a un usuario:

- `a-admin.token` y `b-admin.token`: administradores de sus respectivos nodos.
- `a-peer-b.token` y `b-peer-a.token`: lectores restringidos al proyecto
  `equipo`, usados exclusivamente entre peers.

Verificá que ambos nodos estén vivos:

```bash
curl http://127.0.0.1:8781/health
curl http://127.0.0.1:8782/health
docker compose -f docker-compose.two-nodes.yml logs -f
```

La red privada usa HTTP entre contenedores sólo para esta demo. La excepción se
declara por peer en los archivos de bootstrap; fuera de Docker, Memento sigue
exigiendo HTTPS para cualquier peer remoto.

Para crear una tarea en A dirigida a B, cargá el token de A sin imprimirlo:

```bash
TOKEN_A=$(tr -d '\r\n' < .memento-docker-secrets/a-admin.token)
curl -fsS http://127.0.0.1:8781/mcp \
  -H "Authorization: Bearer $TOKEN_A" \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"task_create","arguments":{"executor":"memento-b","project":"equipo","trigger":{"type":"event","filters":{"tags_all":["topic:refunds"]}},"action":{"type":"notify","title":"Nueva información","message":"Revisar refunds"}}}}'
```

Esperá unos segundos y aprobala localmente en B (la aprobación nunca se
replica de forma automática):

```bash
docker compose -f docker-compose.two-nodes.yml exec memento-b \
  memento tasks list --root /data
docker compose -f docker-compose.two-nodes.yml exec memento-b \
  memento tasks approve TASK_ID --root /data
```

La aprobación es local y no se replica de forma automática: una tarea recibida
no puede autoautorizarse.

Para simular una caída de B, detenelo, registrá una actividad en A mediante
`activity_add`, y volvé a iniciarlo. Al reconectar, B sincroniza, evalúa la
tarea y deja una única notificación en `/data/tasks/inbox`:

```bash
docker compose -f docker-compose.two-nodes.yml stop memento-b
curl -fsS http://127.0.0.1:8781/mcp \
  -H "Authorization: Bearer $TOKEN_A" \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"activity_add","arguments":{"project":"equipo","action":"Evento mientras B estaba offline","details":"Prueba de reconexión","tags":["topic:refunds"]}}}'
docker compose -f docker-compose.two-nodes.yml start memento-b
docker compose -f docker-compose.two-nodes.yml exec memento-b \
  memento inbox list --root /data
```

Para apagar el laboratorio sin borrar la memoria de prueba:

```bash
docker compose -f docker-compose.two-nodes.yml down
```

Para empezar de cero, eliminá explícitamente los volúmenes de Compose y la
carpeta `.memento-docker-secrets/`.

Prueba E2E real con dos procesos, apagado y dos reinicios de B:

```bash
python3 tests/e2e_peer_restart.py
```

## Sincronización

Para compartir memoria, quite `.memory/` del `.gitignore` del proyecto y
versione el directorio. Cada alta crea un archivo con ULID independiente y las
eliminaciones crean tombstones, reduciendo conflictos entre personas.

No sincronice una base SQLite ni hace falta ejecutar un servicio HTTP.

## Instalación local

```bash
./install.sh
```

Instala un enlace en `~/.local/bin/memento`. Para ejecutar las pruebas:

```bash
python3 -m unittest discover -s tests -v
```
