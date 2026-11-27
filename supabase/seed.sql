-- E-3 seed — catalog only (5 destinations, 15 packages).
-- Idempotent: a second `db reset` must keep 5 destinations / 15 packages.
-- No auth.* rows: the dev admin is created through the Supabase Admin API.

insert into public.destinations
  (slug, country_code, name, region, currency_code, flag_emoji, summary, description,
   hero_image_url, hero_image_attribution, is_active, sort_order)
values
  ('japan', 'JP', 'Japan', 'Asia', 'JPY', '🇯🇵',
   'Reliable data across Tokyo, Kyoto and beyond.',
   'Local 5G/LTE coverage with instant activation on arrival.',
   'https://upload.wikimedia.org/wikipedia/commons/1/16/Kyoto_Skyline_-_Pentinlo.jpg',
   'Photo: Reginald Pentinlo · CC BY', true, 1),
  ('singapore', 'SG', 'Singapore', 'Asia', 'SGD', '🇸🇬',
   'Fast city coverage for short business or leisure trips.',
   'Dense 5G coverage island-wide, ideal for a 2–3 day stopover.',
   'https://upload.wikimedia.org/wikipedia/commons/2/27/Skylines_of_the_Central_Business_District%2C_Singapore_at_dusk.jpg',
   'Photo: Basile Morin · CC BY-SA', true, 2),
  ('thailand', 'TH', 'Thailand', 'Asia', 'THB', '🇹🇭',
   'From Bangkok to the islands without roaming fees.',
   'Nationwide coverage with generous data allowances.',
   'https://upload.wikimedia.org/wikipedia/commons/2/25/Grand_Palace_Bangkok%2C_Thailand.jpg',
   'Photo: Andy Marchand · CC BY-SA', true, 3),
  ('malaysia', 'MY', 'Malaysia', 'Asia', 'MYR', '🇲🇾',
   'Stay connected across Peninsular and East Malaysia.',
   'Local network coverage in Kuala Lumpur, Penang and Borneo.',
   'https://upload.wikimedia.org/wikipedia/commons/c/cb/Kuala_Lumpur_Skyline_at_dusk.jpg',
   'Photo: Zukiman Mohamad (Pexels) · CC0', true, 4),
  ('switzerland', 'CH', 'Switzerland', 'Europe', 'CHF', '🇨🇭',
   'Alpine coverage for rail trips and city stays.',
   'Multi-network coverage across the Alps and major cities.',
   'https://upload.wikimedia.org/wikipedia/commons/a/ac/Switzerland-02093_-_First_View_of_the_Matterhorn_%2823004682155%29.jpg',
   'Photo: Dennis Jarvis · CC BY-SA', true, 5)
on conflict (slug) do nothing;

insert into public.packages
  (destination_id, slug, name, data_mb, is_unlimited, validity_days, price_idr,
   compare_at_price_idr, network, hotspot_allowed, is_active)
select d.id, v.slug, v.name, v.data_mb, v.is_unlimited, v.validity_days, v.price_idr,
       v.compare_at_price_idr, v.network, true, true
  from (values
    ('japan', 'japan-3gb-7d',  'Japan 3 GB · 7 days',   3072,  false, 7::smallint,  89000, null::integer, 'Local 5G/LTE'),
    ('japan', 'japan-5gb-15d', 'Japan 5 GB · 15 days',  5120,  false, 15::smallint, 145000, 179000,        'Local 5G/LTE'),
    ('japan', 'japan-10gb-30d','Japan 10 GB · 30 days', 10240, false, 30::smallint, 249000, null::integer, 'Local 5G/LTE'),

    ('singapore', 'singapore-1gb-7d',  'Singapore 1 GB · 7 days',   1024,  false, 7::smallint,  49000, null::integer, 'Local 5G/LTE'),
    ('singapore', 'singapore-3gb-7d',  'Singapore 3 GB · 7 days',   3072,  false, 7::smallint,  79000, null::integer, 'Local 5G/LTE'),
    ('singapore', 'singapore-10gb-30d','Singapore 10 GB · 30 days', 10240, false, 30::smallint,199000, null::integer, 'Local 5G/LTE'),

    ('thailand', 'thailand-5gb-8d',       'Thailand 5 GB · 8 days',   5120,  false, 8::smallint,  65000, null::integer, 'Local 5G/LTE'),
    ('thailand', 'thailand-10gb-15d',     'Thailand 10 GB · 15 days', 10240, false, 15::smallint, 99000, null::integer, 'Local 5G/LTE'),
    ('thailand', 'thailand-unlimited-7d', 'Thailand Unlimited · 7 days', null::integer, true, 7::smallint, 149000, null::integer, 'Local 5G/LTE'),

    ('malaysia', 'malaysia-3gb-7d',   'Malaysia 3 GB · 7 days',   3072,  false, 7::smallint,  39000, null::integer, 'Local 5G/LTE'),
    ('malaysia', 'malaysia-6gb-15d',  'Malaysia 6 GB · 15 days',  6144,  false, 15::smallint, 59000, null::integer, 'Local 5G/LTE'),
    ('malaysia', 'malaysia-12gb-30d', 'Malaysia 12 GB · 30 days', 12288, false, 30::smallint, 89000, null::integer, 'Local 5G/LTE'),

    ('switzerland', 'switzerland-2gb-7d',   'Switzerland 2 GB · 7 days',   2048,  false, 7::smallint,  79000, null::integer, 'Multi-network 5G/LTE'),
    ('switzerland', 'switzerland-5gb-15d',  'Switzerland 5 GB · 15 days',  5120,  false, 15::smallint, 139000, null::integer, 'Multi-network 5G/LTE'),
    ('switzerland', 'switzerland-10gb-30d', 'Switzerland 10 GB · 30 days', 10240, false, 30::smallint, 229000, null::integer, 'Multi-network 5G/LTE')
  ) as v(dest_slug, slug, name, data_mb, is_unlimited, validity_days, price_idr,
         compare_at_price_idr, network)
  join public.destinations d on d.slug = v.dest_slug
on conflict (destination_id, slug) do nothing;
