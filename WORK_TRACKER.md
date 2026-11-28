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
| Fase terakhir selesai | **E-8 Testing & Polish — `CLOSED`** (2026-11-28; all verification gates passed) |
| Fase aktif | **E-8 Testing & Polish — `CLOSED`** · berikutnya E-9 (`NOT STARTED`) |
| Checkpoint commit | E-2/E-2a: `7ed8371e81e4090498398f3576ffe4833b08a2c5` · E-3: `af53146`, `f4172e1`, `7d18015` · E-4: `96b69b2`, `33d99f6`, `23f25b4` + commit penutupan fase · E-5: `5fc02d6`, `5565b5b`, `220517c` (ter-push) · pasca-penutupan: `9cd350d`, `d429ce7`, + commit dokumentasi ini (2026-11-27) · baseline dokumen: `5d5895f9223f8a700a7248745ab5905b7b4c87fb` |
| Deadline project | **2026-11-29 23:59 WIB** |
| Fase selesai | **9 / 10 (90%)** + 1 checkpoint tanpa bobot (E-2a) |
| Acceptance criteria terverifikasi | **42 / 42 tercatat** = 38 penuh + 2 database-scope (T7, T11) + 2 parsial (E2 → `KI-40`, diputuskan post-MVP; T12 → jalur HTTP `409 NOTIFICATION_IN_FLIGHT` belum diuji, sedangkan `in_flight` di modul sudah PASS di unit+integration) · **0 pending** · A1 naik ke **Verified** lewat E2E admin E-8 |
| Kode aplikasi | **96 file** di `src/**` (`.ts`/`.tsx`): 90 sebelum E-7, 6 ditambahkan E-7 (4 modul automation, 1 route resend, 1 komponen Resend) |
| Migration | **6** (`supabase/migrations/`) |
| Test dijalankan | **227 unit** (16 file, PASS) + **95 integration** (10 file, PASS) + **3 Playwright** (2 flow, PASS pada **dua run berturut-turut**) + build PASS (26 route) + lint 0/0 + typecheck 0 · JSON workflow valid · Code node statis 24/24 · **MT-1 PASS · MT-2A PASS · MT-6 PASS** (manual, Mailpit lokal) · MT-2B/MT-3/MT-4 ditunda |
| Browser E2E | **PASS (Playwright 1.65.1, Chromium)** — 3 test / 2 flow, dua run berturut-turut (24.9 s lalu 21.7 s): customer `destinations → package → checkout → simulated success → order paid` (order `RML-HYEX0T` + `RML-4R7EUW`, keduanya `paid`, `Rp 89.000`, harga dihitung server) · admin `wrong password → login → create → edit price → delete` (fixture `e2e-fixture-*` dihapus, **0 sisa** pada kedua run) · mobile 390×844 tanpa horizontal overflow |
| Deployment | **belum dikonfigurasi** |
| Blocker terbuka | **0 blocker E-8** (fase `CLOSED`). Sisa bukan blocker: MT-2B/MT-3/MT-4 (failure-path manual), prosedur import (`KI-42`), email publik belum diuji, dan item P2 post-MVP (`KI-26`, `KI-27`, `KI-31`, `KI-32`, `KI-38`, `KI-40`). **Catatan operasional:** Docker Desktop + stack Supabase lokal dihentikan secara normal (`npx supabase stop`) bila tidak digunakan; dua order E2E tetap tersimpan di DB lokal |
| Persetujuan yang ditunggu | **commit/push E-8** · MT-2B/MT-3/MT-4 menunggu persetujuan terpisah (tidak menghalangi closure E-8 yang sudah disetujui) |

Ringkasan satu kalimat: **E-6, E-7, dan E-8 `CLOSED`** — E-7 (n8n & Outbox) ditutup dengan **MVP
scope, known limitations accepted**; **E-8 (Testing & Polish) `CLOSED — All Verification Gates
Passed (2026-11-28)`**: **227 unit + 95 integration + 3 Playwright (2 flow, dua run berturut-turut)
PASS**, lint 0/0, typecheck 0, build 26 route + Proxy; `KI-39` Resolved, `KI-40` tetap HOLD/post-MVP,
`KI-43`/`KI-44` diterima untuk MVP; order E2E `RML-HYEX0T` dan `RML-4R7EUW` `paid`; 0 migration,
1 devDependency (`@playwright/test`), 0 perubahan `src/**`, 0 perubahan CI/env; belum ada
commit/push (HEAD `d384e2c` + perubahan E-8 di working tree).**

---

## 3. Overall Progress

### 3.1 Phase progress

| Fase | Nama | Status | Bobot fase |
| --- | --- | --- | --- |
| E-0 | Planning | `COMPLETED` | 10% |
| E-1 | Documentation | `COMPLETED` | 10% |
| E-2 | Foundation | `COMPLETED` | 10% |
| E-3 | Schema & RLS | `CLOSED` | 12% |
| E-4 | Storefront & Seed | `CLOSED` | 12% |
| E-5 | Checkout, Payment & Idempotency | `CLOSED` | 18% |
| E-6 | Admin CMS | `CLOSED` | 12% |
| E-7 | n8n & Outbox | `CLOSED` | 8% |
| E-8 | Testing & Polish | `CLOSED` | 5% |
| E-9 | Final Verification & Submission | `NOT STARTED` | 3% |

**Progres berbobot: 97%** = E-0 (10%) + E-1 (10%) + E-2 (10%) + E-3 (12%) + E-4 (12%) +
E-5 (18%) + E-6 (12%) + E-7 (8%) + E-8 (5%). E-2a **bukan** fase berbobot (0%) — ia checkpoint
Git di dalam E-2. E-8 **`CLOSED`** (2026-11-28); E-9 tetap `NOT STARTED` (3% belum ditambahkan).

### 3.2 Artifact readiness

Angka "direncanakan" berasal dari dokumen yang sudah disetujui, bukan estimasi.

| Artefak | Terbangun | Direncanakan | Sumber |
| --- | --- | --- | --- |
| Dokumen proyek | **8** | 8 | `README.md` §Documentation map |
| Halaman / route UI | **13** | 13 | `docs/design-solution.md` §3 |
| Route handler API | **13** | 16 | `docs/api-contract.md` (2 endpoint JSON publik + 1 resend = sisa E-7/backlog) |
| Tabel database | **7** | 7 | `docs/database-design.md` §2 |
| SQL function | **5** | 5 | `docs/database-design.md` §5 |
| Integration eksternal | **1** | 1 | `docs/technical-decisions.md` ADR-8 (`countriesnow.space`, admin enrich) |
| Workflow n8n | **1** | 1 | `docs/technical-decisions.md` ADR-9 · artefak `n8n/order-paid-email.json` |
| Acceptance criteria verified | **37 penuh + 2 database-scope** (T7, T11) + 3 parsial (A1, E2, T12) / 42 | 42 | `docs/mvp-scope.md` §6 |
| Test (unit + integration + E2E) | **214 unit** (15 file) + **95 integration** (10 file) + smoke HTTP 27/27 + pagination 3 halaman/30 unik & 2 halaman; E2E manual M1–M4 user-attested | sesuai `mvp-scope` §7 | `docs/mvp-scope.md` §7 |
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
| `README.md` | `4fdea36e5466` |
| `AGENTS.md` | `738e98ada2ae` |
| `docs/api-contract.md` | `86779bccce20` |
| `docs/architecture.md` | `f72aa579bf77` |
| `docs/database-design.md` | `67f126c88185` |
| `docs/design-solution.md` | `26d80e4be74e` |
| `docs/mvp-scope.md` | `cee8bbb8725e` |
| `docs/technical-decisions.md` | `d526ccf29b5c` |

(Diperbarui 2026-11-28 setelah sinkronisasi kontrak E-6; nilai lama tercatat pada riwayat Git.)

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

### E-3 — Schema & RLS — `CLOSED`

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
- **Status:** `CLOSED` — terverifikasi lokal, ter-commit, dan ter-push.
- **Git:** commit `af53146` (database foundation) · `f4172e1` (admin client + integration tests) ·
  `7d18015` (docs) · push fast-forward `7c80675..7d18015` ke `origin/main` (2026-11-27).
  `origin/main` = `7d18015`; working tree bersih saat push; tanpa `--force`, tanpa amend, tanpa squash.
- **Verification result:** `db reset` ×2 bersih (6 migration, 5 destinasi, 15 paket, idempoten) ·
  **NV-01/NV-02 lulus** · **NV-03a lulus**: matriks privilege efektif sesuai desain (5 RPC hanya
  `service_role`, `is_admin()` hanya `authenticated` dan tetap `prosecdef = false`, 7 trigger function
  tidak dapat dieksekusi siapa pun, 0 grantee `PUBLIC`, matriks tabel 7/7 sesuai, RLS aktif 7/7, 7
  policy persis) · **NV-04 lulus**: 0 secret pada `supabase/**`, `package.json`, `.gitignore`;
  satu-satunya kunci adalah kunci demo Supabase lokal di `supabase/.temp/` (gitignored) ·
  **NV-05 lulus**: 21 deviasi dokumen (D-01…D-21) ditutup atau dicatat · `npm run lint` 0 error/0
  warning · `npm run typecheck` 0 error · `npm run test` 11/11 · `npm run test:int` **85/85** (8 file) ·
  AC: **9 penuh + 11 database-scope** (saat penutupan E-3). Sejak 2026-11-27, AC-E3 diverifikasi
  di E-4 sehingga hitungan kumulatif menjadi **10 penuh + 11 database-scope + 21 pending**.
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
  ADR-9, ADR-10 · `docs/api-contract.md` §4.3–§4.6 · `AGENTS.md` §Forbidden patterns · DL-24…DL-28

### E-4 — Storefront & Seed — `CLOSED`

- **Objective:** Storefront yang dapat dijelajahi end-to-end dengan data seed dan aset final.
  - *Catatan (2026-11-27):* rumusan di atas dipertahankan sebagai objective historis. Untuk MVP,
    lima foto destinasi yang tersedia **disetujui untuk penggunaan MVP**; **seleksi dan final
    approval aset ditunda ke post-MVP**. Persetujuan penggunaan MVP **bukan** final asset approval
    (lihat KI-01).
- **Tasks:**
  - [x] Layout store + homepage (hero + 5 kartu destinasi)
  - [x] `/destinations` + filter region `?region=Asia|Europe` (nilai dari database)
  - [x] `/destinations/[destinationSlug]` daftar paket + atribusi
  - [x] `/destinations/[destinationSlug]/packages/[packageSlug]` detail + CTA (D-01, D-05)
  - [x] Lima foto destinasi dipakai untuk MVP — **approved for MVP use**; seleksi aset final `DEFERRED` post-MVP (KI-01)
  - [x] Data seed dipakai apa adanya dengan URL & atribusi kandidat (tanpa perubahan seed)
- **Status:** `CLOSED` — 2026-11-27. Implementasi, verifikasi, dan commit lokal selesai.
  **Belum di-push**; push dilakukan manual oleh user.
- **Git (4 commit lokal):** `96b69b2` feat(e4) storefront + catalog module (24 file) ·
  `33d99f6` test(e4) catalog derivation & DTO (2 file) · `23f25b4` docs(e4) implementation &
  verification (4 file) · `docs(e4) close storefront phase` = commit ini (1 file, WORK_TRACKER saja).
- **Verification result:** lint 0/0 · typecheck 0 · unit 32/32 (11 E-2 + 21 baru) · build tanpa env
  hijau · semua route katalog `ƒ` (dynamic, D-07) · HTTP: `/`, `/destinations`, `?region=Asia` (4),
  `?region=Europe` (1), `?region=Mars` (empty), detail destinasi (3 paket: 89/145/249 k), detail
  paket (Rp 145.000, CTA `?destination=japan&package=japan-5gb-15d`) → 200 · **tiga skenario 404**
  (destinasi tak dikenal, paket tak dikenal, paket valid di destinasi salah) → 404 dengan copy 404
  yang sama (R-01) · `/_next/image` memakai optimizer untuk `upload.wikimedia.org` (remotePatterns
  aktif) · 0 UUID internal di HTML · 0 request `countriesnow.space` (AC-E3).
- **Optimasi gambar A″ (`next.config.ts`):** `deviceSizes = [640, 828, 1080, 1200]`,
  `imageSizes = [128, 256, 384]`, `minimumCacheTTL = 86400`. Pengukuran yang dilaporkan:
  variasi gambar **10 → 6**, kombinasi `(src,width)` **50 → 30**, WebP **±31–43 KB** dibanding
  sumber asli **±7,8 MB**. Angka tersebut hasil pengukuran pada sampel yang diuji, **bukan
  jaminan** ukuran untuk semua gambar.
- **Verifikasi manual — fallback gambar:** **PASS** — diuji dengan Chrome DevTools saat request
  gambar diblokir: panel `sand` + emoji + nama tampil, layout utuh, tanpa uncaught exception, dan
  gambar kembali setelah blocking dimatikan.
- **NFR8 (responsif 375/768/1280):** **PASS** berdasarkan pengujian pengguna.
- **NFR9 keyboard:** **PASS pada homepage** — navigasi keyboard mencapai header dan CTA,
  skip-to-content tersedia, dan focus indicator terlihat. Pengujian menyeluruh pada halaman
  katalog (`/destinations`, detail destinasi) dan detail paket **belum dikonfirmasi**, sehingga
  NFR9 keyboard **tidak** diklaim untuk seluruh storefront (KI-27).
- **`DEFERRED` (post-MVP):** NFR9 contrast ratio (belum diukur) dan seleksi aset final.
- **Blocker E-4:** **0**.
- **Risiko / item diterima (bukan blocker):** `KI-24` (CTA `/checkout` 404 sampai E-5) · `KI-25`
  (Wikimedia HTTP 429, eksternal, **tidak dihilangkan**) · `KI-26` (NFR9 contrast `DEFERRED`) ·
  `KI-27` (cakupan uji keyboard baru homepage).
- **Project-level blocker (bukan milik E-4):** `KI-04` — kanal notifikasi n8n belum dipilih, milik
  E-7; tidak menghalangi E-4.
- **Completion date:** 2026-11-27
- **Handoff ke E-5:** baseline commit = commit penutupan ini. Route tersedia: `/`,
  `/destinations` (`?region=`), `/destinations/[destinationSlug]`,
  `/destinations/[destinationSlug]/packages/[packageSlug]`. Kontrak CTA:
  `/checkout?destination=<destinationSlug>&package=<packageSlug>` (masih 404 — KI-24). E-5 perlu
  menambahkan `destinationSlug` pada body `POST /api/checkout` (gap kontrak, `docs/api-contract.md`
  §4.3) dan memakai lookup `(destinationSlug, packageSlug)` yang sama dengan
  `catalog.queries.getPackageByRoute`. E-3 tetap CLOSED: E-4 tidak mengubah skema/seed/RPC.
- **References:** `docs/design-solution.md` §3, §6, §8 · `docs/architecture.md` §5.1 ·
  `docs/mvp-scope.md` FR-C1…C4 · DL-27

**Backlog OPTIONAL pasca-MVP (tidak dikerjakan di E-4):** homepage how-it-works + trust strip ·
compare-at price display · breadcrumb (dipasang minimal) · `loading.tsx` skeleton · metadata per
halaman · dua public JSON endpoint · mobile sticky bottom bar · font self-hosted · sort/search
katalog · RTL/component test.

### E-5 — Checkout, Payment & Idempotency — `CLOSED`

- **Objective:** Alur checkout guest sampai status order final dengan pembayaran yang hanya
  berubah melalui verifikasi server dan idempotency yang tahan konkurensi.
- **Tasks:**
  - [x] `POST /api/checkout` (Zod strict, `Idempotency-Key`, `destinationSlug` wajib)
  - [x] Token capability 256-bit + hash di `orders` + sealed token pada idempotency (AES-256-GCM)
  - [x] Halaman `/mock-gateway/[ref]` (simulasi) + endpoint settle
  - [x] `POST /api/payments/verify` + `settle_payment`
  - [x] `GET /api/orders/[token]` + halaman order status `/orders/[token]`
  - [x] Header capability (`no-referrer`, `no-store`, `noindex`) + 0 third-party request
  - [x] Unit test (59 total) + smoke test HTTP 27/27 pada server produksi lokal
- **Status:** `CLOSED` — 2026-11-27. Implementasi, verifikasi, tiga commit, dan push selesai.
  `origin/main` = `220517c`.
- **Git (3 commit, ter-push):** `5fc02d6` feat(e5) guest checkout, mock payment & order status
  (19 file) · `5565b5b` test(e5) token/schema/hash (3 file) · `220517c` docs(e5) implementation &
  verification (3 file) · push fast-forward `dcbd315..220517c` ke `origin/main`, tanpa force.
- **Verification result:** lint 0/0 · typecheck 0 · unit **59/59** · build produksi hijau
  (12 route) · **smoke HTTP 27/27 PASS**: 201 created · replay 200 dengan `capabilityUrl`
  identik · key sama + payload beda → 409 conflict · tanpa header → 400 · `price`/qty 6/email
  invalid/pair tidak dikenal → 422/409 · **10 paralel = 1×201 + 9×200, satu order** · mock settle
  tidak mengubah order/payment (AC-P6) · verify → paid · verify kedua → 409
  `PAYMENT_ALREADY_FINAL` · failed → order & payment failed + copy “Start a new order” ·
  pending → tanpa perubahan · ref milik order lain → 404 · 404 seragam (token salah vs
  malformed) · header `no-referrer`/`no-store`/`noindex` pada halaman order · 0 pola token dan 0
  `Idempotency` pada log server · gate `MOCK_GATEWAY_ENABLED=false` → **404** (halaman + API).
- **Tidak dijalankan (bukan blocker):** AC-T7 pada lapisan HTTP (replay > 24 jam) — sudah
  diverifikasi di lapisan RPC pada E-3; dispatch outbox/n8n tetap E-7 (E-5 hanya membuat baris
  outbox di dalam transaksi `settle_payment`).
- **Blockers / risks:** **Blocker E-5: 0.** `KI-24` tertutup. `KI-25` (429) tetap risiko
  eksternal E-4. `KI-04` tetap project-level milik E-7.
- **Completion date:** 2026-11-27
- **Handoff ke E-6:** baseline commit = commit penutupan ini (di atas `220517c`). Tersedia:
  storefront (`/`, `/destinations`, detail destinasi & paket), `/checkout`,
  `POST /api/checkout`, `POST /api/payments/verify`, `POST /api/mock-gateway/[ref]/settle`,
  `GET /api/orders/[token]`, `/orders/[token]`, `/mock-gateway/[ref]`. E-6 memakai fondasi yang
  sudah ada: `requireAdmin()` + `src/proxy.ts` + RLS `is_admin()` (E-3) + `createAdminClient()`.
  E-6 **tidak** perlu mengubah skema, RPC, atau kontrak E-5. E-3 tetap `CLOSED`.
- **Penyempurnaan pasca-penutupan (2026-11-27, 3 commit):** seluruhnya di atas `220517c`,
  sudah diverifikasi, dan tidak mengubah API/DB/RPC. E-5 tetap `CLOSED`.
  - **Checkout Validation UX** — `src/modules/orders/schemas.ts` memakai pesan customer-friendly
    dan constraint yang sama untuk client/server; `checkout-form.tsx` menjalankan
    `checkoutRequestSchema` sebelum request, menampilkan error per field, dan memisahkan input
    telepon (`+` tetap). Test: 30 test schema; gate lint/typecheck/unit PASS.
  - **Checkout Session Reuse & Storage Fallback** — modul baru `src/modules/orders/checkout-key.ts`
    (138 baris) mengelola satu key per checkout attempt: retry memakai key yang sama, 409 melepas
    key, key dilepas setelah navigasi sukses. `sessionStorage` gagal/blocked → fallback `Map`
    in-memory selama page load. Test: 18 test. Kontrak: `docs/api-contract.md` §6.
  - **GAP-1 — Mock Gateway settle → payment verify** — pengujian E2E manual menemukan UI tidak
    pernah memanggil `POST /api/payments/verify` setelah gateway mencatat outcome, sehingga
    order/payment tetap `pending`. Diperbaiki dengan **1 file** (client component
    `mock-gateway-controls.tsx`): gateway kini memanggil verify setelah settle, dengan penanganan
    200 / 409 `PAYMENT_ALREADY_FINAL` / 404 / 5xx-network; outcome tetap dibaca backend dari
    `mock_gateway_transactions`. Verifikasi: T1 success → paid · T2 failed → failed · T3 pending →
    tetap pending · T4 refresh stabil · T5 pengulangan → 409 + outcome pertama berlaku, tanpa
    payment/outbox ganda · T6 ref lintas order → 404 · T7 smoke regresi **27/27** · T8 integritas
    DB semua 0.
- **Verifikasi final pasca-penutupan (2026-11-27):** unit **95/95** (7 file) · lint 0 ·
  typecheck 0 · production build **PASS** (12 route) · smoke HTTP **27/27** · DB integrity
  **7×0** · working tree sebelum commit **8 path** (6 modified + 2 untracked), staged 0.
  Bukti M1–M4: **PASS berdasarkan konfirmasi user (user-attested)**; tidak ada artefak
  berlabel, screenshot, atau laporan Playwright — Playwright dijadwalkan E-8.
- **Keputusan AC-9 (2026-11-27):** target 96 unit test adalah estimasi, bukan syarat wajib.
  Permission eksplisit menyatakan target “disesuaikan dengan jumlah test aktual”; hasil akhir
  **95/95 PASS** diterima dan tidak ada test yang ditambahkan hanya untuk mengejar angka 96.
- **References:** `docs/api-contract.md` §4.3–§4.6, §6 · `docs/database-design.md` §5.1–§5.2 ·
  `docs/mvp-scope.md` §6.1–§6.2, §6.4 · `docs/technical-decisions.md` ADR-5, ADR-6, ADR-7, ADR-10

### E-6 — Admin CMS — `CLOSED`

- **Objective:** Admin dapat mengelola katalog dan memantau order/payment dengan filter
  server-side.
- **Tasks:**
  - [x] Login/logout (Supabase Auth, Server Action) + seed admin (`scripts/seed-admin.mjs`, idempoten, `app_metadata`)
  - [x] `requireAdmin()` di dashboard layout + `adminGuard()` di **setiap** route handler admin + guard `proxy.ts`
  - [x] CRUD destinasi + aksi "Fill from API" (`countriesnow.space`, advisory, tanpa write)
  - [x] CRUD paket (validasi harga/validity + CHECK lintas kolom pada baris hasil merge)
  - [x] Daftar order: 24h/7d/30d, status, search (order number/email), keyset 10 baris
  - [x] Daftar payment: filter range/status setara
  - [x] Overview (3 angka + 5 order terbaru)
- **Status:** `CLOSED` (2026-11-28). Kode `IMPLEMENTED`, verifikasi `VERIFIED` untuk lingkup E-6;
  **AC-A1 dan AC-E2 tetap `Partially Verified`** dan dijadwalkan pada E-8 (uji browser & jalur 503).
- **Alasan closure:** seluruh AC E-6 yang dapat diuji sudah berlukti (AC-A2/A3/A4/A5/A6/A7, AC-E1,
  FR-A2, FR-A5, NFR3); 0 P0/P1 terbuka (`KI-35` Resolved); gate statis (lint/typecheck/unit/build)
  dan `test:int` hijau; kontrak API sinkron; sisa item P2/P3 tercatat di §6.
- **Verification result (2026-11-28, benar-benar dijalankan):**
  - **Gate 1–2 (lingkungan):** Docker sudah berjalan; `npx supabase start` exit 0 **tanpa reset**;
    6/6 migration terpasang; seed utuh (5 destinasi aktif / 15 paket aktif); `db:seed-admin`
    idempoten → "admin ensured (updated) …, password unchanged", role `admin`, email terkonfirmasi,
    tanpa secret di log.
  - **Gate 3–4 (integration):** fixture R-3 diperbaiki (pasangan fixture tetap `admin-fixture-order-*`
    + pasangan acak yang dihapus; seed tidak disentuh). `npm run test:int` → **88/88 PASS** (9 file),
    termasuk 3 assertion baru: `23503` destinasi ber-paket, `23503` paket ber-order, `23505` slug duplikat.
    Jumlah katalog aktif tetap 5/15 setelah suite.
  - **Gate 5 (walkthrough HTTP dengan cookie sesi nyata dari Supabase Auth):**
    tanpa sesi → `401`; sesi `member` → `403 FORBIDDEN` pada API dan panel “Access denied” (200) pada
    halaman; sesi `admin` → 200 pada API dan halaman. CRUD: create 201, duplicate slug
    `409 UNIQUE_VIOLATION`, PATCH 200, delete destinasi ber-paket `409 DESTINATION_IN_USE`,
    delete paket/pdestinasi bebas 204, `destinationId` tidak ada → `422` field-level, `isUnlimited`
    + `dataMb` → `422`, `validityDays=91` → `422`. AC-A4: paket aktif muncul di halaman destinasi
    (link + Rp 99.000) dan detail 200 berisi nama; setelah nonaktif → 0 link dan detail 404.
    AC-A7: halaman orders memuat 20 timestamp WIB (contoh `28 Nov 2026, 11.39`) dan **0** ISO mentah;
    payments 32 timestamp WIB. AC-E1: enrich `Japan` → 200 `JP`/`JPY`/emoji/`countriesnow` tanpa
    perubahan jumlah baris; negara tak dikenal → `404`; input kosong → `422`.
  - **Gate 6 (dokumen):** `docs/api-contract.md` disinkronkan (+38/−12): 2 kode error baru, aturan
    bentuk `q` → 422, cursor `base64url`, respons `{ data }`, catatan guard/`400` id, status header.
  - **Gate 7 (statis):** `lint` 0/0 · `typecheck` 0 · `unit 158/158` (12 file). Build tidak dijalankan
    ulang karena `src/**` tidak berubah sejak build PASS sebelumnya.
  - **Gate 8 — perbaikan `KI-35` (`PERM-FIX-1`, 2026-11-28, 4 file):** `src/lib/admin-list.ts`
    (pola ISO menerima `±HH:MM`, fungsi `toUtcInstant()` menormalkan ke `…Z` + menolak instant mustahil,
    fungsi `keysetFilter()` mengutip nilai), `src/modules/orders/admin-queries.ts`,
    `src/modules/payments/admin-queries.ts`, `tests/unit/admin-list.test.ts`.
    Bukti sesudah perbaikan (build baru + sesi admin nyata):
    - unit **167/167 PASS** (12 file; `admin-list` 24 kasus, +9 untuk `KI-35`), `typecheck` 0, `lint` 0/0;
    - `npm run build` **PASS** 26 route;
    - orders API hal. 1/2/3 = **200/200/200**, 10 baris per halaman, overlap **0**, 30 id unik,
      urutan `createdAt` menurun; payments hal. 1/2/3 = 200, 10 baris, overlap **0**;
    - UI “Next page” orders & payments: halaman 2 **tanpa** alert “filters are invalid”, 10 baris,
      tautan “First page” hadir; overlap `<tbody>` = **0** (orders 10/10/10, payments 10/10);
      halaman 2 payments memuat 28 timestamp WIB dan 0 ISO mentah;
    - `npm run test:int` **88/88 PASS** (9 file).
  - **Belum dijalankan:** interaksi form di browser (login form, submit form, keyboard/visual), dan
    AC-E2 jalur `503` (upstream tidak bisa dipaksa gagal tanpa memblokir jaringan) — keduanya
    dijadwalkan pada **E-8** (Playwright + uji jaringan).
- **Blockers / risks:** **0 blocker E-6.** `KI-35` **Resolved** 2026-11-28 (lihat Gate 8); `KI-33`,
  `KI-29`, `KI-30`, `KI-24`, `KI-20` Resolved. Sisa item bukan blocker: AC-A1 & AC-E2 parsial (uji
  browser/503 → E-8), `KI-04` milik E-7, `KI-36`/`KI-37`/`KI-38` (P3, diterima).
  **Status fase: `CLOSED` (2026-11-28) — dengan 2 AC `Partially Verified` yang dialihkan ke E-8.**
- **Completion date:** 2026-11-28
- **References:** `docs/api-contract.md` §5 · `docs/mvp-scope.md` §6.3 · `AGENTS.md` §Forbidden patterns ·
  `src/modules/auth/guard.ts` · `src/lib/admin-list.ts` · `src/modules/orders/admin-search.ts`

### E-7 — n8n & Outbox — `CLOSED`

- **Objective:** Notifikasi order-paid terkirim melalui satu workflow n8n, dengan dispatch
  yang aman terhadap konkurensi dan kegagalan.
- **Tasks:**
  - [x] Workflow n8n (artefak `n8n/order-paid-email.json`): webhook + Header Auth `X-Webhook-Secret` + compose + SMTP
  - [x] `dispatchForOrder` (claim → payload → kirim → fenced finish), timeout 10 s, retry 1× (transient saja)
  - [x] Pemanggilan `after()` pada jalur verify (hanya setelah `settled`, orderId internal)
  - [x] Aksi admin "Resend notification" (endpoint §5.6 + tombol di daftar order)
  - [x] Integration test dispatch paralel, kegagalan, ceiling, payload invalid, resend guard
  - [x] **A2** — `canResendNotification` dihitung server (`resendEligibility`), tombol Resend mengikuti aturan backend
  - [x] **B1** — format WIB deterministik (UTC+7, tanpa `Intl`/`toLocaleString`/ICU) di Code node n8n
  - [x] Bukti email terkirim — **MT-1 PASS** (Mailpit lokal): 1 email, subject `Roamly order RML-6FDC6C confirmed`, `Rp 145.000`, `28 Nov 2026, 18:03 WIB`, `Reference` = outbox id
- **Status:** `CLOSED` (2026-11-28) — **MVP scope, known limitations accepted**.
  Kode `CODE COMPLETE — HAPPY PATH VERIFIED`; penutupan disetujui pemilik dengan catatan bahwa
  fase ini **bukan** pernyataan bahwa seluruh failure-path production telah diuji.
- **Closure notes (2026-11-28, keputusan pemilik):** MT-1 **PASS** · MT-2A **PASS** ·
  MT-2B **SKIPPED/DEFERRED** · MT-3 **tidak diuji manual** (unit coverage tersedia) ·
  MT-4 **HOLD/DEFERRED** · MT-6 **PASS** · Final Verification **PASS**. Penerimaan ini berlaku
  untuk kebutuhan MVP dan demonstrasi; batas cakupan (MT-2B, MT-3 manual, MT-4, dan jalur HTTP
  `409 NOTIFICATION_IN_FLIGHT` pada T12) tetap tercatat dan **tidak** dinaikkan menjadi PASS.
- **Verification result (2026-11-28, benar-benar dijalankan):**
  - `npm run test` **227/227 PASS** (16 file; 167 pra-E-7 + 60 baru: `automation-payload` 8,
    `automation-n8n-client` 12, `automation-dispatch` 27, `n8n-workflow` 13).
  - `npm run test:int` **95/95 PASS** (10 file; 88 pra-E-7 + `notification-dispatch` 7).
  - `lint` 0/0 · `typecheck` 0 · `build` PASS (26 route).
  - Bukti integrasi: settlement sukses → outbox → dispatch `sent` (`attempts=1`, `sent_at` terisi);
    2 dispatch paralel = **1 kirim** (`none` untuk yang kalah); n8n gagal → outbox `failed`
    `last_error=n8n_http_503` **dan order tetap `paid`**; resend `already_sent`/`in_flight`/
    `max_attempts` tanpa pengiriman; payload invalid setelah claim di-finish `invalid_payload`
    (tidak tertinggal `processing`); `locked_at` diteruskan verbatim (string, bukan Date).
  - **A2:** `resendEligibility()` menjadi satu-satunya aturan (dipakai endpoint + daftar admin);
    unit test membuktikan order belum paid, `sent`, lease aktif, lease kedaluwarsa, attempts tepat 5,
    dan relasi null; `attempts`/`locked_at` **tidak** diekspos di response, hanya boolean.
  - **B1:** workflow JSON valid; Code node dieksekusi statis dengan `$input` tiruan — **24/24 PASS**
    (WIB normal, rollover hari/bulan/tahun, kabisat, penolakan `paidAt` non-kanonik, event salah,
    field kosong, `orderNumber`/`totalIdr` invalid, escaping HTML, tanpa `Intl`/`toLocaleString`).
  - 0 migration · 0 perubahan RPC/trigger/constraint/RLS/grant · 0 dependency · 0 env baru.
- **Final verification (MT, 2026-11-28) — kode `CODE COMPLETE — HAPPY PATH VERIFIED`:**
  | Test | Hasil | Bukti |
  | --- | --- | --- |
  | **MT-1** happy path | **PASS** | order `RML-6FDC6C` `paid` · payment `succeeded` · outbox `sent` (`attempts=3`) · 1 eksekusi n8n `success` pada versi `4dd2ba94` · 1 email Mailpit, konten 13/13 PASS |
  | **MT-2A** invalid Header Auth | **PASS** | production URL + secret salah → **403** `Authorization data is wrong!`; 0 eksekusi, 0 email, 0 perubahan DB |
  | **MT-2B** backend secret mismatch | **SKIPPED** | butuh ubah `.env.local`/restart duakali atau file test sementara → di luar batas; aturan 4xx-tanpa-retry sudah diuji unit (`automation-n8n-client` “stops at the first 4xx”) |
  | **MT-3** invalid payload | **NOT MANUALLY TESTED** | validasi payload diuji unit (13 kasus `n8n-workflow`) + `automation-payload`; jalur HTTP belum dijalankan manual |
  | **MT-4** SMTP failure | **HOLD** | tidak dijalankan (butuh SMTP sengaja salah); kegagalan-notifikasi-tidak-mengubah-order dibuktikan MT-1 (500) + integration test |
  | **MT-6** duplicate resend protection | **PASS** | resend pada order `sent` → **202** `{"status":"skipped","reason":"none_claimable"}`; `attempts` tetap 3, `sent_at` identik, 0 eksekusi, 0 email |
  | Final verification (source/DB/n8n/docs) | **PASS** | strict payload + wire event; `claim_outbox`/`finish_outbox` grants hanya `service_role` dan **0** write grant tabel; 1 workflow `active`, published = draft = hash `8da22812`, 0 credential tertanam; dokumentasi menyebut at-least-once & `after()` bukan queue |
- **Known limitations (E-7):** (1) delivery **at-least-once**, bukan exactly-once; (2) `after()` bukan
  durable queue; (3) `sent` = provider/SMTP **accepted**, bukan inbox delivery; (4) `attempts` maksimum
  **5** (baris di ceiling = terminal untuk dispatch, pemulihan lewat runbook operator); (5) **tidak ada**
  scheduler/backoff otomatis — retry hanya 1× dalam claim + resend admin; (6) **MT-2B dan MT-4 belum
  diverifikasi manual**; (7) Mailpit adalah SMTP lokal — **bukan** bukti pengiriman email publik.
- **Blockers / risks:** tidak ada blocker kode. `KI-41` **Verified (local Mailpit)**; `KI-42`
  **Partially resolved** (prosedur import tidak diuji; sinkronisasi via UI + Publish diverifikasi lewat
  `activeVersionId`/`workflowVersionId`). `KI-06` at-least-once/duplikat diterima dan didokumentasikan.
- **Completion date:** 2026-11-28
- **References:** `docs/technical-decisions.md` ADR-9 · `docs/database-design.md` §2.6, §5.3–§5.4 ·
  `docs/api-contract.md` §5.6, §7 · `docs/mvp-scope.md` §6.4 · `src/modules/automation/*`

### E-8 — Testing & Polish — `CLOSED`

**CLOSED — All Verification Gates Passed (2026-11-28)** · MVP scope, known limitations accepted.

- **Objective:** Seluruh aturan bisnis berisiko terbukti lulus dan UI rapi di tiga breakpoint.
- **Tasks:**
  - [x] Vitest unit lengkap — **227/227 PASS** (16 file), tidak ada test lama diubah
  - [x] Vitest integration lengkap (constraint, idempotency, RLS, outbox) — **95/95 PASS** (10 file) pada stack lokal `travelConnectivityStore`
  - [x] Playwright 2 flow utama — `tests/e2e/customer-checkout.spec.ts` + `tests/e2e/admin-package.spec.ts`, **3/3 PASS**
  - [x] Assertion responsive otomatis terbatas — guest checkout 390×844: `scrollWidth - clientWidth = 0`, tombol Pay ≥ 44 px dan berada di dalam viewport
  - [ ] Manual pass responsive 375 / 768 / 1280 — **belum** dijalankan penuh (hanya 390×844 otomatis + inspeksi kelas CSS)
  - [ ] Verifikasi acceptance criteria (target: seluruh 42) — AC-A1 kini **Verified** lewat E2E; AC-E2 tetap parsial (`KI-40`); sisanya tidak berubah
  - [ ] Aksesibilitas dasar (fokus, kontras, keyboard) — `KI-26`/`KI-27` tetap **post-MVP** (keputusan pemilik)
- **Status:** `CLOSED` (2026-11-28) — seluruh gate verifikasi lulus; item yang tidak dikerjakan dicatat eksplisit sebagai post-MVP/HOLD di bawah
- **Verification result:** (2026-11-28) lint **0/0** · typecheck **0** · unit **227/227** · integration **95/95** · Playwright **3/3 pada dua run berturut-turut** (24.9 s lalu 21.7 s) · build **26 route + Proxy**. E2E customer menghasilkan order `RML-HYEX0T` dan `RML-4R7EUW` (keduanya `paid`, total `89000`, harga dari server) tanpa mengekspos capability token; E2E admin memverifikasi pesan gagal generik, create, edit harga `Rp 123.000 → Rp 130.000`, lalu menghapus **hanya** fixture `e2e-fixture-*` (query DB: **0 sisa** pada kedua run). Login gagal tercatat sebagai `admin login rejected {"reason":"invalid_credentials"}` (tanpa email/password).
- **Blockers / risks:** `KI-10` waktu · E2E memerlukan Docker + stack lokal + `MOCK_GATEWAY_ENABLED=true` · setiap run customer menambah satu baris `orders` permanen (`KI-44`) · trace retry memuat capability URL dan hanya tersimpan lokal (`test-results/`, gitignored).
- **Catatan operasional:** Docker Desktop + stack Supabase lokal dihentikan secara normal (`npx supabase stop`) bila tidak digunakan. **Jangan** menjalankan `db reset`, menghapus volume, atau menghapus dua order E2E — keduanya adalah bukti pengujian E-8.
- **Completion date:** 2026-11-28
- **References:** `docs/mvp-scope.md` §6, §8 · `docs/technical-decisions.md` ADR-11 · `playwright.config.ts`

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
| DL-27 | 2026-11-27 | Lima `REVOKE ALL ON FUNCTION … FROM public, anon, authenticated, service_role` ditambahkan di migration 0006 sebelum `GRANT EXECUTE … TO service_role` (hardening D-14, hasil akhir tidak bergantung `api.auto_expose_new_tables`) | Implemented + Verified | `supabase/migrations/20261126090006_rls.sql` · `tests/integration/admin/privileges.test.ts` |
| DL-28 | 2026-11-27 | `claim_outbox` menyapu baris `processing` dengan `attempts >= 5` dan lease kedaluwarsa menjadi `failed` (`lease_expired_after_max_attempts`) sebelum klaim; tanpa field tambahan di respons | Implemented + Verified | `supabase/migrations/20261126090005_functions.sql` · ADR-9 · `tests/integration/outbox.test.ts` |
| DL-24 | 2026-11-27 | `locked_at` diperlakukan sebagai opaque fencing token string; dilarang dikonversi ke `Date` | Implemented + Verified | DB §5.3–§5.4 · `tests/integration/outbox.test.ts`, `support/assert.ts` |
| DL-25 | 2026-11-27 | `.env.test` dimuat dengan parser eksplisit + penolakan konflik (bukan `process.loadEnvFile`, yang tidak menimpa env yang sudah ada) dan guard loopback wajib | Implemented + Verified | `tests/integration/support/env.ts`, `global-setup.ts` · `meta.test.ts` |
| DL-26 | 2026-11-27 | Penutupan Git E-3 dalam tiga commit terpisah (database · test · docs) lalu push fast-forward ke `origin/main`; tanpa amend, squash, atau force | Implemented + Verified | `af53146`, `f4172e1`, `7d18015` · `7c80675..7d18015` |
| DL-27 | 2026-11-27 | Paket dialamatkan dengan **dua slug** (`/destinations/[destinationSlug]/packages/[packageSlug]`) sehingga `UNIQUE (destination_id, slug)` menjadi penentu, tanpa perubahan skema (D-01) | Implemented | `src/app/(storefront)/destinations/[destinationSlug]/packages/[packageSlug]/page.tsx` · `src/modules/catalog/queries.ts` |
| DL-22 | 2026-11-26 | `settle_payment` hanya `succeeded`/`failed`; `record_mock_settlement` menerima 3 outcome (`pending` boleh naik ke terminal, terminal immutable) | Approved (desain) | DB §5.2, §5.5 · API §4.5 |
| DL-23 | 2026-11-26 | `orders.package_data_snapshot` (turunan deterministik), kardinalitas order→payment **at most one**, pencarian admin **exact match** | Approved (desain) | DB §1, §2.2, §2.3 · API §5.4 |
| DL-29 | 2026-11-28 | Pencarian admin memakai **parser bentuk tertutup** (`RML-[A-Z0-9]{6}` atau email) lalu satu `.eq(kolom, nilai)`; tidak ada `or=()` dari teks user. Cursor keyset divalidasi ulang (ISO instant + UUID) sebelum interpolasi. | Implemented + Verified (unit) | `src/modules/orders/admin-search.ts` · `src/lib/admin-list.ts` · `tests/unit/admin-search.test.ts`, `tests/unit/admin-list.test.ts` |
| DL-30 | 2026-11-28 | Seluruh baca/tulis CMS memakai **client authenticated** (RLS `is_admin()`), bukan service role; service role hanya dipakai jalur guest/E-5 yang sudah ada | Implemented | `src/modules/catalog/admin-{queries,mutations}.ts` · `src/modules/{orders,payments}/admin-queries.ts` |
| DL-31 | 2026-11-28 | **E-8 lean scope**: 1 E2E customer + 1 E2E admin + 1 assertion mobile, tanpa memperluas CI, tanpa migration, tanpa refactor `src/**`; `@playwright/test@1.65.1` dipin sebagai devDependency (sama dengan versi di README) | Approved + Implemented | `playwright.config.ts` · `tests/e2e/**` · `package.json` |
| DL-32 | 2026-11-28 | Fixture admin E2E direplikasi (`tests/e2e/support/admin-fixture.ts` + `support/env.ts`) daripada mengimpor helper integration, karena batas `server-only` dan perbedaan modul ESM/CJS; guard local-stack (loopback, port 54421) dipertahankan | Implemented + Verified | `tests/e2e/global-setup.ts` · `KI-43` |

---

## 6. Known Issues

| ID | Isu | Severity | Jenis | Blokir fase | Next step |
| --- | --- | --- | --- | --- | --- |
| KI-01 | Aset destinasi: lima foto yang dipakai **approved for MVP use**; seleksi aset final ditunda | Low | **Diterima untuk MVP** (2026-11-27) | — | Final asset selection = post-MVP; atribusi tetap tampil di halaman detail destinasi |
| KI-02 | Supabase CLI belum terpasang (Docker 29.9.2 tersedia) | Medium | **Resolved** (2026-11-27) | — | CLI 3.4.0 dijalankan via `npx`; belum dipin sebagai devDependency (keputusan terpisah) |
| KI-03 | Dependency di-install | Medium | **Resolved** (2026-11-26) | — | 397 paket terpasang, lockfile v3, commit `7ed8371` |
| KI-04 | Kanal pengiriman n8n belum dipilih (asumsi A4) | Low | **Resolved** (2026-11-28) | — | Keputusan pemilik: **email** dikirim oleh n8n via node SMTP; tidak ada kanal lain di MVP |
| KI-05 | Order `pending` tanpa auto-expiry | Low | Diterima | — | Terdokumentasi di README §Limitations |
| KI-06 | Notifikasi at-least-once, duplikat mungkin | Low | Diterima | — | `notificationId` untuk dedup penerima |
| KI-07 | Access log infrastruktur mencatat path capability | Low | Diterima | — | Mitigasi header + 0 third-party (ADR-10) |
| KI-08 | Tanpa analytics / error monitoring | Low | Diterima | — | Aturan larangan di `AGENTS.md` |
| KI-09 | Git belum diinisialisasi | Low | **Resolved** (2026-11-26) | — | Repo terinisialisasi; 2 commit, `origin/main` sinkron |
| KI-10 | Sisa waktu ±3 hari untuk 8 fase implementasi | High | Risiko | E-8, E-9 | Cut-line + buffer submit |
| KI-19 | `src/lib/supabase/admin.ts` belum dibuat (deferred/open) | Low | **Resolved** (2026-11-27) | — | Dibuat di E-3: `server-only`, tanpa `next/server`, timeout `AbortSignal` inline |
| KI-20 | `/admin/login` belum ada → halaman tujuan redirect masih 404 | Low | **Resolved** (2026-11-28) | — | Halaman `/admin/login` + Server Action `signInAction` dibuat di E-6; `/admin` tanpa sesi → 307 ke login (terbukti HTTP) |
| KI-21 | `eslint@9.39.5` memunculkan peringatan EOL saat install | Low | **Diterima (warning)** | — | Pantau; naikkan hanya bila seluruh plugin mendukung |
| KI-22 | Baris outbox `failed` + `attempts = 5` bersifat terminal untuk dispatch; pemulihan hanya lewat runbook operator (bukan jalur aplikasi) | Low | **Diterima** (2026-11-27) | E-7 | Didokumentasikan di ADR-9 §Recovery dan DB §5.3 |
| KI-23 | `claim_outbox` mengembalikan `locked_at` sebagai string ISO; konversi ke `Date` memutus fencing | Medium | **Dimigasi** (2026-11-27) | E-7 | Dijaga assert `assertOpaqueFencingToken` + TP-2/TP-4 di `tests/integration/outbox.test.ts` |
| KI-24 | CTA detail paket menuju `/checkout?destination=…&package=…` | Low | **Resolved** (2026-11-27) | — | Ditutup E-5: halaman `/checkout` dan `POST /api/checkout` sudah ada |
| KI-25 | Sumber gambar eksternal (Wikimedia Commons) dapat membalas **HTTP 429** secara intermiten (`retry-after: 600`, rate limit per-IP) | Medium | **Diterima — risiko eksternal** (2026-11-27) | — | Mitigasi: A″ (`deviceSizes`/`imageSizes` dipersempit, `minimumCacheTTL` 86400) + fallback `onError` yang terverifikasi. **Risiko tidak dihilangkan** |
| KI-26 | NFR9 contrast ratio belum diaudit terukur (≥ 4.5:1) | Low | **`DEFERRED` — post-MVP** (2026-11-27) | — | Ukur saat polish; token warna sudah ditetapkan di `src/app/globals.css` |
| KI-27 | NFR9 keyboard baru diuji pada **homepage** (header, CTA, skip-to-content, focus indicator); halaman katalog dan detail paket belum dikonfirmasi | Low | **Terbuka** (2026-11-27) | — | Uji keyboard pada `/destinations` serta detail destinasi/paket sebelum mengklaim NFR9 untuk seluruh storefront |
| KI-28 | **GAP-1**: UI tidak memanggil `POST /api/payments/verify` setelah gateway mencatat outcome → order/payment tetap `pending` | Medium | **Resolved** (2026-11-27) | — | Ditutup dengan 1 file (`mock-gateway-controls.tsx`): settle → verify → redirect; T1–T8 lulus |
| KI-29 | **Kontrak belum disinkronkan**: `UNIQUE_VIOLATION` (409) dan `PACKAGE_IN_USE` (409) ditambahkan di `src/lib/http.ts`, aturan bentuk `q` → 422, tetapi `docs/api-contract.md` §2/§5.2/§5.4 dikecualikan dari otorisasi E-6 | Medium | **Resolved** (2026-11-28) | — | Disinkronkan via `PERM-DOC-1`: +38/−12 baris, 2 kode error, aturan bentuk `q`, cursor `base64url`, respons `{ data }`, catatan guard/400 |
| KI-30 | Cursor admin memakai **base64url**, bukan base64 polos seperti tertulis di §5.4 (`+`/`/` tidak aman di query string) | Low | **Resolved** (2026-11-28) | — | Didokumentasikan di §5.4 saat `PERM-DOC-1`; klien memperlakukannya sebagai opaque |
| KI-31 | Pagination admin hanya "Next page" + "First page" (tidak ada tombol "Previous" keyset) | Low | **Diterima** (2026-11-28) | — | AC-A5 terpenuhi (10 baris, filter server-side); "Previous" = P3 post-MVP |
| KI-32 | Sidebar admin menjadi strip navigasi horizontal `<lg`, bukan drawer seperti `design-solution` §6 | Low | **Diterima** (2026-11-28) | — | Tanpa JavaScript tambahan; drawer = polish E-8 |
| KI-33 | **Gate verifikasi E-6**: Docker/Supabase lokal belum berjalan → `test:int` (termasuk 3 assertion E-6), `db:seed-admin`, login nyata, CRUD lewat sesi, filter/keyset berisi data, dan ACL enrich belum dijalankan | High | **Resolved** (2026-11-28) | — | Gate 1–7 dijalankan: `supabase start` tanpa reset, seed idempoten, `test:int` 88/88, walkthrough HTTP ber-sesi nyata. Temuan baru → `KI-35` |
| KI-35 | **P1 — pagination keyset halaman ≥ 2 gagal.** Cursor yang diterbitkan server berisi `createdAt` ber-offset `+00:00` (format PostgREST), tetapi `ISO_INSTANT_PATTERN` di `src/lib/admin-list.ts` hanya menerima akhiran `Z`, sehingga `decodeCursor()` menolak cursor milik server sendiri: `GET /api/admin/orders?cursor=…` → **422**, `GET /api/admin/payments?cursor=…` → **422**, dan halaman `/admin/orders` halaman 2 menampilkan alert “filters are invalid”. Halaman 1 benar (10 baris + `nextCursor`). | **P1** | **Resolved** (2026-11-28) | — | Rekomendasi perbaikan minimal (butuh izin): terima offset `±HH:MM` di pola validasi **dan** kutip nilai `createdAt` (`"…"`) saat menyusun filter `or(created_at.lt.“…”,and(created_at.eq.“…”,id.lt.…))`; tambah 2 kasus unit (offset `+00:00` diterima, tamper tetap ditolak). **Resolusi (PERM-FIX-1, 4 file):** pola ISO menerima `±HH:MM`; `toUtcInstant()` menormalkan ke `…Z` (presisi mikrodetik) dan menolak instant mustahil; `keysetFilter()` mengutip kedua nilai pada `or(…)`. Bukti: unit **167/167** (`admin-list` 24 kasus), orders API hal. 1/2/3 = **200/200/200** dengan **30 id unik, overlap 0**, payments hal. 1/2/3 = 200 dengan **overlap 0**, UI halaman 2 tanpa alert, `test:int` **88/88**, build **26 route**. |
| KI-34 | Copy UI admin berbahasa Inggris (mengikuti copy storefront), bukan Indonesia | Low | **Diterima** (2026-11-28) | — | Konsisten dengan bahasa UI aplikasi; tidak ada permintaan lokalisasi admin |
| KI-36 | `GET /api/admin/destinations` dan `GET /api/admin/packages` menjawab `405` tanpa sesi (resolusi method Next sebelum handler); tidak membocorkan data — list memang bukan endpoint | Low | **Diterima** (2026-11-28) | — | Tanpa aksi; kontrak §5 hanya mendefinisikan mutasi + list order/payment |
| KI-37 | Satu pasangan fixture non-aktif (`fk-ord-dest-*`/`fk-ord-pkg-*`) dari run uji pertama tetap ada karena order-nya permanen (deferred I2 trigger + `ON DELETE RESTRICT`) | Low | **Diterima** (2026-11-28) | — | Tidak memengaruhi katalog aktif (5/15) maupun AC; fixture baru memakai slug tetap `admin-fixture-*` |
| KI-38 | `enrich` memperlakukan `error: true` dari upstream sebagai `404`, bukan `503 ENRICHMENT_UNAVAILABLE` | Low | **Diterima** (2026-11-28) | E-8 | Semantik tidak ideal, tidak menghambat AC-E1; diperbaiki bersama uji jalur `503` |
| KI-39 | **AC-A1 parsial:** login admin dengan akun seed terbukti (sesi nyata `role=admin`), tetapi interaksi form login di browser (submit, pesan error generik, logout) belum diuji otomatis | Low | **Resolved** (2026-11-28) | — | Ditutup E-8: E2E admin menguji submit dengan kredensial salah → `Wrong email or password.` (satu pesan generik, tanpa probing akun), lalu login fixture `admin@roamly.test` → `/admin` + heading `Overview`. Logout belum diuji E2E (bukan bagian flow) |
| KI-40 | **AC-E2 parsial:** jalur `503 ENRICHMENT_UNAVAILABLE` ada dan form tetap dapat disubmit manual, tetapi kegagalan upstream belum dipaksa secara langsung | Low | **HOLD — post-MVP** (2026-11-28) | — | Keputusan pemilik: tidak dikerjakan di E-8 (butuh mock upstream). `KI-38` (semantik `error: true`) juga tetap post-MVP dan ikut ditangani bersama uji jalur `503` nanti |
| KI-41 | **Demo email manual**: kredensial SMTP test mailbox + instance n8n | Medium | **Verified (local Mailpit)** (2026-11-28) | — | MT-1 PASS: 1 email di Mailpit dengan `notificationId` = outbox id. **Bukan** bukti email publik/inbox. MT-4 (SMTP sengaja gagal) tetap HOLD |
| KI-42 | Import `n8n/order-paid-email.json` ke instance n8n nyata tidak diuji; node type version dapat perlu penyesuaian | Low | **Partially resolved** (2026-11-28) | — | Workflow disinkronkan lewat **UI + Publish** (bukan import ulang) dan diverifikasi: `activeVersionId` = draft = hash `8da22812c27cf81b`. Prosedur import tetap belum diuji |
| KI-43 | Fixture admin E2E **tidak** memakai `ensureAdminUser()` dari integration suite: rantai import `auth.ts → clients.ts → src/lib/supabase/admin.ts` diawali `import 'server-only'` (hanya bisa di-alias oleh `vitest.config.integration.ts`), dan `tests/integration/support/env.ts` memakai `import.meta` yang gagal di CJS Playwright | Low | **Diterima untuk MVP** (2026-11-28) | — | Fixture ditulis ulang di `tests/e2e/support/admin-fixture.ts` + `support/env.ts` dengan guard yang sama (loopback + port 54421, tolak DB remote, tolak konflik env). Duplikasi ~60 baris; alternatifnya mengubah `tsconfig`/module app, di luar scope E-8 |
| KI-44 | Setiap run E2E customer menambah satu baris `orders` **permanen** di DB lokal (tidak ada grant delete, tanpa cleanup job); trace retry Playwright memuat capability URL order yang dikunjungi | Low | **Diterima — known limitation** (2026-11-28) | — | DB lokal adalah data demo; `test-results/`/`playwright-report/` gitignored dan tidak boleh dibagikan. Order hasil run E-8: **`RML-HYEX0T`** (run 1) dan **`RML-4R7EUW`** (run 2), keduanya `paid`; keduanya adalah bukti pengujian E-8 dan tidak boleh dihapus |
| KI-45 | `/admin/packages` memuat seluruh katalog tanpa paginasi (order/payment berpaginasi 10) | Low | **Diterima — post-MVP** (2026-11-28) | — | Katalog MVP 15 paket; paginasi katalog bukan kebutuhan demo. Tidak diubah di E-8 |
| KI-46 | Drift dokumentasi terdeteksi di E-8: `README.md` menyebut 205 unit test (aktual 227) dan `AGENTS.md`/`README.md` mencantumkan `npm run test:e2e` sebelum script-nya ada | Low | **Resolved** (2026-11-28) | — | README (jumlah test, prasyarat E2E) + `AGENTS.md` (komentar perintah) disinkronkan; `test:e2e` sekarang benar-benar ada di `package.json` |

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
| NA-07 | Analisis + proposal + implementasi E-3 | NA-02 | Selesai (`af53146`, `f4172e1`, `7d18015`) |
| NA-08 | Sinkronkan `docs/design-solution.md` §5.2 (font) dan `AGENTS.md` (daftar skrip) dengan realitas E-2 | — | **Menunggu persetujuan terpisah** (belum ada izin mengubah dokumen baseline) |
| NA-09 | Analisis + proposal + implementasi + commit lokal E-4 (Tier P1–P4) | NA-07 | Selesai (`96b69b2`, `33d99f6`, `23f25b4` + commit penutupan) |
| NA-10 | Push empat commit E-4 ke `origin/main` | NA-09 | **Selesai** 2026-11-27 (`83f961b..dcbd315`, fast-forward) |
| NA-11 | Analisis + implementasi + verifikasi + commit lokal E-5 | NA-10 | **Selesai** (`feat`/`test`/`docs` E-5) |
| NA-12 | Push tiga commit E-5 ke `origin/main` | NA-11 | **Selesai** 2026-11-27 (`dcbd315..220517c`, fast-forward) |
| NA-13 | Mulai **E-6 Analysis/Proposal** (bukan izin implementasi) | NA-12 | **Ya (pemilik proyek)** — selesai 2026-11-28 |
| NA-14 | Implementasi E-6 (43 file baru, 5 file diubah) + verifikasi parsial | NA-13 | **Selesai** 2026-11-28 (`IMPLEMENTED`, `PARTIALLY VERIFIED`) |
| NA-15 | Jalankan gate verifikasi E-6: `PERM-OH-1…6` (Docker, `supabase start`, `db reset`, `db:seed-admin`, `test:int`, manual walkthrough) | NA-14 | **Ya (pemilik proyek)** |
| NA-16 | Sinkronkan `docs/api-contract.md` dengan `KI-29`/`KI-30` | NA-15 | **Selesai** 2026-11-28 (`PERM-DOC-1`) |
| NA-17 | Perbaiki **`KI-35`** (cursor offset `+00:00`): terima `±HH:MM` + kutip nilai saat menyusun filter, tambah unit test | NA-16 | **Selesai** 2026-11-28 (`PERM-FIX-1`, 4 file) |
| NA-18 | Verifikasi ulang halaman 2 (API + UI) setelah `KI-35` diperbaiki, lalu ajukan closure review E-6 | NA-17 | **Selesai** 2026-11-28 (orders 3 halaman/30 unik, payments 2 halaman, tanpa overlap) |
| NA-19 | E-6 dinyatakan **`CLOSED`** setelah final review (AC-A1 & AC-E2 tetap parsial → E-8) | NA-18 | **Selesai** 2026-11-28 |
| NA-20 | Putuskan kanal notifikasi n8n (`KI-04`/NA-04) sebelum E-7 | NA-19 | **Selesai** 2026-11-28 — kanal **email via SMTP n8n** |
| NA-22 | Demo email manual: siapkan SMTP test mailbox + workflow n8n, lalu jalankan alur checkout→paid→email dan uji jalur gagal | NA-20 | **Selesai sebagian** 2026-11-28: MT-1/MT-2A/MT-6 PASS; MT-2B/MT-3/MT-4 ditunda |
| NA-23 | Final review E-7 (closure) | NA-22 | **Selesai** 2026-11-28 — E-7 `CLOSED` (MVP scope, known limitations accepted); MT-2B/3/4 tetap deferred |
| NA-21 | E-8: Playwright 2 flow (login admin + package management, checkout→paid), uji jalur `503` enrich, keyboard/kontras (`KI-26`, `KI-27`), drawer sidebar (`KI-32`), `Previous` keyset (`KI-31`), `KI-38` | NA-19 | **Sebagian selesai** 2026-11-28: 2 flow Playwright PASS (`KI-39` Resolved) + assertion mobile 390×844; **`KI-40`/`KI-38` (`503` enrich), `KI-26`, `KI-27`, `KI-31`, `KI-32` tetap HOLD/post-MVP** sesuai keputusan pemilik |

Urutan yang disarankan: **NA-10** (push manual) → **NA-11** (mulai E-5 Analysis/Proposal) → implementasi E-5 hanya setelah proposalnya disetujui; **NA-03/NA-04** diperlukan sebelum E-4/E-7; **NA-08** menunggu
persetujuan terpisah — tanpa izin tersebut, `AGENTS.md` dan `docs/design-solution.md` tidak
disentuh.

### 7.1 HOLD — pekerjaan E-7…E-8 (tidak boleh dimulai)

E-5 **tidak** berarti MVP selesai. Item di bawah berstatus **HOLD**: belum diimplementasikan,
tidak diubah, tidak dihapus, dan menunggu workflow analisis + izin implementasi tersendiri.

| Area | Item yang HOLD | Fase | Dependency / alasan HOLD |
| --- | --- | --- | --- |
| Admin route & API | 10 route handler admin di `docs/api-contract.md` §5 (`/api/admin/**`) | E-6 | **Keluar dari HOLD 2026-11-28** (`IMPLEMENTED`): 7 route (10 method) + `adminGuard()`; verifikasi HTTP penuh menunggu `KI-33` |
| UI admin | `/admin/login`, overview, CRUD destinasi/paket, daftar order & payment, keyset pagination 10 baris | E-6 | **Keluar dari HOLD 2026-11-28** (`IMPLEMENTED`): 6 halaman + 4 halaman form/detail; login & CRUD nyata menunggu `KI-33` |
| Notifikasi & n8n | Dispatcher (`after()`), `claim_outbox`/`finish_outbox` di kode, webhook + `X-Webhook-Secret`, retry 10 s | E-7 | **Keluar dari HOLD 2026-11-28** (`IMPLEMENTED` + test otomatis `VERIFIED`): modul `automation/*`, endpoint resend, tombol Resend, `n8n/order-paid-email.json`; demo email menunggu SMTP (`KI-41`) |
| AC fase berikutnya | A1–A7 · T12, T14 · E1, E2 | E-6/E-7 | **E-6 keluar dari HOLD 2026-11-28** (`CLOSED`): A2/A3/A4/A5/A6/A7 + E1 **Verified**; A1 & E2 tetap **Partially Verified** → E-8 (`KI-39`, `KI-40`); T12/T14 tetap milik E-7 |
| 4 AC database-scope | T7, T10, T11, T15 | E-7 | Paruh database sudah `Verified (database scope)`; paruh HTTP/delivery belum. **Jangan** dinaikkan menjadi `Verified` penuh |

**Sudah keluar dari HOLD:** storefront (E-4) dan checkout/payment/order flow (E-5) — lihat §4 E-4
dan §4 E-5.

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
| 2026-11-27 | E-3 implementasi + verifikasi lokal: 6 migration, seed, `admin.ts`, harness; 85/85 integration, 11/11 unit, lint 0/0, typecheck 0; NV-01…NV-05 lulus | `VERIFIED` |
| 2026-11-27 | E-3 penutupan Git: `af53146` + `f4172e1` + `7d18015`, push fast-forward `7c80675..7d18015` ke `origin/main` | `CLOSED` |
| 2026-11-27 | E-4…E-8 tetap `HOLD`; 22 AC menunggu fase berikutnya, 11 AC tetap database-scope | `HOLD` |
| 2026-11-27 | E-4 storefront diimplementasikan (P1–P4): modul catalog, 4 halaman, 9 komponen, 2 file unit test; lint/typecheck/build hijau, HTTP 200 & 404 terverifikasi | `IMPLEMENTED` |
| 2026-11-27 | E-4 sinkronisasi dokumentasi: status → `VERIFIED`; fallback gambar, NFR8, dan NFR9-keyboard PASS (pengujian pengguna), A″ dicatat, KI-01 → approved-for-MVP, KI-25…KI-27 ditambahkan; NFR9 contrast + seleksi aset final `DEFERRED` | `VERIFIED` |
| 2026-11-27 | E-4 penutupan: 4 commit lokal (`96b69b2`, `33d99f6`, `23f25b4`, commit penutupan), gate lint/typecheck/unit 32-32/production build semuanya PASS, working tree bersih; **belum di-push** | `CLOSED` |
| 2026-11-27 | E-4 push ke `origin/main`: `83f961b..dcbd315` (fast-forward, tanpa force) | `CLOSED` |
| 2026-11-27 | E-5 implementasi + verifikasi lokal: checkout/payment/order flow, 3 API + 3 halaman, 27 unit test baru, smoke HTTP 27/27, gate hijau; `KI-24` ditutup; **belum di-commit** | `VERIFIED` |
| 2026-11-27 | E-5 tiga commit lokal: `5fc02d6` feat (19 file), `5565b5b` test (3), `220517c` docs (3) | `VERIFIED` |
| 2026-11-27 | E-5 penutupan + push: `dcbd315..220517c` fast-forward ke `origin/main` (tanpa force); status → `CLOSED`; progres 5/10 (60%) | `CLOSED` |
| 2026-11-27 | GAP-1 (pasca-penutupan): UI tidak memanggil `POST /api/payments/verify`; diperbaiki di `mock-gateway-controls.tsx` (1 file). Verifikasi T1–T6 + smoke 27/27 + integritas DB 0 pelanggaran. E-5 tetap `CLOSED` | `RESOLVED` |
| 2026-11-27 | Checkout Validation UX: schema pesan customer-friendly, validasi client/server, 30 test schema; unit 95/95, lint/typecheck PASS | `VERIFIED` |
| 2026-11-27 | Checkout Session Reuse + Storage Fallback: modul `checkout-key.ts`, 18 test, fallback in-memory, kontrak §6 diperbarui | `VERIFIED` |
| 2026-11-27 | E-5 final verification pasca-penutupan: production build PASS (12 route) · 95/95 unit (7 file) · smoke 27/27 · DB 7×0 · M1–M4 user-attested · AC-9 target 96 disesuaikan → 95/95; 8 path di-commit (`9cd350d`, `d429ce7`, + commit dokumentasi) | `CLOSED` |
| 2026-11-28 | E-6 implementasi (otorisasi terbatas): 43 file baru + 5 file diubah (README, `package.json`, `src/lib/http.ts`, `WORK_TRACKER.md`, `.env.example`); 0 migration, 0 dependency baru; `docs/api-contract.md` **tidak** diubah | `IN PROGRESS` |
| 2026-11-28 | E-6 verifikasi parsial: lint 0/0 · typecheck 0 · unit 158/158 (12 file) · build PASS 26 route · HTTP 401/307 sebelum parsing body · 0 secret di log · regresi storefront 200 | `IN PROGRESS` |
| 2026-11-28 | E-6 Gate 1–2: `supabase start` **tanpa reset** (6/6 migration, seed utuh), `db:seed-admin` idempoten (password unchanged, tanpa secret di log) | `IN PROGRESS` |
| 2026-11-28 | E-6 Gate 3–4: fixture R-3 diganti (pasangan tetap + acak, seed tidak disentuh) · `test:int` **88/88 PASS** (9 file, termasuk 3 assertion baru) · katalog aktif tetap 5/15 | `IN PROGRESS` |
| 2026-11-28 | E-6 Gate 5: walkthrough HTTP ber-sesi nyata — 401/403/200, CRUD + 409/422, storefront reflect (aktif→muncul, nonaktif→404), WIB 20 timestamp & 0 ISO mentah, enrich 200/404/422 tanpa write | `IN PROGRESS` |
| 2026-11-28 | E-6 Gate 6: `docs/api-contract.md` disinkronkan (+38/−12); `KI-29`/`KI-30` Resolved | `IN PROGRESS` |
| 2026-11-28 | **Temuan P1 `KI-35`** (Gate 5): cursor keyset ber-offset `+00:00` ditolak validator → halaman ≥ 2 order/payment 422. **Belum diperbaiki** (di luar izin). E-6 tetap `IN PROGRESS` / `PARTIALLY VERIFIED` | `BLOCKED` (KI-35) |
| 2026-11-28 | **`KI-35` Resolved** (`PERM-FIX-1`, 4 file: `admin-list.ts`, 2 admin query, 1 unit test): `±HH:MM` diterima & dinormalkan, filter dikutip. Bukti: unit **167/167**, orders **3 halaman/30 unik/overlap 0**, payments **2 halaman/overlap 0**, UI halaman 2 tanpa alert, `test:int` **88/88**, build **26 route**, lint 0/0, typecheck 0 | `VERIFIED` |
| 2026-11-28 | Tracker disinkronkan: AC-A5 & NFR3 → **Verified**; `KI-20`/`KI-29`/`KI-30`/`KI-33`/`KI-35` → **Resolved**; `KI-36`…`KI-40` dicatat (P3 + dua AC parsial); baseline hash dokumen diperbarui; artifact readiness `13/13` halaman, `13/16` handler, AC `38/42` | `VERIFIED` |
| 2026-11-28 | **E-6 `CLOSED`** setelah final review: 0 P0/P1 terbuka, AC E-6 yang dapat diuji terbukti, dokumen sinkron; 2 AC parsial (A1, E2) dialihkan ke E-8; belum di-commit/di-push | `CLOSED` |
| 2026-11-28 | CI GitHub Actions ditambahkan (`.github/workflows/ci.yml`, commit `8b755b1`, run `46114301880` **success**, 46 s) | `CLOSED` |
| 2026-11-28 | **E-7 implementasi**: 5 modul/route baru (`automation/{payload,n8n.client,dispatch,outbox-queries}`, endpoint resend), tombol Resend di admin, `after()` pada verify, `orderId` internal pada `PaymentContext`, artefak `n8n/order-paid-email.json`, docs §7 + README. 0 migration, 0 dependency, 0 env baru | `IMPLEMENTED` |
| 2026-11-28 | **E-7 verifikasi otomatis**: unit **205/205** (15 file) · integration **95/95** (10 file) · lint 0/0 · typecheck 0 · build PASS 26 route. Bukti: 1 order → 1 kirim · 2 dispatch paralel = 1 kirim · n8n gagal → outbox `failed`, **order tetap paid** · resend `already_sent`/`in_flight`/`max_attempts` · payload invalid di-finish `invalid_payload` | `VERIFIED` |
| 2026-11-28 | E-7 status `IN PROGRESS`: demo email manual + import workflow n8n belum dapat dijalankan tanpa kredensial SMTP/instance n8n (`KI-41`, `KI-42`); belum di-commit/di-push | `IN PROGRESS` |
| 2026-11-28 | **E-7 Final Fix (A2 + B1)** disetujui & diimplementasikan: `canResendNotification` dihitung server (`resendEligibility` dipakai endpoint + daftar admin) · format WIB deterministik UTC+7 tanpa `Intl` pada Code node n8n · docs §5.4 + README disinkronkan. Bukti: unit **214/214**, integration **95/95**, lint 0/0, typecheck 0, build 26 route, JSON valid, eksekusi statis Code node **24/24**; 0 migration/dependency/env | `CODE COMPLETE` |
| 2026-11-28 | Tracker disinkronkan dengan hasil A2 + B1; status kode E-7 = `CODE COMPLETE — PENDING MANUAL INTEGRATION VERIFICATION`; `KI-41`/`KI-42` tetap terbuka; HEAD `8b755b1`, belum di-commit/di-push | `IN PROGRESS` |
| 2026-11-28 | **MT-1 PASS** (end-to-end): order `RML-6FDC6C` `paid`, payment `succeeded`, outbox `sent` (`attempts=3`), 1 eksekusi n8n `success` (versi `4dd2ba94`), 1 email Mailpit dengan `Reference` = outbox id, `Rp 145.000`, `28 Nov 2026, 18:03 WIB` | `VERIFIED` |
| 2026-11-28 | **MT-2A PASS** (invalid Header Auth → 403, 0 eksekusi/0 email/0 perubahan DB) · **MT-2B SKIPPED** (butuh perubahan env/restart atau file test sementara; aturan 4xx-tanpa-retry sudah diuji unit) | `VERIFIED` |
| 2026-11-28 | **MT-6 PASS** (resend pada notifikasi `sent` → `202 skipped`; `attempts` tetap 3, `sent_at` tidak berubah, 0 eksekusi, 0 email) | `VERIFIED` |
| 2026-11-28 | Final verification E-7 (read-only): source/DB/n8n/docs PASS · unit **227/227** · integration **95/95** (evidence) · n8n published = draft = `8da22812c27cf81b` · `KI-41` → Verified (local Mailpit), `KI-42` → Partially resolved; MT-2B/MT-3/MT-4 deferred. E-7 tetap `IN PROGRESS` menunggu keputusan closure | `VERIFIED` |
| 2026-11-28 | **E-8 implementasi**: `@playwright/test@1.65.1` (devDependency, Chromium 1255) + `playwright.config.ts` (chromium, 1 worker, `reuseExistingServer`, `trace: on-first-retry`) + `tests/e2e/{customer-checkout,admin-package}.spec.ts` + `tests/e2e/{global-setup.ts,support/{env,admin-fixture,storefront}.ts}` + script `test:e2e`. 0 migration, 0 perubahan `src/**`, 0 perubahan CI/env | `IMPLEMENTED` |
| 2026-11-28 | **E-8 verifikasi**: Playwright **3/3 PASS** (24.9 s) · integration **95/95 PASS** · unit **227/227** · lint 0/0 · typecheck 0 · build **26 route + Proxy** · order `RML-HYEX0T` `paid` (`Rp 89.000`, harga server) · fixture admin dihapus (DB: 0 `e2e-fixture-%`) · mobile 390×844 overflow 0 · 0 secret di output klien. Dua kegagalan awal = bug test (nama berisi digit; route-announcer `role=alert`), bukan bug aplikasi | `VERIFIED` |
| 2026-11-28 | Tracker & dokumen disinkronkan: `KI-39` → Resolved, `KI-40`/`KI-38`/`KI-26`/`KI-27`/`KI-31`/`KI-32` tetap post-MVP, `KI-43`–`KI-46` dicatat, `KI-46` (drift README/AGENTS) Resolved; E-8 tetap `IN PROGRESS` menunggu persetujuan closure + commit/push terpisah | `IN PROGRESS` |
| 2026-11-28 | **E-8 `CLOSED` — All Verification Gates Passed**: unit **227/227** · integration **95/95** · Playwright **3/3 dua run berturut-turut** · lint 0/0 · typecheck 0 · build **26 route + Proxy**; order bukti `RML-HYEX0T` + `RML-4R7EUW` (`paid`); fixture admin **0 sisa**; `KI-39` Resolved · `KI-43`/`KI-44` diterima untuk MVP · `KI-40` **HOLD/post-MVP**; E-7 tidak berubah; progres berbobot **97%**, E-9 tersisa. Belum di-commit/di-push | `CLOSED` |
| 2026-11-28 | **E-7 `CLOSED`** — keputusan pemilik: MVP scope, known limitations accepted. MT-1/MT-2A/MT-6 PASS · MT-2B SKIPPED · MT-3 manual tidak diuji (unit coverage) · MT-4 HOLD · Final Verification PASS · T12 jalur HTTP 409 parsial. Penutupan **bukan** pernyataan seluruh failure-path production telah diuji; 7 known limitations dipertahankan. Belum di-commit/di-push | `CLOSED` |

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
