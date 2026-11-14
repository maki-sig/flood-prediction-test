-- Separate street forecasts preserve existing barangay forecast history.
create table if not exists public.street_flood_predictions (
  street_id integer not null,
  street_name text not null,
  forecast_time timestamptz not null,
  elevation double precision not null,
  flood_hazard_level integer not null,
  rain_intensity_1h double precision not null,
  rain_accum_6h double precision not null,
  rain_accum_24h double precision not null,
  predicted_probability double precision not null check (predicted_probability between 0 and 1),
  created_at timestamptz not null default now(),
  primary key (street_id, forecast_time)
);
create index if not exists street_flood_predictions_forecast_time_idx
  on public.street_flood_predictions(forecast_time);
alter table public.street_flood_predictions enable row level security;
drop policy if exists "Public can read street forecasts" on public.street_flood_predictions;
create policy "Public can read street forecasts" on public.street_flood_predictions
  for select to anon, authenticated using (true);
grant select on public.street_flood_predictions to anon, authenticated;
grant all on public.street_flood_predictions to service_role;
-- The Python update endpoint must use a server-only service role key for writes.
