-- Amplia somente a leitura autenticada das colunas complementares do Dashboard MIQAI.
-- Não altera tabelas, dados, políticas RLS nem credenciais.
-- Executar como proprietário do projeto Supabase se a consulta expandida retornar 42501.

grant select (
  time_source, signal_strength,
  nc0_5, nc1_0, nc2_5, nc4_0, nc10_0, typical_size
)
  on public.sensor_readings to authenticated;
