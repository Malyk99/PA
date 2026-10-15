# PA Assistant (MVP)

One place for the production team: each day's jornada, everyone's call, the task board, and the WhatsApp messages generated from the same data.

Runs on your laptop. No cloud accounts. Data lives in `data/pa.db` (SQLite).

## Start it

Requires Node 20 or 22 LTS (`node -v`).

```bash
cd ~/PA-Assistant/pa-assistant
npm install          # first time only
npm run seed         # optional: demo data based on Si Te Contara
npm run build        # after every code change
npm start
```

The terminal prints:

```
En este ordenador:     http://localhost:4000
Desde el móvil (WiFi): http://192.168.x.x:4000
Enlaces de acceso de jefatura:
 - MALYK: http://localhost:4000/l/xxxxxxxx
```

Open your own `/l/...` link once to log in. On a fresh database (without the seed), the first user is called "Admin". Rename it in **Equipo**.

For development with hot reload, run `npm run dev` and open http://localhost:5173.

## Put it online for the team (Railway, about 15 minutes)

You get a permanent https address that works on mobile data, with the database on a persistent disk. Cost: Hobby plan, $5/month.

1. Create an account at https://railway.com (sign in with GitHub or email) and choose the **Hobby** plan.
2. In Terminal, from this folder:
   ```bash
   npm i -g @railway/cli
   railway login
   railway init          # name it pa-assistant
   railway up            # uploads and builds the Dockerfile (2–4 min)
   ```
3. Open the project in the Railway dashboard (`railway open`) and click the service, then:
   - **Settings → Regions**: choose **EU West (Amsterdam)**.
   - **Settings → Networking → Generate Domain**. Copy the address, e.g. `https://pa-assistant-production.up.railway.app`.
   - **Add a volume** (right-click the service on the canvas → *Attach volume*, or Cmd+K → "volume"). Mount path: **`/data`**. Do this before entering real data. Without the volume, everything is lost on every deploy.
   - **Variables** → add `PUBLIC_URL` = the address from the previous step.
4. Railway redeploys by itself. Open **Deployments → View logs**. You'll see:
   ```
   Enlaces de acceso de jefatura:
    - Admin: https://…up.railway.app/l/xxxxxxxx
   ```
   Open that link on your phone. You're in as head of production.
5. In the app: **Equipo** (rename Admin to your name, add the team), **Ajustes** (production title, total days, contacts), **Directorio → Importar Excel** (the ACTORES tab of the transport order), **Lugares y vehículos**.
6. Send each person their access via **Equipo → Enviar acceso**.

To update the code later, run `railway up` again from this folder. The data on the volume is kept.

**Backups:** Ajustes → *Descargar copia (.db)*. Do it at the end of every shooting week.

**Local alternative for one day** (laptop on, no account): `brew install cloudflared` then `cloudflared tunnel --url http://localhost:4000`. It gives you a temporary https URL. It changes every time you run it, so you'd have to resend the links. Fine for a test, not for a whole shoot.

## Transport order

Jornada → **Transporte**. It works like the template sheet:

- One block per vehicle (COCHE 1 - 8h, VAN 2…). Choose a saved vehicle or type the label.
- Type the **code** (24, PE, 1053…) and the name, phone and address fill in from the **Directorio**. REC puts the address in *Dirección*; DEV puts it in *Destino*. The set is filled in on the other side.
- **+ Parada en la misma ruta**: an extra pickup or drop-off on the same trip, without a new number (like the rows with no REC label in the Excel).
- **+ COME / nota**: a free line (COME, ESPERA…).
- REC1/REC2/DEV1 numbering is automatic per vehicle.
- **Descargar Excel** gives you a .xlsx in the same layout as the template (`PROD_OT_YYMMDD.xlsx`). **PDF** opens the printable version.

The directory is only visible to Jefatura and PAs, since it holds cast addresses and phone numbers.

## Getting the team in

1. **Equipo → + Persona** for each person: name as it should appear in messages, phone, and access level.
2. Press **Enviar acceso**. WhatsApp opens with their personal link. They tap it once and stay logged in.
3. On iPhone: Share → *Add to Home Screen*. On Android: menu → *Install app*. After that it opens like a native app.

Access levels:

| | Jefatura (UPM, Dir./Jefe Prod.) | PA / Ayte. | Equipo |
|---|---|---|---|
| See Mi día, En vivo, Tablero, published jornadas | yes | yes | yes |
| Create tasks | assign to anyone | assign to anyone | only for themselves |
| Move / complete tasks | all | all | their own and unassigned |
| Create jornadas, generate messages, upload PDFs | yes | yes | no |
| "Solo jefatura" tasks | see | see | hidden |
| Team members, access links, settings | yes | no | no |

If someone loses their phone: **Equipo → Editar → Nuevo enlace**. The old link stops working.

## The daily loop

1. **Evening before**: Jornadas → **+ Nueva jornada** → *Duplicar* the previous day. Location, hours, team calls and truck calls are copied; actor transport is not.
2. Adjust **Citaciones**, add **Cositas** (or *Traer del backlog*), fill in **Transporte**, upload the **Orden de rodaje** PDF under Documentos.
3. **Publicar**. The team now sees it in *Mi día*.
4. **Mensajes** tab: the team and truck messages are generated in your usual format. Press *Copiar* or *Abrir en WhatsApp* and paste into the group. *Mensajes individuales* sends each person their own call and tasks.
5. **During the day**: *En vivo* shows what's behind, the next 3 hours and each person's load. People tick tasks from their phone, and every phone updates live.
6. **Overnight**: any task tied to a past jornada that wasn't finished goes back to the backlog automatically, marked *Arrastrada*, with a note saying which day it was from.

## Tasks

- **Puntos (Fibonacci)**: 1 = minutes, 3 = about an hour, 8 = half a day, 13+ = split it up. *En vivo* adds up each person's open points so you can rebalance before the day starts.
- **Urgencia**: Bloqueante / Hoy / Esta semana / Cuando se pueda. *Límite* is an optional hard time ("devolver a las 12:00"). Once it passes, the task turns red and moves to *Se ha quedado atrás*.
- **Tipo**: Montaje, Recogida and Devolución tasks are grouped in the team message the way you write it now ("Hay que montar", "Viajecitos").
- **Conversación**: each task keeps its own comments plus an automatic history (who moved it, who it was reassigned to). Use it instead of the WhatsApp group for updates on that task.

## Transport order PDF

Jornada → Transporte → **Ver / descargar PDF** → *Imprimir / Guardar como PDF* (A4 landscape). It's always generated from the current data, so it can't go out of date.

## Phones outside your WiFi (laptop only)

As built, phones reach the app only on the same WiFi as the laptop, and only while the laptop is awake. To use it on set with mobile data:

- **Tailscale** (you already use it): install the app on the team's phones. Fine for 3–4 people, awkward for a whole team.
- **Cloudflare Tunnel** (free, no install for the team): `brew install cloudflared`, then `cloudflared tunnel --url http://localhost:4000`. It gives you a public https URL. Re-send the access links using that address. This also makes "Copiar" work on every phone, since clipboard access requires https.

When you outgrow the laptop, the same code runs on any small server (Railway, Fly.io, your Ubuntu box) without changes.

## Backups

Everything is in `data/`. Copy that folder to back it up. To start a new production, stop the app, move `data/` somewhere else, and start again.

## Not in this MVP (next steps)

- Reading the Orden de Rodaje PDF automatically (Claude API → review screen → fills the jornada)
- Importing the full plan de rodaje to create every day at once
- Push notifications (needs https, so it comes after the tunnel/server step)
- Driver view with "recogido / entregado" per transport run
- Several productions in one install

## Code map

```
server/index.ts      API, login links, permissions, live updates (SSE), daily rollover
server/db.ts         SQLite schema
server/seed.ts       demo data
shared/types.ts      types shared by server and app
client/src/pages/    MiDia, Hoy (En vivo), Tablero, Jornadas, JornadaPage, Transporte, Equipo, Catalogo, Ajustes
client/src/lib/messages.ts   WhatsApp message templates. Edit here to change the format
```
