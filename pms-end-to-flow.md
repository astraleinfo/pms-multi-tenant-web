# Patient Management System — End-to-End Workflow Logic

This expands the high-level flow into concrete entities, API contracts, state machines, and guard logic that a backend team can implement directly.

---

## 1. Guiding Principle — Four Independent Axes

| Axis | Answers | Example |
|---|---|---|
| **Tenant** | Who owns the data | "Smile Dental Clinic" |
| **Clinical type** | What workflow/fields apply | `dental`, `ophthalmology`, `dermatology` |
| **Feature entitlement** | What's unlocked | Billing ✅, Lab ❌, Pharmacy ✅ |
| **Customization** | How this tenant configured it | Custom field "Insurance Number" |

These must never be conflated in code — e.g. a feature check should never look at `clinical_type`, and a custom field should never gate an API route.

---

## 2. Core Data Model

| Entity | Key fields | Notes |
|---|---|---|
| `Tenant` | id, name, clinical_type, status | root of isolation |
| `ClinicalType` | key, label | seed data: dental, ophthalmology, dermatology... |
| `Feature` | key, name, is_core | catalog: billing, pharmacy, lab, inventory, advanced_reports |
| `TenantFeature` | tenant_id, feature_key, status, activated_at | purchased/active features |
| `FieldDefinition` | id, scope[common\|clinical_type\|tenant], entity, field_key, label, type, required, order | drives dynamic forms |
| `User` | id, tenant_id, role | receptionist, doctor, pharmacist, lab_tech, admin |
| `Patient` | id, tenant_id, common fields, clinical_ext JSONB | |
| `Appointment` | id, tenant_id, patient_id, doctor_id, time, status | |
| `QueueEntry` | id, tenant_id, patient_id, appointment_id?, token_no, status | walk-ins have no appointment_id |
| `Encounter` | id, tenant_id, patient_id, queue_entry_id, clinical_ext JSONB | shared across all clinical types |
| `Prescription` / `PrescriptionItem` | id, encounter_id, medicine, dosage, frequency, duration, dispensed_qty, status | core, independent of Pharmacy |
| `LabOrder` / `LabResult` | id, encounter_id, test, status, result, verified_by | |
| `InventoryTransaction` | id, tenant_id, item_id, type, qty, ref_type, ref_id | purchase/dispense/return/adjustment/expiry/transfer |
| `Invoice` / `InvoiceLineItem` / `Payment` | id, tenant_id, patient_id, encounter_id, status | |

Every row-level table carries `tenant_id`. `Prescription`, `Encounter`, `Appointment`, `QueueEntry`, `Invoice` are single sources of truth — downstream modules (Pharmacy, Billing) reference them by FK rather than copying data.

---

## 3. Step-by-Step Flows

### 3.1 Tenant Onboarding
```
POST /tenants/register {clinic_name, clinical_type, admin_user}
→ create Tenant(status=trial/active)
→ seed core TenantFeatures: patient, appointment, queue, consultation, prescription (always-on, not purchasable)
→ clone default FieldDefinitions for clinical_type into tenant's effective schema
→ create User(role=tenant_admin)
→ return {tenant_id, session_token}
```

### 3.2 Feature-Based Access
```
POST /tenants/{id}/features/{feature_key}/purchase
→ payment step (external or internal)
→ on success: upsert TenantFeature{status=active}
→ invalidate feature cache (Redis) for tenant
```
**Feature Guard** (middleware on every gated route):
```
if not TenantFeature.is_active(tenant_id, feature_key):
    return 403 "Feature not enabled"
```
Frontend calls `GET /tenants/{id}/features` on login and conditionally renders nav modules — but the frontend check is UX only; the backend guard is the actual enforcement.

### 3.3 Tenant Configuration (Field Resolution)
Effective schema for any entity = **common fields** → overridden/extended by **clinical_type fields** → overridden/extended by **tenant custom fields** (later scope wins on `field_key` collision).
```
GET /tenants/{id}/schema/{entity}
→ merge FieldDefinition rows across the three scopes
→ return ordered field list for dynamic form rendering
```
Admin adds a custom field: `POST /tenants/{id}/fields`.

### 3.4 Patient Registration
```
GET /patients?search=...        # tenant_id taken from auth context, never from query
POST /patients {dynamic fields validated against 3.3 schema}
→ server stamps tenant_id = current_user.tenant_id (any client-sent tenant_id is ignored)
```

### 3.5 Appointment or Walk-in
- **Appointment:** `POST /appointments {patient_id, doctor_id, requested_time}` → check doctor availability against existing bookings → create `Appointment(status=scheduled)` or return conflicting slots.
- **Walk-in:** `POST /queue/walkin {patient_id}` → creates `QueueEntry` directly, skipping Appointment.

### 3.6 Check-in and Queue
```
POST /appointments/{id}/checkin
→ create QueueEntry(status=waiting, token_no=next-in-sequence-per-tenant-per-day)
→ push realtime update (WebSocket/Redis pub-sub) to queue display + doctor dashboard
```
**QueueEntry state machine:**
```
waiting → called → in_consultation → completed
              ↘ no_show        ↘ cancelled
```

### 3.7 Consultation
```
GET /encounters/schema?clinical_type=dental   # common + clinical fields
POST /encounters {patient_id, queue_entry_id, common fields, clinical_ext: {...}}
→ QueueEntry.status = completed on save
```
`clinical_ext` holds dental tooth-chart/exam data, ophthalmology vision/refraction data, dermatology skin-condition data, etc. — same `Encounter` table, different payload shape per clinical type.

### 3.8 Prescription
```
POST /encounters/{id}/prescriptions {items: [{medicine, dosage, frequency, duration, instructions}]}
```
Always available (core), regardless of whether Pharmacy is purchased.

### 3.9 Pharmacy *(feature-gated)*
```
GET  /pharmacy/prescriptions?status=pending      # reads Prescription directly — no copy
POST /pharmacy/prescriptions/{id}/dispense {items:[{item_id, qty, batch_no}]}
→ check stock via InventoryTransaction ledger
→ write InventoryTransaction(type=dispense)
→ update PrescriptionItem.dispensed_qty/status
```

### 3.10 Lab *(feature-gated)*
```
POST  /encounters/{id}/lab-orders {tests:[...]}
GET   /lab/orders?status=pending
POST  /lab/orders/{id}/results
PATCH /lab/orders/{id} {status=verified, verified_by}
GET   /encounters/{id}/lab-results   # only verified results returned by default
```
**LabOrder state machine:** `ordered → pending → resulted → verified`

### 3.11 Inventory
Single ledger, all movements as `InventoryTransaction`:
`purchase | dispense | return | adjustment | expiry | transfer`.
Stock level = sum of transactions per item per tenant. Pharmacy dispense (3.9) writes to this ledger automatically; a scheduled job flags near-expiry batches.

### 3.12 Billing *(feature-gated)*
```
POST /billing/invoices {patient_id, encounter_id, line_items:[...]}
```
Line items can be auto-suggested from the encounter (consultation fee, procedures), lab orders, and pharmacy dispenses, or added manually.
```
POST /billing/invoices/{id}/payments {amount, method}
```
**Invoice state machine:** `draft → issued → partially_paid → paid` (or `void`)

### 3.13 Patient History
```
GET /patients/{id}/history
```
Aggregates appointments, queue history, encounters, prescriptions, lab results, pharmacy dispenses, and invoices — chronologically, tenant-scoped. Implement as a composed read query first; move to a materialized view only if it becomes a performance bottleneck.

### 3.14 Analytics
`AnalyticsService` reads existing transactional tables directly — no separate analytics DB up front.
```
GET /analytics/dashboard?range=...
→ resolve tenant's active features + clinical_type
→ always compute: patients, appointments, no-shows, queue wait time, consultation time, prescriptions, revenue
→ conditionally compute (only if feature active): pharmacy sales, lab tests, inventory consumption, billing revenue
→ conditionally compute (driven by clinical_ext data): dental procedures, eye exams, dermatology treatments
```
Cache expensive aggregations in Redis or materialize via a scheduled job for daily rollups.

### 3.15 Tenant Isolation *(cross-cutting, applies to every step above)*
- `tenant_id` is non-nullable and indexed on every tenant-owned table.
- It is derived **server-side** from the authenticated session/JWT — never trusted from request body or query params.
- Enforce at the query layer (ORM session-level filter) with Postgres Row-Level Security as defense-in-depth.

---

## 4. Cross-Cutting Middleware Stack (applied in order)

1. **Auth** — resolves `tenant_id` + `user_id` + `role` from token
2. **Tenant isolation guard** — injects tenant filter into every query
3. **Feature guard** — blocks gated routes if entitlement inactive
4. **RBAC guard** — checks role/permission for the route
5. **Schema resolver** — merges common/clinical/tenant field definitions for dynamic-form routes

## 5. State Machines — Summary

| Entity | States |
|---|---|
| Appointment | scheduled → checked_in → (cancelled / no_show) |
| QueueEntry | waiting → called → in_consultation → completed (+ no_show / cancelled) |
| PrescriptionItem | pending → partially_dispensed → dispensed |
| LabOrder | ordered → pending → resulted → verified |
| Invoice | draft → issued → partially_paid → paid (+ void) |

---

## 6. Build Order Recommendation

1. Tenant + Auth + RBAC + tenant isolation guard (foundation everything else depends on)
2. Field resolution engine (3.3) — needed before any dynamic form works
3. Patient → Appointment/Walk-in → Queue → Encounter → Prescription (the always-on core loop)
4. Feature guard + entitlement purchase flow
5. Pharmacy, Lab, Inventory, Billing (feature-gated modules, in any order — each only depends on the core loop, not on each other)
6. Patient history (read-composition over everything above)
7. AnalyticsService last, since it reads off the tables everything else produces
