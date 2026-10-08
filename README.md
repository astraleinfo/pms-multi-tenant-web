# Astrale — multi-tenant PMS front end

A Next.js front end for the patient management system described in
[`pms-end-to-flow.md`](./pms-end-to-flow.md), running against the FastAPI + PostgreSQL backend in
[`../pms-multi-tenant-api`](../pms-multi-tenant-api). Every screen reads and writes over HTTP;
the queue also holds a WebSocket open, so a token called at the desk lands on the waiting-room
screen without anyone refreshing.

There is no mock database any more. `src/lib/api/` is a set of `fetch` calls, ids are the
server's UUIDs, and the only thing this app keeps for itself is the theme.

## Running it

Start the API first — its README covers `make db && make migrate && make seed && make run`, which
puts it on `http://localhost:8000` with three demo clinics in it. Then:

```bash
pnpm install
cp .env.local.example .env.local   # where the API is, for the /api rewrite
pnpm dev        # http://localhost:3000
pnpm build      # production build
```

The package manager is pinned in `package.json` (`packageManager`), so `corepack enable pnpm`
is enough to get the right version.

Requests go to `/api/*` on whatever host the browser is already on, so
`northgate.localhost:3000/api/v1/patients` **is** a Northgate request. In development
`next.config.ts` rewrites that to the API process; because Next replaces the `Host` header on a
rewrite, the slug travels in `X-Tenant-Slug` instead, which the API accepts only when
`ALLOW_TENANT_HEADER` is on and never in production.

**Every clinic has its own subdomain, and the platform console lives on the apex.**
No hosts file is needed locally — browsers resolve every `*.localhost` name to 127.0.0.1:

| URL | What it serves |
|---|---|
| `localhost:3000` | platform console (super admin) |
| `northgate.localhost:3000` | Northgate Dental Studio |
| `clearview.localhost:3000` | Clearview Eye Centre |
| `rowan.localhost:3000` | Rowan Skin & Laser |

The apex only ever serves the console, a clinic subdomain never serves it, and an
unclaimed subdomain says so. That routing happens in `src/proxy.ts` before anything renders.

## Deploying

Production is a Docker image of the standalone server (`output: "standalone"`), running as the
`web` service behind the nginx in `../pms-multi-tenant-api/docker-compose.prod.yml`. That nginx
sends `/api/*` straight to the API with the clinic's `Host` intact, and everything else here, so
the `next.config.ts` rewrite is never used in production.

```bash
# in ../pms-multi-tenant-api first — it owns the network and the nginx
docker compose -f docker-compose.prod.yml --env-file .env.production up -d

# then here
docker build -t pms-web:$(git rev-parse --short HEAD) --build-arg REVISION=$(git rev-parse HEAD) .
PMS_WEB_IMAGE=pms-web:$(git rev-parse --short HEAD) docker compose -f docker-compose.prod.yml up -d
```

- **No runtime env.** The only settings are `NEXT_PUBLIC_*`, which are inlined at build time; leave
  them unset for production so the API and the queue socket follow the browser's own origin.
  `.dockerignore` keeps `.env.local` out of the build for the same reason.
- **Network.** `PMS_NETWORK` names the API stack's network. It defaults to
  `pms-multi-tenant-api_pms-internal`, which is what Compose calls it when started from that directory.
- The container runs as `node` on a read-only filesystem with every capability dropped; only
  `.next/cache` and `/tmp` are writable (tmpfs). It publishes no port — nginx is the only way in.

## Signing in

Every user has their own email and password, and every page is behind that credential —
a signed-out visitor sees the login screen and nothing else. Both login pages list the demo
accounts behind a **Demo accounts** disclosure that fills the form for you.

Passwords follow one pattern: the email's local part without dots, then `-2026`.

| Where | Account | Password |
|---|---|---|
| `northgate.localhost` | `admin@northgate.clinic` (practice admin) | `admin-2026` |
| `northgate.localhost` | `a.iyer@northgate.clinic` (clinician) | `aiyer-2026` |
| `clearview.localhost` | `admin@clearview.eye` (practice admin) | `admin-2026` |
| `rowan.localhost` | `owner@rowanskin.co` (practice admin) | `owner-2026` |
| `localhost` (console) | `ines@astrale.health` (platform) | `ines-2026` |

Five wrong passwords lock an account — counted on the server, so closing the tab does not reset
them. A practice admin releases it from **Settings → Team**, which also clears the counter;
locking someone revokes their sessions immediately, wherever they are signed in.

**Nothing about the session is kept in the browser.** The access token lives in memory, so a
closed tab is a closed session and script injected into the page has nothing to read; the refresh
token is an HttpOnly cookie this code cannot touch. A reload asks the API to exchange that cookie
for a new token, which is how a tab knows it was already signed in. Only the light/dark
preference is in `localStorage`.

## Stack

- **Next.js 16** (App Router) with **Tailwind v4** — design tokens are CSS custom properties
  exposed to Tailwind through `@theme inline`, so utilities and raw CSS share one palette.
- **pnpm** for installs.
- **TanStack Query** is the data layer. `src/lib/api/` is the HTTP client and one function per
  endpoint; `src/lib/query/` holds the key factory and the hooks components use. Reads are
  `useQuery`, writes are `useMutation` that invalidate the clinic's cache subtree on success —
  and so is a queue event arriving over the socket.
- **The lists are paged and the analytics are computed server-side.** The register, the diary,
  the case book, prescriptions, the lab's order book and the ledger all answer with one page —
  ten rows by default — and the browser holds the page it is showing, plus figures rather than
  the rows behind them; see *Reading at scale*.
- **TanStack Table v9** powers every data grid through one `<DataTable>` component, with the
  sorting, filtering and pagination features registered explicitly rather than wholesale.
- **Waiting is shown, never blank.** Route segments have a `loading.tsx` that keeps the shell up,
  tables draw themselves in outline while their first rows are in flight, and a refetch keeps the
  page it already has; see *Loading states*.

## The four axes

The reference document's first rule is that tenant, clinical type, entitlement and
customisation must never be conflated. The code keeps them apart:

| Axis | Where it lives | What it changes |
|---|---|---|
| **Tenant** | the host, and the session token that has to agree with it | which rows exist at all |
| **Clinical type** | `tenant.clinical_type`, `GET /tenant/schema/…`, `ClinicalExamPanel` | which exam fields and which chart widget |
| **Entitlement** | `TenantFeature` rows, `hasFeature`, `<FeatureGate>` | which whole modules are reachable |
| **Customisation** | tenant-scoped `FieldDefinition` rows | extra fields on the dynamic forms |

A feature check never reads `clinical_type`; a custom field never gates a route. Sign in at
`northgate.localhost:3000` and then at `clearview.localhost:3000` to watch all four change at
once — the same build serves a dental practice, an eye centre and a dermatology clinic.

None of these checks is enforcement. `<FeatureGate>` and `<RoleGate>` shape the UI; the server
answers `403 feature_not_enabled` to a module a clinic never bought and `404` to another clinic's
row, whatever this app renders.

## Three demo tenants

| Clinic | Clinical type | Paid modules |
|---|---|---|
| Northgate Dental Studio | dental | pharmacy, lab, inventory, billing |
| Clearview Eye Centre | ophthalmology | billing, inventory, advanced reports |
| Rowan Skin & Laser | dermatology | lab only — still on trial |

Clinics are created in the **platform console**, not by a self-service form inside a tenant.
Creating one claims its subdomain, seeds the five core features, clones the clinical-type
field set, writes its configuration and mints the first admin credential — §3.1, performed by
the platform. The console can also suspend a clinic, which takes its subdomain offline.

Platform staff are a separate table from `User`: no `tenant_id`, and they never appear inside
a clinic.

## Modules

Core (always on): **patients**, **appointments**, **queue**, **consultation**, **prescriptions**.
Purchasable: **pharmacy**, **lab**, **inventory**, **billing**, **advanced reports**.

- **Queue** — token per tenant per day, the `waiting → called → in_consultation → completed`
  state machine, walk-ins with no appointment row, plus a waiting-room screen at `/display` that
  shows a first name and an initial and nothing more. Both are live: `src/lib/realtime.ts` holds
  a socket open and turns each event into a re-read, and the topbar carries a dot for whether
  that connection is up.
- **Consultation** — one encounter row for every discipline; `clinical_ext` carries an FDI tooth
  chart, a refraction grid or a body-site lesion map depending on the tenant.
- **Prescriptions** — core, and readable by the pharmacy without being copied.
- **Pharmacy** — dispensing writes `dispense` rows into the single inventory ledger.
- **Lab** — `ordered → pending → resulted → verified`; results are withheld from the patient
  record until verification.
- **Inventory** — stock on hand is the sum of the ledger, never a mutable counter; expiry watch
  and reorder levels fall out of it.
- **Billing** — invoices reference the encounter, suggest line items from the visit, and follow
  `draft → issued → partially_paid → paid` (or `void`).
- **Reports** — always-on metrics, module-conditional panels, and clinical-type analytics driven
  purely by what is inside `clinical_ext`. All of it arrives from `GET /analytics/dashboard` in
  one request: the panels that render are the ones the API sent, which are the ones this clinic
  pays for.
- **Configuration** (Settings → Configuration) — §3.3's other half. Contact details, record and
  token prefixes, the working day, slot interval and default appointment length, urgent-first
  queueing, invoice prefix, tax rate, payment terms and currency. Every one of them is wired:
  change the slot interval and the booking dialog and day grid follow it, change the currency
  and every figure in the app reformats, change the invoice prefix and the next invoice uses it.
- **Team** (Settings → Team) — roles, credentials, failed attempts, and lock/unlock.

## Layout

```
src/
  proxy.ts                 host routing: apex → console, subdomain → clinic
  app/                     one folder per module, plus /login, /display, /platform
  components/
    ui/                    buttons, fields, data-table, modal, badges, primitives
    charts/                hand-drawn SVG charts — no charting dependency
    layout/                rail, topbar, command palette, auth stage, toaster
    domain/                dynamic forms, gates, clinical exam widgets, composers
  lib/
    types.ts               the entities from §2 — the JSON the API returns
    tenancy.ts             Host header → tenant, and links between hosts
    api/client.ts          fetch, the in-memory access token, refresh-and-retry
    api/index.ts           one function per endpoint
    realtime.ts            the queue socket, turned into cache invalidation
    demo-accounts.ts       the seeded credentials the login screens offer
    data/catalog.ts        clinical types, features, lab tests, medicines
    data/repository.ts     pure reads over what a screen is already holding
    query/                 key factory, read hooks, query client
    store/session.tsx      host, session, theme, toasts
    store/app-store.tsx    the facade: every write as a mutation, plus session
    analytics.ts           §3.14 read models
```

## The first-run tour

The first time anyone signs in, the app offers a short guided tour — seven stops for a practice
admin, six for a receptionist, and only ever of things that person can actually see.

It teaches the four axes rather than the buttons: that the address *is* the clinic, that the
clinical type shapes the forms, that an entitlement locks whole modules, and that a clinic's own
fields sit on top of all three. Steps are declarative (`src/lib/tour.tsx`), filtered by role and
entitlement before the tour starts, and skipped entirely if their anchor never appears — which is
what makes the steps that change route safe.

- **It is a dialog.** Focus moves into the card, Tab is trapped, Escape leaves, ← and → move,
  and each step is announced to a screen reader.
- **Anchors are `data-tour` attributes** on the real elements, found by waiting rather than
  assuming, scrolled into view, and re-measured while the page moves under them. The lit region
  is clamped to the viewport, so an anchor taller than the screen still highlights something.
- **Where it has got to is the person's, not the browser's.** `PATCH /v1/auth/me/preferences`
  stores it against the account, so a shared machine does not swallow a colleague's first run and
  a new laptop does not repeat yours. Finishing and giving up are recorded differently.
- **It can always be run again** — under your name in the top right, and in Settings → Practice.
- **Raising `TOUR_VERSION`** shows it once more to everyone who has only seen an older one.

## Reading at scale

Two habits that a demo can get away with and a real clinic cannot — loading the whole register,
and deriving analytics in the browser — are gone.

**Every list is a page.** `usePatientPage`, `useAppointmentPage`, `useEncounterPage`,
`usePrescriptionPage`, `useLabOrderPage` and `useInvoicePage` each send `{search, limit, offset,
sort, order, …}` and get back `{items, total}`; `<DataTable server={…}>` puts the table in manual
mode, so it renders the page it was handed and reports each change of page, search or sort back
instead of slicing something already loaded. Typing is debounced before it is sent, and the
previous page stays on screen while the next one is in flight. Ten rows is the default, so no
list screen grows a scrollbar in proportion to how long the clinic has been open — a clinic with
fifty thousand patients costs these screens exactly what fifty do.

Where a screen has tabs, its page carries `counts` per status, worked out in the database and
taken before the tab's own filter, so "Pending 12" is true while the Dispensed tab is open.
Billing's *Owing* tab and the lab's *Open* tab are questions rather than status values, and go to
the API as their own flags (`unpaid`, `unverified`) — a browser holding ten rows cannot answer
them. Sorting is a query too: the ledger orders by totals and balances PostgreSQL adds up, and
the two prescription columns that are summed across a row's items say so by not offering a sort.

**Not everything is a page, and those views say so.** The appointment day and week grids, a
patient's own history, the pharmacy counter and the rail's badge counts ask for `limit=0` — the
whole collection — because a grid about one day is not a page of anything. The rail's four badges
are the exception that used to cost the most: they now read `total` off a page of one row, so
being always on screen costs four counts rather than three collections.

**Names travel with the rows that need them.** Appointments, queue entries, encounters,
prescriptions, lab orders and invoices all carry `patient_name` and `patient_mrn`, so a list can
render a name without the register behind it — `<PatientRef>` takes those fields directly.
Screens that need a whole patient (the record, the prescription drawer, the invoice composer)
fetch that one patient with `usePatient(id)`, and the patient picker and command palette search
the database as you type.

**Analytics are figures, not rows.** `useAnalytics(days)` is one request covering every panel on
the dashboard and the reports page — trailing series, queue funnel, ranked diagnoses, the money,
cohort breakdowns, and the clinical-type panel counted out of `clinical_ext` in PostgreSQL. There
is no `lib/analytics.ts` any more: one implementation of each figure, on the server, so the
reports cannot drift from the ledger.

## Talking to the API

Nothing above `src/lib/api` knows where the data comes from, which is what made the swap from the
mock database a one-file change. What is worth knowing:

- **No function takes a tenant id.** The clinic is the address the request goes to and the session
  it carries, and the server derives it from those two agreeing. A `tenant_id` in a body is
  rejected outright, so there is nothing to get wrong here.
- **The access token is held in memory** (`api/client.ts`) and sent as a bearer. A 401 triggers
  one shared refresh — several queries failing together do not rotate the token six times, which
  the server would read as theft — and the retry is invisible. If the refresh fails, the session
  is over and the app says so.
- **Query keys are hierarchical** (`["tenant", id, …]`), so a write invalidates exactly the clinic
  it touched, and a queue event invalidates exactly the queue.
- **Errors have a shape**: `{ error: { code, message, details }, request_id }`. `message` is
  written to be read by a person, so mutations surface it as-is in a toast. `ApiError.fieldErrors`
  unpacks a 422 for form fields.
- **Availability is checked twice.** The booking dialog computes clashes from the appointments
  already in cache so the slot grid stays instant; the server checks again on POST and answers
  409 if the slot went while the dialog was open.
- Dates and money are formatted in one place (`lib/format.ts`), and "today" comes from the clinic
  record rather than the browser clock.

For the endpoint-by-endpoint map, see
[`../pms-multi-tenant-api/docs/frontend-integration.md`](../pms-multi-tenant-api/docs/frontend-integration.md).

## Design

"Clinical daylight, long shift" — the whole system is tuned for someone at this screen for eight
to twelve hours rather than for a first impression. An off-white ground carries off-white cards
and a quiet rail; ink is charcoal, not black; one muted blue is the only interactive colour. Red,
amber, emerald and cyan stay reserved for clinical state and are never spent on decoration, and
every one of them is paired with a dot, an arrow or a word so that colour is never the only
carrier. Dark mode is a selected slate palette, not an inversion, and both categorical chart ramps
were re-validated for colour-vision separation and chroma against their own surface.

Type is Inter throughout, with IBM Plex Mono for anything that has to line up. There is one scale
— `text-micro` through `text-display-lg`, twelve steps named for the job rather than the size —
and each step carries its own line-height and tracking, so `text-caption` is already comfortable
without a `leading-*` beside it. Nothing lands below 12px. Weights stop at 600, and the thin end
of the ramp is folded back to 400 so a stray `font-light` cannot put hairline text in front of
someone at hour nine.

Components name tokens, never raw sizes or hexes: sizes, weights, line-heights, surfaces, ink,
lines, hover, focus and disabled all live in `src/app/globals.css`, so a change in comfort is a
change in one file. Every foreground/background pair the screens can actually produce clears WCAG
AA — 4.5:1 for text, 3:1 for the dots, bars and icons that carry state — checked against each
surface a token can land on rather than assumed from the one case of ink on white. Disabled
controls are the deliberate exception: they are repainted to ~3.3:1 rather than faded, because
`opacity` on a filled button drags label and ground down together and lands near 2.5:1.

Everything is responsive from 390px up: the rail becomes a drawer, grids collapse to one column,
the patient register opens as cards on a phone, and wide tables and the day grid keep their
columns readable inside their own horizontal scroller rather than being squeezed.

A patient's record is the one place that is deliberately unpaged — history, encounters,
prescriptions, lab orders and invoices are one patient's whole story, and splitting it across
pages would be the wrong shape. Each of those panes is capped and scrolls inside itself instead
(`<ScrollArea>`, and `<TableWrap maxHeight>` with a stuck header for the invoices), so the record
header, its tabs and the summary rail stay where they were put however long the story is.
Printing ignores the caps: a printed record is the whole record.

## Loading states

Three kinds of wait, three answers — `components/ui/loader.tsx`:

- **A route that has not loaded.** Every screen has a `loading.tsx` rendering `<PageLoader>`, so
  Next shows it in the shell's content area the moment you navigate: the rail, the topbar and the
  clinic's name stay put and stay interactive. `<StageLoader>` is the same thing full-screen, for
  the three stages before there is a shell — is there a clinic at this address, is there a
  session, has the entitlement arrived.
- **A table that has not got its rows.** `<DataTable loading>` (or `server.loading`) draws
  skeleton rows in the shape of the rows that are coming — same columns, same row height, same
  ten of them — so nothing jumps when the answer lands, and the empty state is held back rather
  than claiming "no matches" at a table that has not asked yet.
- **A refetch.** Paging, searching or sorting keeps the page that is already on screen, dimmed
  under a thin indeterminate bar. Replacing something true with a spinner to say "working" is a
  step backwards, and `placeholderData` means there is always something true to keep.

All three carry `role="status"` and `aria-busy`, and the page loader's label is visible rather
than only announced: under `prefers-reduced-motion` the spinner stops turning, and a still
spinner with no words reads as broken rather than busy.

## Notes and limits

- **Today** comes from `GET /v1/tenant`, in the clinic's timezone, and `lib/format.ts` renders
  everything from it. Server-rendered markup has to match the first client render, so it starts
  at a fixed date and is replaced once the clinic record arrives. The waiting-room clock follows
  the same rule.
- **The demo credentials on the sign-in screens are hard-coded** in `lib/demo-accounts.ts`. Real
  passwords exist only as Argon2 hashes on the server, and a clinic's staff list is not something
  an unauthenticated visitor may read. Delete that file and the disclosure when the demo goes.
- The charts show real rows. The API's seeder writes six weeks of past — appointments kept and
  missed, the tokens they produced with real waits, the encounters and invoices that came of them
  — so a day with no visits is a day with no visits, and every panel agrees with every other.
- A session on `localhost` is not a session on `northgate.localhost` — separate hosts, separate
  cookies, and the API refuses a console token at a clinic address anyway. Opening a clinic from
  the console lands on its sign-in screen, which is the correct behaviour rather than a gap.
- The booking dialog opens on the first slot the chosen clinician can actually take. Picking a
  taken slot is still allowed — it keeps its struck-through styling, lists the clashing booking
  and disables the submit, which is what the availability check in §3.5 is for.
- The queue socket is one connection per tab. It backs off on failure, re-reads when it comes
  back, and re-reads when a backgrounded tab is brought forward, so a screen left running
  overnight recovers on its own.
