-- E-3 / M2 — catalog: destinations, packages

create table public.destinations (
  id                      uuid primary key default gen_random_uuid(),
  slug                    text not null unique,
  country_code            char(2) not null unique,
  name                    text not null,
  region                  text not null,
  currency_code           char(3) not null,
  flag_emoji              text,
  summary                 text not null,
  description             text,
  hero_image_url          text not null,
  hero_image_attribution  text not null,
  is_active               boolean not null default true,
  sort_order              smallint not null default 0,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),

  constraint destinations_slug_format_chk   check (slug ~ '^[a-z0-9-]+$'),
  constraint destinations_country_upper_chk check (country_code = upper(country_code)),
  constraint destinations_currency_chk      check (currency_code ~ '^[A-Z]{3}$'),
  constraint destinations_summary_len_chk   check (char_length(summary) between 1 and 160),
  constraint destinations_name_chk          check (name <> ''),
  constraint destinations_hero_url_chk      check (hero_image_url ~ '^https://')
);

create index destinations_active_sort_idx
  on public.destinations (is_active, sort_order, name);

create trigger destinations_set_updated_at
  before update on public.destinations
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------

create table public.packages (
  id                     uuid primary key default gen_random_uuid(),
  destination_id         uuid not null references public.destinations (id) on delete restrict,
  slug                   text not null,
  name                   text not null,
  data_mb                integer,
  is_unlimited           boolean not null default false,
  validity_days          smallint not null,
  price_idr              integer not null,
  compare_at_price_idr   integer,
  network                text,
  hotspot_allowed        boolean not null default true,
  is_active              boolean not null default true,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),

  constraint packages_destination_slug_key unique (destination_id, slug),

  -- A NULL data_mb must never pass for a metered package: `NULL > 0` is NULL and a
  -- CHECK only fails on FALSE, so the naive form would accept (false, NULL).
  constraint packages_data_size_chk check (
    (is_unlimited and data_mb is null)
    or (not is_unlimited and data_mb is not null and data_mb > 0)
  ),

  -- Ceiling keeps unit_price_idr * quantity (<= 5) inside int4 (2,147,483,647) and
  -- guarantees a payment amount above zero.
  constraint packages_price_range_chk check (price_idr between 1 and 100000000),
  constraint packages_compare_price_chk check (
    compare_at_price_idr is null or compare_at_price_idr > price_idr
  ),
  constraint packages_validity_chk check (validity_days between 1 and 90),
  constraint packages_slug_format_chk check (slug ~ '^[a-z0-9-]+$'),
  constraint packages_name_chk check (name <> '')
);

create index packages_dest_active_price_idx
  on public.packages (destination_id, is_active, price_idr);

create trigger packages_set_updated_at
  before update on public.packages
  for each row execute function public.set_updated_at();
