-- MIQAI MVP — acesso de leitura para um usuário de teste.
-- Vinculado ao UUID específico do usuário de teste criado no projeto.
-- Este script não cria usuário, não habilita acesso anon e não toca em device_credentials.
-- Escopo real conferido no projeto MIQAI MVP em 2026-11-08:
--   client_id      f1010101-1010-4010-8010-101010101010 (MIQAI_SAUDE)
--   environment_id e1010101-1010-4010-8010-101010101010 (Sala01)

begin;

grant usage on schema public to authenticated;

grant select (client_id, name, status)
  on public.clients to authenticated;

grant select (environment_id, client_id, name, domain, status, created_at)
  on public.environments to authenticated;

grant select (device_id, environment_id, status, created_at, activated_at)
  on public.devices to authenticated;

grant select (
  reading_id, device_id, environment_id, measured_at, received_at,
  time_status, firmware_version, temperature, dew_point, humidity,
  co2, co, pm1_0, pm25, pm4_0, pm10, voc_index, nox_index, core_result
)
  on public.sensor_readings to authenticated;

create policy miqai_dashboard_test_client_read
  on public.clients for select to authenticated
  using (
    auth.uid() = 'd5d573e7-ac46-4d51-b626-c5c49a34ec8f'::uuid
    and client_id = 'f1010101-1010-4010-8010-101010101010'::uuid
  );

create policy miqai_dashboard_test_environment_read
  on public.environments for select to authenticated
  using (
    auth.uid() = 'd5d573e7-ac46-4d51-b626-c5c49a34ec8f'::uuid
    and client_id = 'f1010101-1010-4010-8010-101010101010'::uuid
  );

create policy miqai_dashboard_test_device_read
  on public.devices for select to authenticated
  using (
    auth.uid() = 'd5d573e7-ac46-4d51-b626-c5c49a34ec8f'::uuid
    and environment_id = 'e1010101-1010-4010-8010-101010101010'::uuid
  );

create policy miqai_dashboard_test_reading_read
  on public.sensor_readings for select to authenticated
  using (
    auth.uid() = 'd5d573e7-ac46-4d51-b626-c5c49a34ec8f'::uuid
    and environment_id = 'e1010101-1010-4010-8010-101010101010'::uuid
  );

commit;
