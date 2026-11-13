-- Apply before deploying street-aware inference. Existing area forecasts are preserved.
create table public.prediction_streets (
 street_id integer primary key, street_name text not null,
 elevation double precision not null, flood_hazard_level integer not null
);
create table public.street_prediction_logs (
 street_id integer not null references public.prediction_streets,
 forecast_time timestamptz not null,
 rain_intensity_1h double precision not null,
 rain_accum_6h double precision not null,
 rain_accum_24h double precision not null,
 predicted_probability double precision not null check (predicted_probability between 0 and 1),
 created_at timestamptz not null,
 primary key (street_id, forecast_time)
);
alter table public.prediction_streets enable row level security;
alter table public.street_prediction_logs enable row level security;
create policy "Public street catalog" on public.prediction_streets for select using (true);
create policy "Public street forecasts" on public.street_prediction_logs for select using (true);
grant select on public.prediction_streets, public.street_prediction_logs to anon, authenticated;
insert into public.prediction_streets values
(1, 'cypress', 7.0, 0),
(2, 'chico', 7.0, 1),
(3, 'pili', 7.0, 1),
(4, 'hamoran', 8.0, 1),
(5, 'apitong', 7.0, 1),
(6, 'rimas', 7.0, 1),
(7, 'narra', 7.0, 1),
(8, 'papua', 7.0, 1),
(9, 'lukban', 7.0, 1),
(10, 'mahogany', 7.0, 1),
(11, 'cacao', 7.0, 1),
(12, 'anahaw', 7.0, 1),
(13, 'acacia', 7.0, 1),
(14, 'kamagong', 6.0, 1),
(15, 'dita', 6.0, 1),
(16, 'antipolo', 6.0, 2),
(17, 'lawaan', 7.0, 1),
(18, 'yakal', 6.0, 1),
(19, 'dapdap', 7.0, 1),
(20, 'bahi', 7.0, 1),
(21, 'banaba', 7.0, 1),
(22, 'dapo', 7.0, 1),
(23, 'palomaria', 7.0, 1),
(24, 'talisay', 6.0, 1),
(25, 'dayap', 6.0, 1),
(26, 'anonang', 6.0, 1);
