# WORK TRACKER — Roamly (Travel Connectivity Store)

Satu sumber pencatatan progres pengembangan, dari perencanaan sampai MVP selesai.
Dokumen ini **hanya mencatat progres dan rujukan**. Kontrak API, schema database, token
desain, ADR, dan requirement hidup di dokumen masing-masing (lihat §1.3).

Terakhir diperbarui: **2026-11-26**

---

## 1. Cara Pakai Dokumen Ini

### 1.1 Tujuan

Menjawab tiga pertanyaan tanpa membaca riwayat percakapan atau seluruh dokumentasi:

1. Di fase mana pekerjaan sekarang?
2. Apa yang sudah benar-benar selesai dan terverifikasi?
3. Apa yang menghalangi langkah berikutnya?

### 1.2 Status vocabulary (hanya empat nilai)

| Status | Arti | Syarat |
| --- | --- | --- |
| `NOT STARTED` | Belum ada pekerjaan | — |
| `IN PROGRESS` | Sedang dikerjakan | Wajib punya minimal satu task tercentang atau catatan progres |
| `BLOCKED` | Tidak dapat dilanjutkan | Wajib menyebut ID `KI-xx` atau keputusan yang ditunggu |
| `COMPLETED` | Selesai dan terverifikasi | Wajib punya **bukti verifikasi** + tanggal penyelesaian |

Aturan tambahan:

- Status hanya naik bila bukti ada. Menulis kode bukan bukti; **output perintah, hasil test,
  atau screenshot** adalah bukti.
- `COMPLETED` tanpa tanggal dianggap tidak sah.
- Satu fase hanya boleh punya satu status aktif.
- Jangan memakai istilah lain (`done`, `finished`, `wip`, `50%`) untuk status fase.

### 1.3 Rujukan dokumen (jangan diduplikasi di sini)

| Kebutuhan | Dokumen |
| --- | --- |
| Overview, stack, env vars, limitations | [`README.md`](README.md) |
| Aturan kerja repo & AI, forbidden patterns, konstanta | [`AGENTS.md`](AGENTS.md) |
| Bentuk sistem, modul, alur data | [`docs/architecture.md`](docs/architecture.md) |
| Alasan keputusan & alternatif yang ditolak | [`docs/technical-decisions.md`](docs/technical-decisions.md) |
| Scope, FR/NFR, acceptance criteria | [`docs/mvp-scope.md`](docs/mvp-scope.md) |
| Tabel, constraint, index, RLS, SQL function | [`docs/database-design.md`](docs/database-design.md) |
| Endpoint, payload, header, error | [`docs/api-contract.md`](docs/api-contract.md) |
| Arah desain, layout, aset | [`docs/design-solution.md`](docs/design-solution.md) |

### 1.4 Larangan

- Tidak menyalin isi dokumen rujukan (tanpa DDL, tanpa contoh payload, tanpa token desain).
- Tidak menandai fase `COMPLETED` karena "hampir selesai".
- Tidak menuliskan fitur, migration, test, atau deployment sebagai selesai sebelum
  diimplementasikan **dan** diverifikasi.
- Tidak menghapus entri Change Log; hanya menambah.

---

## 2. Current Status

| Field | Nilai |
| --- | --- |
| Fase terakhir selesai | **E-2a Git Commit & Push — `COMPLETED`** (2026-11-26) |
| Fase aktif | **E-3 Schema & RLS — `COMPLETED`** (implementasi + verifikasi 2026-11-27; **belum di-commit**) |
| Checkpoint commit | E-2/E-2a: `7ed8371e81e4090498398f3576ffe4833b08a2c5` · baseline dokumen: `5d5895f9223f8a700a7248745ab5905b7b4c87fb` |
| Deadline project | **2026-11-29 23:59 WIB** |
| Fase selesai | **3 / 10 (30%)** + 1 checkpoint tanpa bobot (E-2a) |
| Acceptance criteria terverifikasi | **9 penuh + 11 database-scope / 42** (lihat §4 E-3) |
| Kode aplikasi | **25 file foundation** + `src/lib/supabase/admin.ts` |
| Migration | **6** (`supabase/migrations/`) |
| Test dijalankan | **11 unit** (1 file) + **85 integration** (8 file) |
| Deployment | **belum dikonfigurasi** |
| Blocker terbuka | 2 (`KI-01`, `KI-04`) |
| Persetujuan yang ditunggu | 1 (izin **commit/push** E-3) |

Ringkasan satu kalimat: **E-3 (skema, RLS, lima SQL function) terimplementasi dan terverifikasi di
stack lokal — 85 integration test hijau — tetapi belum di-commit; fitur bisnis (E-4…E-9) belum dimulai.**

---

## 3. Overall Progress

### 3.1 Phase progress

| Fase | Nama | Status | Bobot fase |
| --- | --- | --- | --- |
| E-0 | Planning | `COMPLETED` | 10% |
| E-1 | Documentation | `COMPLETED` | 10% |
| E-2 | Foundation | `COMPLETED` | 10% |
| E-3 | Schema & RLS | `COMPLETED` (lokal, belum di-commit) | 12% |
| E-4 | Storefront & Seed | `NOT STARTED` | 12% |
| E-5 | Checkout, Payment & Idempotency | `NOT STARTED` | 18% |
| E-6 | Admin CMS | `NOT STARTED` | 12% |
| E-7 | n8n & Outbox | `NOT STARTED` | 8% |
| E-8 | Testing & Polish | `NOT STARTED` | 5% |
| E-9 | Final Verification & Submission | `NOT STARTED` | 3% |

**Progres berbobot: 30%** = E-0 (10%) + E-1 (10%) + E-2 (10%). E-2a **bukan** fase berbobot
(0%) — ia checkpoint Git di dalam E-2. E-3…E-9 (total 70%) tetap `NOT STARTED`.

### 3.2 Artifact readiness

Angka "direncanakan" berasal dari dokumen yang sudah disetujui, bukan estimasi.

| Artefak | Terbangun | Direncanakan | Sumber |
| --- | --- | --- | --- |
| Dokumen proyek | **8** | 8 | `README.md` §Documentation map |
| Halaman / route UI | **0** | 13 | `docs/design-solution.md` §3 |
| Route handler API | **0** | 16 | `docs/api-contract.md` |
| Tabel database | **0** | 7 | `docs/database-design.md` §2 |
| SQL function | **0** | 4 | `docs/database-design.md` §5 |
| Integration eksternal | **0** | 1 | `docs/technical-decisions.md` ADR-8 |
| Workflow n8n | **0** | 1 | `docs/technical-decisions.md` ADR-9 |
| Acceptance criteria verified | **0** | 42 | `docs/mvp-scope.md` §6 |
| Test (unit + integration + E2E) | **11 unit** (1 file) | sesuai `mvp-scope` §7 | `docs/mvp-scope.md` §7 |
| Deployment demo | **0** | 1 | di luar cakupan dokumen |
| File foundation aplikasi | **25** | 25 | di-commit pada `7ed8371` |
| Dependency terpasang | **17** | 17 | `package.json` / `package-lock.json` |

---

## 4. Phase Plan & Progress

Format tiap fase: **Objective · Tasks · Status · Verification result · Blockers / risks ·
Completion date · References**.

### E-0 — Planning — `COMPLETED`

- **Objective:** Menetapkan konsep produk, scope MVP, arsitektur, kontrak, dan desain sebelum
  satu baris kode ditulis; menutup keputusan terbuka melalui koreksi bertahap.
- **Tasks:**
  - [x] Repository assessment + verifikasi stack terhadap registry (Next 16.4.6, React 19.3.1, Tailwind 4.3.5, Zod 4.6.7, Supabase JS 2.119.2, Vitest 5.1.2, Playwright 1.65.1)
  - [x] Verifikasi kandidat external API (REST Countries v3.1 deprecated, v5 butuh key, `countriesnow.space` tanpa key)
  - [x] Proposal MVP scope, arsitektur, database, API, security, testing, roadmap
  - [x] Koreksi 1: D1–D6 (external API, mock gateway, payment terminal, capability token, aset, folder structure)
  - [x] Koreksi 2: pemisahan Node/Postgres pada token, atomic claim outbox, header capability, batas MVP
  - [x] Koreksi 3: fencing `locked_at`, presisi acceptance criteria, penempatan header
  - [x] Change Detection + persetujuan eksplisit sebelum eksekusi dokumentasi
- **Status:** `COMPLETED`
- **Verification result:** Seluruh fase berjalan **read-only**; direktori target tetap 0 file
  sampai persetujuan E-1 diberikan. Tidak ada dependency, migration, `git init`, commit, atau
  push yang dijalankan. Keputusan yang belum pasti ditandai `Proposed`/`REVIEW`, bukan
  diklaim selesai.
- **Blockers / risks:** Tidak ada. Risiko yang tersisa dipindahkan ke Known Issues
  (`KI-01`, `KI-04`, `KI-05`…`KI-08`).
- **Completion date:** 2026-11-26
- **References:** `docs/technical-decisions.md`, `docs/mvp-scope.md`

### E-1 — Documentation — `COMPLETED`

- **Objective:** Mendokumentasikan desain, kontrak, batasan, dan rencana MVP yang disetujui
  sebagai sumber kebenaran tunggal sebelum implementasi.
- **Tasks:**
  - [x] `README.md`
  - [x] `AGENTS.md`
  - [x] `docs/architecture.md`
  - [x] `docs/technical-decisions.md`
  - [x] `docs/design-solution.md`
  - [x] `docs/mvp-scope.md`
  - [x] `docs/database-design.md`
  - [x] `docs/api-contract.md`
  - [x] Verifikasi silang: link internal, label status, konsistensi konstanta, tidak ada klaim implementasi
- **Status:** `COMPLETED`
- **Verification result:** 8/8 file ada (total ±100 KB) · 12 referensi internal resolve ·
  0 klaim `Implemented` palsu · 0 sisa pola terlarang (`INTERNAL_DISPATCH_SECRET`,
  `/api/internal/outbox/*`, `flagcdn`, `REST_COUNTRIES_API_KEY`) · status enum konsisten
  (order `pending/paid/failed`, payment `pending/succeeded/failed`, outbox
  `pending/processing/sent/failed`) · fence kode seimbang · git belum diinisialisasi.
  Baseline integritas tercatat di §4.1.
- **Blockers / risks:** Tidak ada blocker teknis. Aset visual tetap `REVIEW` (KI-01).
- **Completion date:** 2026-11-26
- **References:** seluruh 8 dokumen.

#### 4.1 Baseline integritas dokumen (E-1)

Dicatat agar perubahan tak sengaja pada 8 dokumen dapat dideteksi. sha256, 12 karakter pertama.

| File | sha256 (prefix) |
| --- | --- |
| `README.md` | `dcdd6c030261` |
| `AGENTS.md` | `738e98ada2ae` |
| `docs/api-contract.md` | `9a1f2e444e2a` |
| `docs/architecture.md` | `f72aa579bf77` |
| `docs/database-design.md` | `67f126c88185` |
| `docs/design-solution.md` | `44cb8a42af37` |
| `docs/mvp-scope.md` | `486562ca4560` |
| `docs/technical-decisions.md` | `d526ccf29b5c` |

(Diperbarui 2026-11-27 setelah rekonsiliasi E-3; nilai lama tercatat pada riwayat Git.)

### E-2 — Foundation — `COMPLETED`

- **Objective:** Menyiapkan kerangka aplikasi yang dapat dijalankan: scaffold Next.js 16 +
  TypeScript, Tailwind v4, konfigurasi environment, tiga Supabase client, proteksi route
  admin, logger dengan redaksi, dan konfigurasi test.
- **Tasks:**
  - [x] Scaffold Next.js 16 (App Router) + TypeScript
  - [x] Tailwind CSS v4 CSS-first + design tokens (`@theme`, token `--font-*`)
  - [x] `src/lib/env.ts` (server-only) + `src/lib/env.public.ts` + `.env.example` (8 variabel)
  - [x] `src/lib/supabase/{browser,server}.ts` — `admin.ts` **tidak dibuat** (lihat KI-19)
  - [x] `src/proxy.ts` — gate sesi fail-closed untuk `/admin/*` (Next 16, bukan `middleware.ts`)
  - [x] `src/lib/logger.ts` — redaksi `Idempotency-Key`, `token`, path capability
  - [x] `src/components/ui` — `cn`, `Button`, `Input` (`Select`/`StatusBadge` ditunda ke E-5/E-6)
  - [x] Konfigurasi Vitest (Playwright ditunda ke E-8)
  - [x] `next.config.ts` header `/orders/:path*` dan `/mock-gateway/:path*`
- **Deviasi scope (disetujui sebelum eksekusi):** 2 Supabase client (bukan 3) · 3 primitif UI
  (bukan 5) · Vitest saja · env dipecah 2 modul (public/server) · tanpa `next/font`
- **Status:** `COMPLETED`
- **Verification result:** **G1** typecheck ✓ · **G2** lint 0 error/0 warning ✓ · **G3** 11/11
  unit test ✓ · **G4** build tanpa env ✓ · **G5** header `Referrer-Policy: no-referrer` /
  `Cache-Control: no-store` / `X-Robots-Tag` ✓ · **G6** 0 kebocoran rahasia di `.next/static` ✓
  · **G7a** tanpa sesi 307 (5–22 ms) · **G7b** auth menggantung → abort **3,054 s / 3,042 s** ·
  **G7c** tanpa env 307 (13 ms) · **G7d** 4 kasus `isAdminUser` ✓ · **G8** 9 hash baseline
  identik ✓ · **G9** HEAD tetap `5d5895f` saat itu ✓ · **G10** 0 impor `next/font` ✓ ·
  **G11** `@playwright/test` kosong ✓ · **G12** 25 untracked / 0 modified ✓
  Catatan: `next build` menyesuaikan `tsconfig.json` secara wajib (`jsx: react-jsx`, include
  `.next/dev/types`) dan menghasilkan `next-env.d.ts` (di-ignore).
  **Batas verifikasi — G1–G12 TIDAK membuktikan integrasi Supabase Auth, RLS, maupun seluruh
  skenario 401/403.** Yang terbukti hanya perilaku fail-closed proxy dan logika keputusan
  `isAdminUser` secara unit. Integrasi Auth/RLS diuji di E-3 dan 401/403 dengan sesi nyata di E-6.
- **Blockers / risks:** Tidak ada blocker implementasi E-2 yang belum terselesaikan.
  KI-01, KI-02, dan KI-04 tetap terbuka sebagai known issues untuk fase berikutnya.
  `KI-03` dan `KI-09` selesai pada E-2/E-2a; batas verifikasi: `/admin/login` belum ada (`KI-20`).
- **Completion date:** 2026-11-26
- **References:** `README.md` §Installation, §Environment variables · `AGENTS.md` §Where things
  live · `docs/architecture.md` §3, §9 · `docs/technical-decisions.md` ADR-1, ADR-2, ADR-10

#### 4.2 E-2a — Git Commit & Push — `COMPLETED`

- **Objective:** Menyimpan foundation E-2 sebagai checkpoint Git yang dapat dilacak.
- **Tasks:**
  - [x] Stage 25 path eksplisit (tanpa `git add .`)
  - [x] Gate A — isi staging (25 baris `A`, 0 non-A)
  - [x] Gate B — secret scan + artefak + biner
  - [x] Commit `feat: establish application foundation and core infrastructure`
  - [x] Gate C — remote masih di baseline sebelum push
  - [x] Push fast-forward tanpa force
  - [x] Verifikasi commit, tracking, dan isi tree remote
- **Status:** `COMPLETED`
- **Verification result:** Commit `7ed8371e81e4090498398f3576ffe4833b08a2c5` (25 file, 9.352
  insertions) · gate B: 0 secret/biner/artefak · push `5d5895f..7ed8371` tanpa force ·
  `HEAD` = `origin/main` · working tree clean · blob 9 dokumen identik antara `5d5895f` dan
  `7ed8371` · total file di `origin/main` = 34
- **Blockers / risks:** Tidak ada.
- **Completion date:** 2026-11-26
- **References:** commit `7ed8371`, `5d5895f`

### E-3 — Schema & RLS — `COMPLETED`

- **Objective:** Menyediakan skema database, constraint, index, RLS, dan lima SQL function
  yang menjadi dasar seluruh alur transaksi dan idempotency.
- **Tasks:**
  - [x] Desain, audit, dan rekonsiliasi dokumentasi (D-1…D-11) — 2026-11-26
  - [x] Migration 1: fungsi helper (`is_admin`, guard terminal, validator I2/I5, `enforce_payment_amount`, `set_updated_at`) + hardening `SECURITY DEFINER`
  - [x] Migration 2: `destinations`, `packages` + constraint + index + trigger `BEFORE UPDATE`
  - [x] Migration 3: `orders`, `payments`, `idempotency_keys` + constraint + index + trigger I1/I2/I6
  - [x] Migration 4: `notification_outbox`, `mock_gateway_transactions` + index parsial + trigger I5
  - [x] Migration 5: 5 RPC (`create_order_idempotent`, `settle_payment`, `claim_outbox`, `finish_outbox`, `record_mock_settlement`) + **sweep ceiling** di `claim_outbox`
  - [x] Migration 6: `ENABLE RLS` + **7 policy** + grant/revoke tabel + **5 REVOKE eksplisit RPC** + revoke CREATE schema
  - [x] Seed: 5 destinasi + 15 paket (idempoten), tanpa baris `auth.*`
  - [x] `src/lib/supabase/admin.ts` (`server-only`) + `vitest.config.integration.ts` + fixture `ensureAdminUser`/`ensureMemberUser` (Admin API)
  - [x] Integration test: constraint, transaksi, idempotency (10 request paralel), RLS + privilege matrix, terminal immutability, snapshot paket, state machine settlement, outbox claim/fencing + race sweep
  - [x] Verifikasi NV-01…NV-05 (NV-03a lokal; `db push` remote **tidak dijalankan**)
  - [x] `npx supabase db reset` dua kali: 6 migration, `destinations=5`, `packages=15`
- **Status:** `VERIFIED` (lokal). Belum di-commit.
- **Verification result:** `db reset` ×2 bersih (6 migration, 5 destinasi, 15 paket, idempoten) ·
  **NV-01/NV-02 lulus** · **NV-03a lulus**: matriks privilege efektif sesuai desain (5 RPC hanya
  `service_role`, `is_admin()` hanya `authenticated` dan tetap `prosecdef = false`, 7 trigger function
  tidak dapat dieksekusi siapa pun, 0 grantee `PUBLIC`, matriks tabel 7/7 sesuai, RLS aktif 7/7, 7
  policy persis) · **NV-04 lulus**: 0 secret pada `supabase/**`, `package.json`, `.gitignore`;
  satu-satunya kunci adalah kunci demo Supabase lokal di `supabase/.temp/` (gitignored) ·
  **NV-05 lulus**: 21 deviasi dokumen (D-01…D-21) ditutup atau dicatat · `npm run lint` 0 error/0
  warning · `npm run typecheck` 0 error · `npm run test` 11/11 · `npm run test:int` **85/85** (8 file) ·
  AC: **9 penuh + 11 database-scope**.
- **Temuan yang diklasifikasikan:**
  - D-14 (**non-blocker, laten**): `pg_default_acl` untuk fungsi buatan `postgres` di schema `public`
    hanya memberi `EXECUTE` ke `postgres`, sehingga kebocoran grant ke `anon`/`authenticated` **tidak
    aktif** di konfigurasi lokal. Tetap diterapkan 5 `REVOKE` eksplisit sebagai hardening agar hasil
    akhir tidak bergantung `api.auto_expose_new_tables` (default cloud = `true`) dan agar objek yang
    dibuat lewat Studio (role `supabase_admin`, yang default-nya mengekspos) tidak mewarisi grant.
  - D-17 (**blocker pada guarantee, diperbaiki**): crash pada klaim ke-5 meninggalkan baris
    `processing` permanen. Disetujui opsi C: sweep di awal `claim_outbox`; 3 kasus race
    `finish_outbox` vs sweep diuji (10 iterasi), invarian terbukti dan tidak ada `sent` → `failed`.
  - D-21 (**non-blocker**): `locked_at` diuji sebagai opaque string; token ter-truncate ke milidetik
    terbukti menghasilkan `stale`.
- **Blockers / risks:** `KI-01` (aset) dan `KI-04` (kanal n8n) tetap terbuka. `KI-02` dan `KI-19`
  ditutup. Risiko jadwal `KI-10` meningkat (lihat estimasi).
- **Completion date:** 2026-11-27
- **Estimasi:** rencana 505 menit; **aktual ± 330 menit** implementasi + verifikasi (di bawah rencana
  karena sweep dan M6 hanya +11 baris). Rekonsiliasi dokumentasi 60 menit (2026-11-26).
- **References:** `docs/database-design.md` §2–§6 · `docs/technical-decisions.md` ADR-4, ADR-6, ADR-7,
  ADR-9, ADR-10 · `docs/api-contract.md` §4.3–§4.6 · `AGENTS.md` §Forbidden patterns · DL-22…DL-25

### E-4 — Storefront & Seed — `NOT STARTED`

- **Objective:** Storefront yang dapat dijelajahi end-to-end dengan data seed dan aset final.
- **Tasks:**
  - [ ] Layout store + homepage
  - [ ] `/destinations` (filter region)
  - [ ] `/destinations/[slug]` daftar paket
  - [ ] `/packages/[slug]` detail + CTA
  - [ ] Aset final terpasang setelah review visual (attribution tersimpan)
  - [ ] Data seed dengan URL & atribusi aset final
- **Status:** `NOT STARTED`
- **Verification result:** Belum ada. Bukti yang diperlukan: screenshot desktop + 375px,
  tidak ada gambar rusak (fallback bekerja), atribusi tampil di halaman detail destinasi.
- **Blockers / risks:** `KI-01` aset belum disetujui visual → memblokir finalisasi seed aset.
- **Completion date:** —
- **References:** `docs/design-solution.md` §3, §6, §8 · `docs/architecture.md` §5.1

### E-5 — Checkout, Payment & Idempotency — `NOT STARTED`

- **Objective:** Alur checkout guest sampai status order final dengan pembayaran yang hanya
  berubah melalui verifikasi server dan idempotency yang tahan konkurensi.
- **Tasks:**
  - [ ] `POST /api/checkout` (Zod strict, `Idempotency-Key`)
  - [ ] Token capability 256-bit + hash di `orders` + sealed token pada idempotency
  - [ ] Halaman `/mock-gateway/[ref]` (simulasi) + endpoint settle
  - [ ] `POST /api/payments/verify` + `settle_payment`
  - [ ] `GET /api/orders/[token]` + halaman order status
  - [ ] Header capability (`no-referrer`, `no-store`, `noindex`) + 0 third-party request
  - [ ] Unit + integration test (AC-C, AC-P, AC-T1…AC-T9)
- **Status:** `NOT STARTED`
- **Verification result:** Belum ada. Bukti yang diperlukan: walkthrough checkout→paid,
  test 10 paralel = 1 order, replay mengembalikan `capabilityUrl` identik, snapshot
  `orders`/`payments` tidak berubah saat settle dipanggil, header test lulus.
- **Blockers / risks:** Risiko tertinggi proyek (idempotency + transisi state). Tidak ada
  blocker eksternal; bergantung pada E-3.
- **Completion date:** —
- **References:** `docs/api-contract.md` §4.3–§4.6, §6 · `docs/database-design.md` §5.1–§5.2 ·
  `docs/mvp-scope.md` §6.1–§6.2, §6.4 · `docs/technical-decisions.md` ADR-5, ADR-6, ADR-7, ADR-10

### E-6 — Admin CMS — `NOT STARTED`

- **Objective:** Admin dapat mengelola katalog dan memantau order/payment dengan filter
  server-side.
- **Tasks:**
  - [ ] Login/logout (Supabase Auth, Server Action) + seed admin
  - [ ] `requireAdmin()` di setiap route/page admin + guard `proxy.ts`
  - [ ] CRUD destinasi + aksi "Fill from API"
  - [ ] CRUD paket (validasi harga/validity)
  - [ ] Daftar order: 24h/7d/30d, status, search, keyset 10 baris
  - [ ] Daftar payment: filter setara
  - [ ] Overview (4 angka + 5 order terbaru)
- **Status:** `NOT STARTED`
- **Verification result:** Belum ada. Bukti yang diperlukan: Playwright flow admin lulus,
  `401`/`403` terbukti, halaman tidak menampilkan lebih dari 10 baris.
- **Blockers / risks:** Bergantung pada E-3 dan E-4. Risiko rendah.
- **Completion date:** —
- **References:** `docs/api-contract.md` §5 · `docs/mvp-scope.md` §6.3 · `AGENTS.md` §Forbidden patterns

### E-7 — n8n & Outbox — `NOT STARTED`

- **Objective:** Notifikasi order-paid terkirim melalui satu workflow n8n, dengan dispatch
  yang aman terhadap konkurensi dan kegagalan.
- **Tasks:**
  - [ ] Workflow n8n: webhook + verifikasi `X-Webhook-Secret` + kirim pesan
  - [ ] `dispatchOutbox` (claim → kirim → finish) dengan timeout 10 s, retry 1×
  - [ ] Pemanggilan `after()` pada jalur verify
  - [ ] Aksi admin "Resend notification"
  - [ ] Integration test claim paralel + fencing (`stale`)
  - [ ] Bukti: screenshot/JSON notifikasi terkirim
- **Status:** `NOT STARTED`
- **Verification result:** Belum ada. Bukti yang diperlukan: 2 dispatch bersamaan = 1 kirim;
  `finish_outbox` stale tidak mengubah row; payload memuat `notificationId` dan tanpa token.
- **Blockers / risks:** `KI-04` kanal pengiriman n8n belum dipilih (asumsi A4) · `KI-06`
  at-least-once diterima.
- **Completion date:** —
- **References:** `docs/technical-decisions.md` ADR-9 · `docs/database-design.md` §2.6, §5.3–§5.4 ·
  `docs/api-contract.md` §5.6, §7 · `docs/mvp-scope.md` §6.4

### E-8 — Testing & Polish — `NOT STARTED`

- **Objective:** Seluruh aturan bisnis berisiko terbukti lulus dan UI rapi di tiga breakpoint.
- **Tasks:**
  - [ ] Vitest unit lengkap
  - [ ] Vitest integration lengkap (constraint, idempotency, RLS, outbox)
  - [ ] Playwright 2 flow utama
  - [ ] Manual pass responsive 375 / 768 / 1280
  - [ ] Verifikasi acceptance criteria (target: seluruh 42)
  - [ ] Aksesibilitas dasar (fokus, kontras, keyboard)
- **Status:** `NOT STARTED`
- **Verification result:** Belum ada. Bukti yang diperlukan: output test + tabel AC terisi.
- **Blockers / risks:** `KI-10` waktu; cut-line diterapkan bila slip > 3 jam (E2E flow 2 →
  manual + screenshot, integration RLS diringkas ke 3 assertion).
- **Completion date:** —
- **References:** `docs/mvp-scope.md` §6, §8 · `docs/technical-decisions.md` ADR-11

### E-9 — Final Verification & Submission — `NOT STARTED`

- **Objective:** Memastikan dokumentasi = kode = perilaku, lalu menyerahkan.
- **Tasks:**
  - [ ] Sinkronisasi dokumen yang berubah selama implementasi
  - [ ] README final (cara run, env, limitations tetap akurat)
  - [ ] Demo script
  - [ ] Verifikasi ulang AC-T1…AC-T17
  - [ ] Bukti pengumpulan (screenshot, workflow JSON, output test)
  - [ ] Submit sebelum deadline
- **Status:** `NOT STARTED`
- **Verification result:** Belum ada. Bukti yang diperlukan: checklist `docs/mvp-scope.md` §7
  terisi dengan bukti nyata.
- **Blockers / risks:** `KI-10` waktu; target submit 2026-11-29 ≤ 15:00 WIB (buffer 9 jam).
- **Completion date:** —
- **References:** `docs/mvp-scope.md` §7, §8

---

## 5. Decision Log

Satu baris per keputusan yang sudah disetujui. Alasan lengkap ada di dokumen rujukan.

| ID | Tanggal | Keputusan | Status | Rujukan |
| --- | --- | --- | --- | --- |
| DL-01 | 2026-11-26 | External API tunggal tanpa key: `countriesnow.space`, enrichment on-demand, fallback seed | Approved | ADR-8 |
| DL-02 | 2026-11-26 | Mock gateway di dalam Next.js, route terisolasi, nonaktif di produksi | Approved | ADR-7 |
| DL-03 | 2026-11-26 | Payment `failed` terminal; satu payment record per order | Approved | ADR-7, DB §2.4 |
| DL-04 | 2026-11-26 | Capability token 256-bit, disimpan hash-only di `orders` | Approved | ADR-5 |
| DL-05 | 2026-11-26 | Token dibuat/di-hash/di-seal di Node; RPC menerima hash + sealed | Approved | ADR-6 |
| DL-06 | 2026-11-26 | Idempotency `unique(scope,key)` + payload hash + window replay 24 jam | Approved | ADR-6 |
| DL-07 | 2026-11-26 | Aset Wikimedia dengan URL & lisensi terverifikasi, status `REVIEW` | Approved | Design §8 |
| DL-08 | 2026-11-26 | Modular monolith + struktur folder final | Approved | Architecture §1, §4 |
| DL-09 | 2026-11-26 | Outbox dengan atomic claim (`FOR UPDATE SKIP LOCKED`, status `processing`) | Approved | ADR-9 |
| DL-10 | 2026-11-26 | `finish_outbox` memakai fencing `locked_at` | Approved | ADR-9 |
| DL-11 | 2026-11-26 | Lease outbox 120 s, timeout n8n 10 s, retry 1× dalam claim yang sama | Approved | ADR-9 |
| DL-12 | 2026-11-26 | Header capability di `next.config.ts`; API order menetapkan sendiri `no-store` | Approved | ADR-10 |
| DL-13 | 2026-11-26 | Notifikasi at-least-once + `notificationId`; exactly-once tidak dijanjikan | Approved | ADR-9, MVP §6.4 |
| DL-14 | 2026-11-26 | Tanpa auto-expiry order `pending`; tanpa queue/scheduler/worker | Approved | ADR-12 |
| DL-15 | 2026-11-26 | `src/proxy.ts` hanya mengimpor `env.public.ts`; `env.ts` (server-only) dipakai modul server | Implemented | `src/proxy.ts:4` |
| DL-16 | 2026-11-26 | Timeout dibatasi lewat `global.fetch` + `AbortSignal.any` di `createFetchWithTimeout` | Implemented | `src/lib/http.ts:90`, `src/proxy.ts:74`, `src/lib/supabase/server.ts:39` |
| DL-17 | 2026-11-26 | Tanpa `next/font`; tipografi memakai token `--font-display`/`--font-sans` | Implemented | `src/app/globals.css:22,24` |
| DL-18 | 2026-11-26 | `typescript` 5.9.3 dan `eslint` 9.39.5 dipin eksak (bukan range) | Implemented | `package.json`; lihat KI-21 |
| DL-19 | 2026-11-26 | `session.ts` tanpa `server-only`; batas rahasia ada di `env.ts` | Implemented | `src/lib/env.ts:1`, `src/modules/auth/session.ts:9` |
| DL-20 | 2026-11-26 | `next-env.d.ts` di-ignore agar working tree tepat 25 file | Implemented | `.gitignore:9` |
| DL-21 | 2026-11-26 | `service_role` tanpa DML pada 5 tabel transaksi; 5 RPC `SECURITY DEFINER` (owner `postgres`, `search_path=''`) satu-satunya penulis | Approved (desain) | DB §4, §5 · ADR-7 |
| DL-22 | 2026-11-27 | Lima `REVOKE ALL ON FUNCTION … FROM public, anon, authenticated, service_role` ditambahkan di migration 0006 sebelum `GRANT EXECUTE … TO service_role` (hardening D-14, hasil akhir tidak bergantung `api.auto_expose_new_tables`) | Implemented + Verified | `supabase/migrations/20261126090006_rls.sql` · `tests/integration/admin/privileges.test.ts` |
| DL-23 | 2026-11-27 | `claim_outbox` menyapu baris `processing` dengan `attempts >= 5` dan lease kedaluwarsa menjadi `failed` (`lease_expired_after_max_attempts`) sebelum klaim; tanpa field tambahan di respons | Implemented + Verified | `supabase/migrations/20261126090005_functions.sql` · ADR-9 · `tests/integration/outbox.test.ts` |
| DL-24 | 2026-11-27 | `locked_at` diperlakukan sebagai opaque fencing token string; dilarang dikonversi ke `Date` | Implemented + Verified | DB §5.3–§5.4 · `tests/integration/outbox.test.ts`, `support/assert.ts` |
| DL-25 | 2026-11-27 | `.env.test` dimuat dengan parser eksplisit + penolakan konflik (bukan `process.loadEnvFile`, yang tidak menimpa env yang sudah ada) dan guard loopback wajib | Implemented + Verified | `tests/integration/support/env.ts`, `global-setup.ts` · `meta.test.ts` |
| DL-22 | 2026-11-26 | `settle_payment` hanya `succeeded`/`failed`; `record_mock_settlement` menerima 3 outcome (`pending` boleh naik ke terminal, terminal immutable) | Approved (desain) | DB §5.2, §5.5 · API §4.5 |
| DL-23 | 2026-11-26 | `orders.package_data_snapshot` (turunan deterministik), kardinalitas order→payment **at most one**, pencarian admin **exact match** | Approved (desain) | DB §1, §2.2, §2.3 · API §5.4 |

---

## 6. Known Issues

| ID | Isu | Severity | Jenis | Blokir fase | Next step |
| --- | --- | --- | --- | --- | --- |
| KI-01 | Aset destinasi berstatus `REVIEW`, belum disetujui visual | Medium | Terbuka | E-4 | Review manusia atas 5 primary image |
| KI-02 | Supabase CLI belum terpasang (Docker 29.9.2 tersedia) | Medium | **Resolved** (2026-11-27) | — | CLI 3.4.0 dijalankan via `npx`; belum dipin sebagai devDependency (keputusan terpisah) |
| KI-03 | Dependency di-install | Medium | **Resolved** (2026-11-26) | — | 397 paket terpasang, lockfile v3, commit `7ed8371` |
| KI-04 | Kanal pengiriman n8n belum dipilih (asumsi A4) | Low | Terbuka | E-7 | Putuskan SMTP/chat sink |
| KI-05 | Order `pending` tanpa auto-expiry | Low | Diterima | — | Terdokumentasi di README §Limitations |
| KI-06 | Notifikasi at-least-once, duplikat mungkin | Low | Diterima | — | `notificationId` untuk dedup penerima |
| KI-07 | Access log infrastruktur mencatat path capability | Low | Diterima | — | Mitigasi header + 0 third-party (ADR-10) |
| KI-08 | Tanpa analytics / error monitoring | Low | Diterima | — | Aturan larangan di `AGENTS.md` |
| KI-09 | Git belum diinisialisasi | Low | **Resolved** (2026-11-26) | — | Repo terinisialisasi; 2 commit, `origin/main` sinkron |
| KI-10 | Sisa waktu ±3 hari untuk 8 fase implementasi | High | Risiko | E-8, E-9 | Cut-line + buffer submit |
| KI-19 | `src/lib/supabase/admin.ts` belum dibuat (deferred/open) | Low | **Resolved** (2026-11-27) | — | Dibuat di E-3: `server-only`, tanpa `next/server`, timeout `AbortSignal` inline |
| KI-20 | `/admin/login` belum ada → halaman tujuan redirect masih 404 | Low | Terbuka | — | Ditutup E-6 |
| KI-21 | `eslint@9.39.5` memunculkan peringatan EOL saat install | Low | **Diterima (warning)** | — | Pantau; naikkan hanya bila seluruh plugin mendukung |
| KI-22 | Baris outbox `failed` + `attempts = 5` bersifat terminal untuk dispatch; pemulihan hanya lewat runbook operator (bukan jalur aplikasi) | Low | **Diterima** (2026-11-27) | E-7 | Didokumentasikan di ADR-9 §Recovery dan DB §5.3 |
| KI-23 | `claim_outbox` mengembalikan `locked_at` sebagai string ISO; konversi ke `Date` memutus fencing | Medium | **Dimigasi** (2026-11-27) | E-7 | Dijaga assert `assertOpaqueFencingToken` + TP-2/TP-4 di `tests/integration/outbox.test.ts` |

Catatan: `Diterima` berarti risiko diketahui dan disengaja, bukan bug yang belum ditemukan.

---

## 7. Next Actions

| ID | Aksi | Dependency | Butuh persetujuan |
| --- | --- | --- | --- |
| NA-01 | Catat `WORK_TRACKER.md` sebagai artefak resmi progres | — | Selesai |
| NA-02 | Setujui scope E-2 (scaffold + dependency) | NA-01 | Selesai (`7ed8371`) |
| NA-03 | Review visual 5 primary image | — | **Ya (pemilik proyek)** |
| NA-04 | Pilih kanal notifikasi n8n | — | **Ya (pemilik proyek)** |
| NA-05 | Setujui `git init` + `.gitignore` | — | Selesai (`5d5895f`, `.gitignore` di `7ed8371`) |
| NA-06 | Jalankan E-2 langkah pertama setelah NA-02 | NA-02 | Selesai |
| NA-07 | Menunggu persetujuan untuk memulai **E-3 Analysis/Proposal** (bukan izin implementasi E-3) | NA-02 | **Ya** |
| NA-08 | Sinkronkan `docs/design-solution.md` §5.2 (font) dan `AGENTS.md` (daftar skrip) dengan realitas E-2 | — | **Menunggu persetujuan terpisah** (belum ada izin mengubah dokumen baseline) |

Urutan yang disarankan: **NA-07** (mulai E-3 Analysis/Proposal) → implementasi E-3 hanya setelah
proposal E-3 disetujui; **NA-03/NA-04** diperlukan sebelum E-4/E-7; **NA-08** menunggu
persetujuan terpisah — tanpa izin tersebut, `AGENTS.md` dan `docs/design-solution.md` tidak
disentuh.

---

## 8. Change Log

Append-only. Satu baris per perubahan status atau artefak.

| Tanggal | Entri | Status |
| --- | --- | --- |
| 2026-11-26 | E-0 Planning selesai: analysis, proposal, 3 putaran koreksi teknis, change detection | `COMPLETED` |
| 2026-11-26 | E-1 Documentation selesai: 8 file dibuat dan diverifikasi (link, label, konsistensi) | `COMPLETED` |
| 2026-11-26 | `WORK_TRACKER.md` dibuat sebagai pencatat progres utama | `COMPLETED` |
| 2026-11-26 | E-2 Foundation dibuka sebagai fase aktif berikutnya | `NOT STARTED` |
| 2026-11-26 | E-2 Foundation selesai: 25 file, 17 dependency, G1–G12 lulus | `COMPLETED` |
| 2026-11-26 | E-2a checkpoint Git: commit `7ed8371` di `main`, `origin/main` sinkron | `COMPLETED` |
| 2026-11-26 | E-2b: tracker disinkronkan dengan E-2/E-2a; dokumen baseline & kode tidak diubah | `COMPLETED` |
| 2026-11-26 | E-3 rekonsiliasi dokumentasi D-1…D-11 (5 dokumen); implementasi tetap belum diizinkan | `COMPLETED` |

Baris E-2b **tidak** disiapkan sebagai `COMPLETED` di muka. Baris tersebut ditambahkan hanya
setelah `WORK_TRACKER.md` berhasil diperbarui **dan** V1–V18 lulus, dengan bentuk:

`| 2026-11-26 | E-2b: tracker disinkronkan dengan E-2/E-2a; dokumen baseline & kode tidak diubah | COMPLETED |`

Bila ada gate gagal: baris dicatat dengan status sebenarnya (`IN PROGRESS` atau `BLOCKED` + ID
`KI-xx`), atau tidak ditambahkan sama sekali. Tidak ada status `COMPLETED` tanpa bukti.

---

## 9. Update Protocol

### 9.1 Kapan tracker diubah

- Saat sebuah fase dimulai (`NOT STARTED` → `IN PROGRESS`).
- Saat sebuah fase terblokir (`BLOCKED` + ID `KI-xx`).
- Saat sebuah fase selesai dan terverifikasi (`COMPLETED` + tanggal + bukti).
- Saat keputusan baru disetujui (tambah baris Decision Log).
- Saat risiko/is u baru ditemukan (tambah baris Known Issues).

### 9.2 Bukti yang sah untuk `COMPLETED`

| Jenis pekerjaan | Bukti minimum |
| --- | --- |
| Dokumentasi | Inventaris file + hasil pemeriksaan link/label |
| Kode UI | Screenshot desktop + mobile, tanpa error console |
| Kode API / domain | Output test (unit/integration) yang lulus |
| Database / migration | `db reset` bersih + test constraint/RLS lulus |
| Integrasi eksternal | Respons sukses + skenario fallback |
| Automasi n8n | Bukti notifikasi terkirim (screenshot/JSON) + test claim/fencing |
| Deployment | URL yang dapat dibuka + smoke check |

### 9.3 Aturan konsistensi

- Fase `COMPLETED` di tracker harus sama dengan label `Implemented`/`Verified` di dokumen
  terkait; bila berbeda, dokumentasi yang diperbaiki lebih dulu.
- Angka di §3 harus dapat dihitung ulang dari dokumen rujukan; bila tidak, perbaiki angkanya.
- Tracker tidak pernah menjadi sumber kebenaran untuk kontrak teknis.
