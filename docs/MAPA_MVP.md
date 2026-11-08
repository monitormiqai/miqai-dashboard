# Mapa do MVP — Dashboard MIQAI

## Objetivo

Construir uma interface operacional para clientes MIQAI, começando por visão geral, dispositivos, telemetria atual, resultado público do CORE e histórico. Este documento registra necessidades confirmadas e separa fatos observados de propostas que ainda exigem contrato.

## Arquitetura de coleta e consulta

```text
ESP32-S3
  → endpoint de ingestão miqai-ingest (Supabase Edge Function, validado para ingestão)
  → tabelas do schema public no Supabase
  → Dashboard / SaaS com consulta Supabase autorizada
```

Não há MIQAI Server intermediário nesta arquitetura. O Supabase é o backend atual para recebimento, validação e persistência. O dispositivo envia telemetria por HTTPS em JSON para `miqai-ingest`, autenticando-se com `X-API-Key`. A Edge Function valida o dispositivo e persiste as leituras no PostgreSQL.

O caminho recomendado é o cliente oficial `supabase-js` no Dashboard com Supabase Auth. A sessão do usuário fornece o JWT às APIs do Supabase; grants e RLS no PostgreSQL determinam os registros acessíveis. A chave publicável pode estar no frontend, mas não concede autorização por si só. A Edge Function de ingestão é separada da sessão do usuário. `service_role`, `SUPABASE_SECRET_KEY` e credenciais de dispositivo nunca entram no frontend.

O dashboard não cria inteligência, não inventa resultados e não calcula indicadores operacionais ou ambientais. Estados, contagens, alertas e diagnósticos só podem ser mostrados quando recebidos de dados persistidos/consultas autorizadas ou do CORE. Não calcular valores, classificações, médias ou status no frontend; campos ausentes permanecem ausentes. A experiência mobile aprovada não exibe QAI Score.

A validação documentada confirma a Edge Function e a persistência com fixtures sintéticas, não operação contínua de um ESP32 real. A leitura em 2026-11-08 confirmou RLS ativo, nenhuma policy e nenhum `SELECT` para `anon` ou `authenticated`; há 1 cliente, 1 ambiente, 1 dispositivo e 128 leituras no momento da consulta. O usuário aprovou preparar acesso MVP somente leitura para um usuário de teste e para o cliente atual; as policies aguardam a criação desse usuário no Supabase Auth.

## Fatos do ambiente Supabase registrados em 2026-11-06

- Tabelas de aplicação relatadas: `clients`, `environments`, `devices`, `device_credentials` e `sensor_readings`.
- A validação mais recente informa que `sensor_readings.core_result` aceita `NULL`.
- `device_credentials` é exclusivamente para a Edge Function/Supabase; token ou hash não deve ser enviado ao dashboard.
- A validação de ingestão registrou tabelas limpas após remoção das fixtures.
- O dispositivo real 10 ainda não tinha cliente, ambiente, Domain e credencial provisionados naquele checkpoint.
- Há uma Edge Function `miqai-ingest` para POST de telemetria.
- Não há MIQAI Server intermediário.
- O mecanismo de consulta do Dashboard ainda não foi habilitado: a auditoria registrou RLS sem policies e sem grants para `anon`/`authenticated`.

Este é um retrato documental datado, não substitui uma nova leitura do schema antes de integrar. A estrutura V1 antiga (`tenant`, `environment`, `device`, `reading`, `core_result`, `alert`) não deve ser assumida como schema atual.

## Mapa de telas

| Tela | Conteúdo inicial | Dependências |
|---|---|---|
| Visão geral | Dados de operação retornados por consultas autorizadas, sem contagens calculadas no browser | Sessão Supabase Auth e RLS aprovadas |
| Dispositivos | Identificação, ambiente, estado, conectividade, firmware e última comunicação, somente se persistidos | Consulta às tabelas/vistas autorizadas por tenant |
| Detalhe do dispositivo | Leituras atuais, horário, unidade, resultado público CORE e contexto de ambiente/Domain | Leitura autorizada e Public Response versionado |
| Histórico | Leituras e resultados associados, com período e paginação | Consulta autorizada; nenhuma média/interpretação criada no frontend |
| Ambientes | Nome, Domain, dispositivos associados e histórico | Consulta autorizada por tenant; CRUD apenas após aprovar permissões e fluxos |
| Alertas | Alertas persistidos, estado, horário, origem e histórico | Dados persistidos e autorizados; nenhuma regra gerada no frontend |

## Dados por domínio

### Cadastro e autorização

- Usuário autenticado e tenant autorizado (claims e política ainda precisam ser definidos).
- Cliente, ambientes, Domain e estado cadastral.
- Relações entre dispositivo e ambiente.

### Dispositivo e conectividade

- `device_id`, estado operacional, firmware e ambiente associado, conforme persistidos.
- Última comunicação, última leitura, sincronização e sinal quando disponíveis.
- Mostrar online/offline somente se esse estado vier explicitamente persistido/reportado; caso contrário, apresentar o horário da última comunicação sem inferir conectividade.

### Telemetria

- `reading_id`, `measured_at`, `received_at`, `time_status` e dispositivo.
- Variáveis do contrato real de ingestão, unidade e valores nulos.
- O dashboard só apresenta campos existentes; não troca `null` por zero.

### Inteligência pública

- Public Response versionado associado à leitura.
- Status, current readings, QAI Score, diagnosis, evidence, hypotheses, scenario, relationship, impacts, action, followUp, foundation e references conforme disponíveis no contrato real.
- Não assumir que `core_result` parcial equivale a Public Response V1 completo.

## Acesso autorizado Supabase — MVP em preparação

1. Usar Supabase Auth no Dashboard; o schema consultado ainda não tem usuários Auth.
2. Usar apenas URL e chave publicável no frontend; nunca `service_role`, chave secret ou credencial de dispositivo.
3. Conceder `SELECT` somente às colunas consumidas de `clients`, `environments`, `devices` e `sensor_readings`.
4. Aplicar RLS restrito simultaneamente ao UUID do usuário de teste e ao cliente `MIQAI_SAUDE` / ambiente `Sala01`. O SQL preparado em `docs/sql/MIQAI_MVP_READ_ONLY_TEST_ACCESS.sql` já usa o UUID conferido.
5. Não conceder acesso a `anon`, gravação ou `device_credentials`.
6. As consultas simples usam `supabase-js`; `miqai-ingest` permanece exclusiva para ingestão.
7. O schema real contém `clients`, `environments`, `devices`, `device_credentials` e `sensor_readings`; não foram encontradas tabelas `alerts` ou `core_results`.
8. A leitura de `core_result` consultada usa `MIQAI_COMPACT_V2`; a tela apresenta apenas campos recebidos desse JSON, sem assumir equivalência a Public Response V1.

O usuário aprovou preparar esse acesso. As políticas e grants estão revisados no arquivo SQL, aguardando confirmação no momento de execução da alteração de permissões. Os nomes, IDs e relações foram conferidos no schema atual.

## Fora do MVP inicial

- Comandos remotos, atualização de firmware, calibração e manutenção.
- Ativação ou movimentação de equipamentos sem operação segura definida no Supabase e trilha de auditoria.
- Regras de alerta executadas no navegador.
- Score no dashboard; diagnóstico, interpretação, recomendações ou médias ambientais calculados no frontend.
- Acesso com chave administrativa ou sem RLS por tenant.

## Fases de trabalho

1. Confirmar schema Supabase atual, perfis de usuário e associação usuário→cliente/tenant.
2. Criar o usuário de teste e aplicar os grants e policies preparados, restritos à conta e ao cliente atual.
3. Confirmar quais dados estão persistidos e como é representado o Public Response completo do CORE.
4. Manter shell visual responsivo com estados de carregamento, erro, vazio e dado indisponível.
5. Após a aplicação das policies, integrar leituras autorizadas de ambientes e dispositivos.
6. Integrar histórico e alertas somente conforme dados já persistidos e autorizados.
7. Avaliar CRUD e ciclo de vida dos dispositivos após definir permissões e contratos de operação.

## Decisões necessárias para fechar o primeiro incremento

1. Confirmar a tecnologia frontend, mantendo o protótipo atual leve ou adotando framework após decisão.
2. Criar um usuário de homologação no Supabase Auth. O MVP fica restrito a esse usuário e ao cliente atual.
3. Confirmar que os dados do dispositivo 10 podem ser exibidos no dashboard.
4. Definir as consultas autorizadas necessárias e quais dados realmente estão persistidos.
5. Confirmar qual versão do Public Response do CORE está persistida para as leituras reais.

## Identidade visual e decisões de layout

Os mockups fornecidos pelo usuário são a referência visual principal. A implementação deve preservar a identidade MIQAI já apresentada: logotipo e assinatura da marca, paleta institucional, cartões com hierarquia clara, tipografia e linguagem em português. Não adotar um template SaaS genérico que substitua essa identidade.

**Decisão acordada:** reproduzir primeiro a experiência mobile do mockup: cinco etapas navegáveis — Agora, Cenário, Impactos, Ação e Fundamento. As etapas apresentam medições persistidas e conteúdo recebido do CORE para o ambiente. A interface não cria inteligência, interpretações, classificações, recomendações nem score. Campo ausente no banco ou no resultado do CORE permanece indisponível; números e estados ilustrativos do mockup não são usados como dados do produto. O estado mostrado ao usuário representa o ambiente/dispositivo conforme persistido, nunca a conexão técnica com o Supabase.






