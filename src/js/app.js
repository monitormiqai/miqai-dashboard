const config = window.MIQAI_CONFIG ?? {};
const form = document.querySelector("#login-form");
const message = document.querySelector("#auth-message");
const logoutButton = document.querySelector("#logout-button");
const mobileLogoutButton = document.querySelector("#mobile-logout-button");
const authPanel = document.querySelector(".auth-panel");
const notice = document.querySelector("#connection-notice");
const authHeading = document.querySelector("#auth-heading");
const authInstructions = document.querySelector("#auth-instructions");

const createClient = window.supabase?.createClient;
const hasConfig = Boolean(config.url && config.publishableKey && createClient);
const db = hasConfig
  ? createClient(config.url, config.publishableKey, { auth: { persistSession: true, autoRefreshToken: true } })
  : null;

if (hasConfig) form.querySelectorAll("input, button").forEach(control => { control.disabled = false; });

function setMessage(text, kind = "info") {
  message.textContent = text;
  message.dataset.kind = kind;
}

function formatValue(value, unit = "") {
  if (value === null || value === undefined || value === "") return "—";
  const numeric = typeof value === "number" ? value : Number(value);
  const rendered = Number.isFinite(numeric)
    ? new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(numeric)
    : String(value);
  return `${rendered}${unit}`;
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "medium", timeZone: "America/Sao_Paulo" }).format(date);
}

function measurementTimeLabel(reading) {
  if (!reading?.measured_at) return "Horário da medição indisponível";
  const measured = formatDate(reading.measured_at);
  if (reading.time_status === "UNSYNCED") return `Medida informada ${measured} · relógio sem sincronização`;
  if (reading.time_status === "SYNCED") return `Medida ${measured}${reading.time_source ? ` · sincronizada por ${reading.time_source}` : " · sincronização confirmada"}`;
  return `Medida informada ${measured} · sincronização não informada`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

function showAuthState(session) {
  const signedIn = Boolean(session);
  logoutButton.hidden = !signedIn;
  mobileLogoutButton.hidden = !signedIn;
  form.hidden = signedIn || !hasConfig;
  authPanel.hidden = signedIn;
  authHeading.textContent = "Entre para consultar os dados do ambiente";
  authInstructions.textContent = "Acesse o ambiente vinculado à sua conta.";
  if (signedIn) {
    setMessage("Carregando dados do ambiente…", "info");
    loadDashboard();
  } else if (!hasConfig) {
    setMessage(config.url && config.publishableKey
      ? "Não foi possível preparar o acesso agora. Atualize a página antes de entrar."
      : "O acesso ainda não está configurado para este ambiente.", "error");
  }
}

function itemList(items, className = "mobile-info-card") {
  if (!Array.isArray(items)) return [];
  return items.map(item => {
    if (typeof item === "string") return `<article class="${className}"><p>${escapeHtml(item)}</p></article>`;
    if (!item || typeof item !== "object") return "";
    const title = item.title ?? item.name ?? item.label ?? item.code ?? "";
    const description = item.description ?? item.text ?? "";
    const statusBadge = { MATCH: "Identificado", POSSIBLE: "Possível", NONE_IDENTIFIED: "Nenhum identificado" }[item.status] ?? item.status;
    const badge = [item.severity, statusBadge, item.priority !== undefined ? `Prioridade ${item.priority}` : ""].find(value => typeof value === "string" && value) ?? "";
    const references = Array.isArray(item.referenceIds) && item.referenceIds.length
      ? `<small>Referências do CORE: ${escapeHtml(item.referenceIds.join(", "))}</small>` : "";
    const referenceStatus = item.approvalStatus ? `<small>Situação da referência: ${escapeHtml(item.approvalStatus)}</small>` : "";
    const reviewNote = item.reviewRequired === true ? "<small>Revisão técnica pendente conforme o dado recebido.</small>" : "";
    const observation = item.regulatory === false ? "<small>Observação não regulatória.</small>" : "";
    return `<article class="${className}">${title ? `<h3>${escapeHtml(title)}</h3>` : ""}${badge ? `<span class="mobile-data-badge">${escapeHtml(badge)}</span>` : ""}${description ? `<p>${escapeHtml(description)}</p>` : ""}${references}${referenceStatus}${reviewNote}${observation}</article>`;
  }).filter(Boolean);
}

function getCoreSection(coreResult, v2Key, v1Key) {
  const foundation = coreResult?.foundation ?? {};
  const value = foundation[v2Key] ?? coreResult?.[v1Key];
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.matches)) return value.matches;
  if (Array.isArray(value?.additional)) return value.additional;
  if (value?.primary && typeof value.primary === "object") return [value.primary];
  if (value && typeof value === "object" && (value.title || value.name || value.description)) return [value];
  return [];
}

function normalizeCoreResult(value) {
  if (typeof value !== "string") return value && typeof value === "object" ? value : null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function coreScenario(core) {
  return core?.environmentalScenario?.primary ?? core?.scenario?.primary ??
    (core?.environmentalScenario?.available ? core.environmentalScenario : null) ??
    (core?.scenario?.available ? core.scenario : null);
}

function coreActions(core) {
  const legacyActions = core?.actions ?? core?.action ?? {};
  const mitigationActions = core?.mitigation?.actions;
  const additionalActions = Array.isArray(legacyActions.additional) ? legacyActions.additional
    : Array.isArray(legacyActions.recommendations) ? legacyActions.recommendations
    : Array.isArray(mitigationActions) ? mitigationActions.slice(1) : [];
  const primary = legacyActions.primary ?? mitigationActions?.[0] ?? additionalActions[0] ?? null;
  return {
    primary,
    additional: primary && additionalActions[0] === primary ? additionalActions.slice(1) : additionalActions
  };
}

function coreRelationships(core) {
  const value = core?.relationships;
  return Array.isArray(value) ? value : Array.isArray(value?.items) ? value.items : [];
}

function coreAssessmentLabel(state) {
  const labels = {
    OBSERVATION_REQUIRES_ATTENTION: "Atenção observacional identificada",
    NO_ATTENTION_IDENTIFIED: "Nenhuma atenção identificada nesta avaliação",
    NOT_ASSESSED: "Avaliação não realizada",
    INCONCLUSIVE: "Avaliação inconclusiva"
  };
  return labels[state] ?? state ?? "Estado não informado pelo CORE";
}

function parameterLabel(parameter) {
  const labels = {
    temperature: "Temperatura", humidity: "Umidade relativa", dewPoint: "Ponto de orvalho",
    co2: "CO₂", co: "CO", pm1_0: "PM1.0", pm25: "PM2.5", pm4_0: "PM4.0", pm10: "PM10",
    nc0_5: "NC0.5", nc1_0: "NC1.0", nc2_5: "NC2.5", nc4_0: "NC4.0", nc10_0: "NC10.0",
    typicalSize: "Tamanho típico", vocIndex: "VOC", noxIndex: "NOx"
  };
  return labels[parameter] ?? parameter;
}

function parameterReading(reading, parameter) {
  const fields = { dewPoint: "dew_point", pm1_0: "pm1_0", pm4_0: "pm4_0", nc0_5: "nc0_5", nc1_0: "nc1_0", nc2_5: "nc2_5", nc4_0: "nc4_0", nc10_0: "nc10_0", typicalSize: "typical_size", vocIndex: "voc_index", noxIndex: "nox_index" };
  return reading?.[fields[parameter] ?? parameter];
}

function assessmentLabel(value) {
  const labels = {
    WITHIN_REFERENCE: "Dentro da referência observacional",
    ABOVE_REFERENCE: "Acima da referência observacional",
    BELOW_REFERENCE: "Abaixo da referência observacional",
    NOT_ASSESSED: "Não avaliado",
    REQUIRED_NOT_EVALUATED: "Avaliação histórica necessária, ainda não realizada",
    NOT_REQUIRED_BY_CURRENT_REFERENCE: "Avaliação histórica não exigida nesta referência",
    NOT_ESTABLISHED: "Critério não estabelecido",
    NOT_CONFIGURED: "Parâmetro não configurado",
    UNAVAILABLE: "Indisponível",
    INVALID: "Leitura inválida"
  };
  return labels[value] ?? value ?? "Estado não informado";
}

function coreParameters(core) {
  const parameters = core?.validation?.parameters ?? core?.now?.parameters;
  return Array.isArray(parameters) ? parameters : [];
}

function parameterStatus(parameter) {
  return parameter?.inputStatus === "NOT_CONFIGURED" ? "NOT_CONFIGURED"
    : parameter?.inputStatus === "INVALID" ? "INVALID"
    : parameter?.currentAssessment ?? parameter?.assessment ?? (parameter?.historicalAssessmentStatus === "REQUIRED_NOT_EVALUATED" ? "REQUIRED_NOT_EVALUATED" : parameter?.currentAssessmentAvailable === false || parameter?.assessmentAvailable === false ? "NOT_ASSESSED" : null);
}

function resolutionMessage(kind, status) {
  const labels = {
    impact: { plural: "impactos", single: "impacto", none: "Nenhum impacto foi identificado", notAssessed: "Impactos não avaliados nesta leitura." },
    action: { plural: "ações", single: "ação", none: "Nenhuma ação foi identificada", notAssessed: "Ações não avaliadas nesta leitura." }
  };
  const label = labels[kind] ?? labels.impact;
  if (status === "NONE_IDENTIFIED") {
    return `${label.none} dentro das regras atualmente avaliadas pelo CORE.`;
  }
  if (status === "NOT_ASSESSED") {
    return label.notAssessed;
  }
  if (status === "NO_MATCH_OR_PREREQUISITE_UNAVAILABLE") {
    return `O CORE não encontrou ${label.single} correspondente ou não tinha pré-requisitos para avaliar.`;
  }
  if (!status || status === "NOT_REPORTED") {
    return `O CORE não informou o estado de ${label.single} nesta leitura.`;
  }
  return `Estado informado pelo CORE para ${label.single}: ${status}.`;
}

function sensorValue(value, unit, coreResult, parameter) {
  if (value !== null && value !== undefined && value !== "") {
    return escapeHtml(formatValue(value, unit ? ` ${unit}` : ""));
  }
  const validation = coreParameters(coreResult).find(item => item.parameter === parameter);
  if (validation?.inputStatus === "NOT_CONFIGURED") return "Não configurado";
  if (validation?.inputStatus === "INVALID") return "Leitura inválida";
  return "Indisponível nesta leitura";
}

const PRIMARY_METRICS = [
  ["Temperatura", "temperature", "°C", "temperature"],
  ["Umidade relativa", "humidity", "%", "humidity"],
  ["Ponto de orvalho", "dew_point", "°C", "dewPoint"],
  ["CO₂", "co2", "ppm", "co2"],
  ["PM1.0", "pm1_0", "µg/m³", "pm1_0"],
  ["PM2.5", "pm25", "µg/m³", "pm25"],
  ["PM4.0", "pm4_0", "µg/m³", "pm4_0"],
  ["PM10", "pm10", "µg/m³", "pm10"],
];
const COMPLEMENTARY_METRICS = [
  ["CO", "co", "", "co"],
  ["NC0.5", "nc0_5", "#/cm³", "nc0_5"],
  ["NC1.0", "nc1_0", "#/cm³", "nc1_0"],
  ["NC2.5", "nc2_5", "#/cm³", "nc2_5"],
  ["NC4.0", "nc4_0", "#/cm³", "nc4_0"],
  ["NC10.0", "nc10_0", "#/cm³", "nc10_0"],
  ["Tamanho típico", "typical_size", "µm", "typicalSize"],
  ["VOC", "voc_index", "índice", "vocIndex"],
  ["NOx", "nox_index", "índice", "noxIndex"],
];

function metricCards(metrics, reading, core, className) {
  return metrics.map(([label, field, unit, parameter]) => {
    const key = parameter ?? field;
    const validation = coreParameters(core).find(item => item.parameter === key);
    const state = validation ? `<em class="metric-state">${escapeHtml(assessmentLabel(parameterStatus(validation)))}</em>` : "";
    return `<article class="${className}"><small>${label}</small><strong>${sensorValue(parameterReading(reading, key), unit, core, key)}</strong>${state}</article>`;
  }).join("");
}

function complementaryReadings(reading, core, className = "") {
  return `<details class="complementary-reading ${className}"><summary>Leituras complementares</summary><div class="reading-values complementary-values">${metricCards(COMPLEMENTARY_METRICS, reading, core, "reading-value")}</div></details>`;
}

function renderCurrentReadings(reading) {
  const grid = document.querySelector("#current-reading-grid");
  const time = document.querySelector("#current-reading-time");
  if (!reading) {
    grid.innerHTML = '<div class="empty-card"><span class="empty-glyph">◉</span><div><h3>Nenhuma leitura disponível</h3><p>Este ambiente ainda não possui medições.</p></div></div>';
    time.textContent = "Aguardando leitura";
    return;
  }
  const core = normalizeCoreResult(reading.core_result);
  time.textContent = `${measurementTimeLabel(reading)} · recebida ${formatDate(reading.received_at)}`;
  const readingMeta = [reading.reading_id ? `Leitura ${reading.reading_id}` : "Identificador da leitura indisponível", reading.firmware_version ? `Firmware ${reading.firmware_version}` : "Firmware não informado", reading.time_source ? `Relógio ${reading.time_source}` : "Fonte do horário não informada", reading.signal_strength !== null && reading.signal_strength !== undefined ? `Sinal RSSI ${formatValue(reading.signal_strength)}` : ""].filter(Boolean).map(escapeHtml).join(" · ");
  grid.innerHTML = `${metricCards(PRIMARY_METRICS, reading, core, "current-reading-card")}<p class="reading-metadata">${readingMeta}</p><div class="current-reading-complementary">${complementaryReadings(reading, core)}</div>`;
}

function describeCoreMetric(value) {
  const descriptions = {
    CONTEXTUAL_OBSERVATION_NOT_REGULATORY_OR_CAUSAL: "observação contextual, sem indicar causa ou limite regulatório",
    ELEVATED_CONTEXT: "elevado no contexto analisado",
    NOT_EVALUATED: "não avaliado",
    UNKNOWN: "indisponível"
  };
  return value ? descriptions[value] ?? `estado informado pelo CORE: ${value}` : "não informado";
}

function renderMobileExperience(environment, devices, latest) {
  const device = devices.find(item => item.environment_id === environment.environment_id) ?? devices[0];
  const core = normalizeCoreResult(latest?.core_result);
  document.querySelector("#mobile-environment-name").textContent = environment.name ?? "Ambiente";
  document.querySelector("#mobile-environment-domain").textContent = environment.domain ? `Domain: ${environment.domain}` : "Domain não informado";
  document.querySelector("#mobile-device-label").textContent = device ? `Dispositivo ${device.device_id}` : "Sem dispositivo associado";
  document.querySelector("#mobile-device-status").textContent = device?.status
    ? `Cadastro: ${device.status}`
    : environment.status ? `Ambiente: ${environment.status}` : "Estado não informado";
  document.querySelector("#mobile-reading-time").textContent = latest
    ? `${measurementTimeLabel(latest)} · recebida ${formatDate(latest.received_at)}`
    : "Aguardando leitura";

  const currentTarget = document.querySelector("#mobile-current-content");
  const mobileMetrics = PRIMARY_METRICS.filter(([, field]) => ["temperature", "humidity", "dew_point", "co2", "pm25", "pm10"].includes(field));
  currentTarget.innerHTML = latest
    ? `<div class="mobile-reading-grid">${metricCards(mobileMetrics, latest, core, "mobile-reading-card")}</div>${complementaryReadings(latest, core)}`
    : '<p class="mobile-empty">Esta leitura não contém medições disponíveis.</p>';

  const scenario = coreScenario(core);
  const actionData = coreActions(core);
  const action = actionData.primary;
  const scenarioTarget = document.querySelector("#mobile-scenario-content");
  const diagnoses = getCoreSection(core, "diagnoses", "diagnosis");
  const scenarioHtml = scenario
    ? `<article class="mobile-feature-card"><span class="mobile-data-origin">RESULTADO DO CORE</span><h3>${escapeHtml(scenario.title ?? scenario.name ?? "Cenário")}</h3>${scenario.description ? `<p>${escapeHtml(scenario.description)}</p>` : ""}</article>`
    : "";
  const diagnosisHtml = itemList(diagnoses, "mobile-info-card").join("");
  scenarioTarget.innerHTML = scenarioHtml || diagnosisHtml
    ? `${scenarioHtml}${diagnosisHtml}`
    : '<p class="mobile-empty">Esta leitura não contém cenário ou diagnóstico do CORE.</p>';

  const impactItems = getCoreSection(core, "impacts", "impacts");
  const relationships = coreRelationships(core);
  const impactHtml = `${itemList(relationships.map(item => ({ ...item, title: item.title ?? item.name, status: "Relação identificada" }))).join("")}${itemList(impactItems).join("")}`;
  const impactResolution = core?.impactResolution;
  const impactEmpty = resolutionMessage("impact", impactResolution?.status ?? (impactItems.length || relationships.length ? "MATCHED" : undefined));
  document.querySelector("#mobile-impacts-content").innerHTML = impactHtml || `<p class="mobile-empty">${escapeHtml(impactEmpty)}</p>`;

  const actionTarget = document.querySelector("#mobile-action-content");
  if (action) {
    const followUp = core?.followUp ?? action.followUp ?? core?.mitigation?.followUp;
    actionTarget.innerHTML = `<article class="mobile-action-card"><span class="mobile-data-origin">AÇÃO INFORMADA PELO CORE</span><h3>${escapeHtml(action.title ?? action.name ?? "Ação")}</h3>${action.description ? `<p>${escapeHtml(action.description)}</p>` : ""}${action.priority !== undefined ? `<small>Prioridade informada pelo CORE: ${escapeHtml(action.priority)}</small>` : ""}${Array.isArray(action.referenceIds) && action.referenceIds.length ? `<small>Referências do CORE: ${escapeHtml(action.referenceIds.join(", "))}</small>` : ""}${followUp ? `<p><strong>Acompanhar:</strong> ${escapeHtml(typeof followUp === "string" ? followUp : followUp.description ?? followUp.message ?? "Orientação de acompanhamento informada pelo CORE")}</p>` : ""}</article>${itemList(actionData.additional).join("")}`;
  } else {
    const legacyNoAction = Array.isArray(core?.actions?.recommendations) && core.actions.recommendations.length === 0 && !core.actions.primary;
    const actionEmpty = resolutionMessage("action", core?.mitigation?.status ?? (legacyNoAction ? "NONE_IDENTIFIED" : undefined));
    actionTarget.innerHTML = `<p class="mobile-empty">${escapeHtml(actionEmpty)}</p>`;
  }

  const evidence = getCoreSection(core, "evidence", "evidence");
  const hypotheses = getCoreSection(core, "hypotheses", "hypotheses");
  const referenceData = core?.foundation?.references ?? core?.references?.items ?? [];
  const references = Array.isArray(referenceData) ? referenceData : referenceData?.items ?? [];
  const foundationTarget = document.querySelector("#mobile-foundation-content");
  const validationRows = coreParameters(core).map(parameter => {
    const state = parameterStatus(parameter);
    const criterion = parameter.observationReference ?? parameter.reference;
    const reference = criterion?.sourceCode ?? criterion?.sourceId ?? "";
    const period = criterion?.period ?? parameter.evaluationPeriod ?? "";
    const value = parameterReading(latest, parameter.parameter);
    return `<article class="mobile-info-card validation-card"><h3>${escapeHtml(parameterLabel(parameter.parameter))}</h3><span class="mobile-data-badge">${escapeHtml(assessmentLabel(state))}</span><p>Leitura: ${escapeHtml(formatValue(value, criterion?.unit ? ` ${criterion.unit}` : ""))}${period ? ` · Período: ${escapeHtml(period)}` : ""}${reference ? ` · Referência associada: ${escapeHtml(reference)}` : ""}${parameter.currentAssessmentIsObservational || parameter.assessmentNature === "OBSERVATIONAL" ? " · Natureza observacional" : ""}</p>${parameter.historicalMeanRequired || parameter.historicalAssessmentStatus === "REQUIRED_NOT_EVALUATED" ? `<p>Avaliação histórica: ${escapeHtml(assessmentLabel(parameter.historicalAssessmentStatus ?? "REQUIRED_NOT_EVALUATED"))}.</p>` : ""}</article>`;
  }).join("");
  const validation = validationRows ? `<details class="core-detail"><summary>Estados dos parâmetros avaliados (${coreParameters(core).length})</summary>${validationRows}</details>` : "";
  const partialContract = core?.publicResponseV1Complete === false ? '<p class="mobile-empty">O resultado público do CORE está parcial nesta versão; esta tela apresenta somente os campos recebidos.</p>' : "";
  const foundationHtml = [
    ...itemList(diagnoses, "mobile-info-card"),
    ...itemList(evidence, "mobile-info-card evidence-card"),
    ...itemList(hypotheses, "mobile-info-card hypothesis-card"),
    validation,
    partialContract,
    ...itemList(references, "mobile-reference-card")
  ].join("");
  foundationTarget.innerHTML = foundationHtml || '<p class="mobile-empty">O CORE não retornou evidências ou hipóteses correspondentes nesta leitura.</p>';

  const coreMetrics = core?.metrics ?? core?.now?.metrics;
  const co2Note = coreMetrics?.co2Available || coreMetrics?.co2Elevated !== undefined
    ? `CO₂: ${escapeHtml(describeCoreMetric(coreMetrics.co2Interpretation ?? coreMetrics.co2Level))} · avaliação histórica: ${escapeHtml(describeCoreMetric(coreMetrics.co2HistoricalAssessment))}` : "";
  const assessmentState = core?.finalAssessment?.state ?? core?.status;
  const assessmentMessage = core?.finalAssessment?.message ?? core?.message;
  const finalAssessmentNote = assessmentState || assessmentMessage
    ? `<p class="mobile-empty"><strong>${escapeHtml(coreAssessmentLabel(assessmentState))}</strong>${assessmentMessage ? `<br>${escapeHtml(assessmentMessage)}` : ""}${core?.finalAssessment?.regulatoryComplianceConclusion === "NOT_ASSESSED" || core?.regulatoryComplianceConclusion === "NOT_ASSESSED" ? "<br>Conformidade regulatória não avaliada." : ""}</p>` : "";
  const historicalNotes = coreParameters(core)
    .filter(parameter => parameter.historicalAssessmentStatus === "REQUIRED_NOT_EVALUATED")
    .map(parameter => `<p class="mobile-empty">${escapeHtml(parameter.parameter)}: avaliação histórica necessária e não realizada.</p>`).join("");
  const syncStatus = latest ? `${latest.firmware_version ? `Firmware ${escapeHtml(latest.firmware_version)}` : "Firmware não informado"} · ${latest.time_source ? `horário ${escapeHtml(latest.time_source)}` : "fonte do horário não informada"}${latest.signal_strength !== null && latest.signal_strength !== undefined ? ` · RSSI ${escapeHtml(formatValue(latest.signal_strength))}` : ""}` : "";
  currentTarget.insertAdjacentHTML("beforeend", `${finalAssessmentNote}${syncStatus ? `<p class="mobile-empty">${syncStatus}</p>` : ""}${co2Note ? `<p class="mobile-empty">${co2Note}</p>` : ""}${historicalNotes}`);
}

function renderEnvironments(environments, devices) {
  const target = document.querySelector("#environment-list");
  if (!environments.length) {
    target.innerHTML = '<div class="empty-card"><span class="empty-glyph">◇</span><div><h3>Nenhum ambiente autorizado</h3><p>A consulta não retornou ambientes para esta conta.</p></div></div>';
    return;
  }
  target.innerHTML = environments.map(environment => {
    const attached = devices.filter(device => device.environment_id === environment.environment_id);
    const attachedList = attached.map(device => `Dispositivo ${escapeHtml(device.device_id)}`).join(", ");
    return `<article class="environment-card"><div class="environment-card-head"><span class="environment-glyph office">◇</span><span class="status-pill">${escapeHtml(environment.status ?? "Estado não informado")}</span></div><p class="domain-label">DOMAIN</p><div class="environment-title-line"><h3>${escapeHtml(environment.name)}</h3></div><div class="environment-summary"><span>${attachedList || "Nenhum dispositivo associado"}</span><span class="summary-separator"></span><b>${escapeHtml(environment.domain ?? "Domain não informado")}</b></div></article>`;
  }).join("");
}

function renderDevices(devices, environments, readings) {
  const target = document.querySelector("#device-rows");
  if (!devices.length) {
    target.innerHTML = '<tr><td colspan="5"><div class="table-empty"><span class="empty-glyph">◉</span><strong>Nenhum dispositivo autorizado</strong><small>A consulta não retornou dispositivos para esta conta.</small></div></td></tr>';
    return;
  }
  const latestByDevice = new Map();
  readings.forEach(reading => {
    if (!latestByDevice.has(reading.device_id)) latestByDevice.set(reading.device_id, reading);
  });
  target.innerHTML = devices.map(device => {
    const environment = environments.find(item => item.environment_id === device.environment_id);
    const latest = latestByDevice.get(device.device_id);
    return `<tr><td><div class="device-cell"><span class="device-avatar">◉</span><span><strong>Dispositivo ${escapeHtml(device.device_id)}</strong><small>ID: ${escapeHtml(device.device_id)}</small></span></div></td><td>${escapeHtml(environment?.name ?? "—")}</td><td><span class="table-status">${escapeHtml(device.status ?? "—")}</span></td><td>${escapeHtml(formatDate(device.activated_at))}</td><td>${escapeHtml(formatDate(latest?.received_at))}</td></tr>`;
  }).join("");
}

function renderReadings(readings) {
  const target = document.querySelector("#reading-list");
  if (!readings.length) {
    target.innerHTML = '<div class="empty-state"><span class="empty-glyph">↗</span><strong>Nenhuma leitura disponível</strong><p>O ambiente ainda não possui leituras para exibir.</p></div>';
    return;
  }
  target.innerHTML = readings.slice(0, 8).map(reading => {
    const measured = escapeHtml(measurementTimeLabel(reading));
    const core = normalizeCoreResult(reading.core_result);
    return `<article class="reading-row"${reading.reading_id ? ` data-reading-id="${escapeHtml(reading.reading_id)}"` : ""}><div class="reading-row-head"><strong>${measured}</strong><small>Recebida: ${escapeHtml(formatDate(reading.received_at))}${reading.reading_id ? ` · ID ${escapeHtml(reading.reading_id)}` : ""}</small></div><div class="reading-values">${PRIMARY_METRICS.map(([label, field, unit, parameter]) => `<span>${label} <b>${sensorValue(parameterReading(reading, parameter ?? field), unit, core, parameter ?? field)}</b></span>`).join("")}</div>${complementaryReadings(reading, core)}</article>`;
  }).join("");
}

function publicCoreItems(items, kind = "") {
  if (!items.length) return "";
  const statusLabel = { MATCH: "Identificado", MATCHED: "Identificado", POSSIBLE: "Possível", NONE_IDENTIFIED: "Nenhum identificado" };
  return items.map(item => `<article class="core-public-item ${kind}"><div class="core-public-item-head"><strong>${escapeHtml(item.title ?? item.name ?? item.code ?? item.id ?? "Informação do CORE")}</strong>${item.priority !== undefined ? `<span>Prioridade ${escapeHtml(item.priority)}</span>` : ""}${item.status ? `<span>${escapeHtml(statusLabel[item.status] ?? item.status)}</span>` : ""}</div>${item.code ? `<small>${escapeHtml(item.code)}${item.year ? ` · ${escapeHtml(item.year)}` : ""}${item.publisher ? ` · ${escapeHtml(item.publisher)}` : ""}</small>` : ""}${item.description ? `<p>${escapeHtml(item.description)}</p>` : ""}${item.basis ? `<p>${escapeHtml(item.basis)}</p>` : ""}${item.approvalStatus ? `<small>Situação informada: ${escapeHtml(item.approvalStatus)}</small>` : ""}${item.reviewRequired === true ? '<small>Revisão técnica pendente conforme o dado recebido.</small>' : ""}${item.regulatory === false ? '<small>Observação não regulatória</small>' : ""}${Array.isArray(item.referenceIds) && item.referenceIds.length ? `<small>Referências disponíveis: ${escapeHtml(item.referenceIds.join(", "))}</small>` : ""}${item.url && /^https:\/\//i.test(item.url) ? `<a class="core-reference-link" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">Abrir referência</a>` : ""}</article>`).join("");
}

function renderCoreResult(coreInput, reading) {
  const core = normalizeCoreResult(coreInput);
  const scenario = coreScenario(core);
  const assessment = core?.finalAssessment ?? {};
  const diagnoses = getCoreSection(core, "diagnoses", "diagnosis");
  const evidence = getCoreSection(core, "evidence", "evidence");
  const hypotheses = getCoreSection(core, "hypotheses", "hypotheses");
  const impacts = getCoreSection(core, "impacts", "impacts");
  const relationships = coreRelationships(core);
  const actions = coreActions(core);
  const referencesData = core?.foundation?.references ?? core?.references?.items ?? [];
  const references = Array.isArray(referencesData) ? referencesData : referencesData?.items ?? [];
  const actionStatus = core?.mitigation?.status ?? (Array.isArray(core?.actions?.recommendations) && !actions.primary ? "NONE_IDENTIFIED" : null);
  const impactStatus = core?.impactResolution?.status;
  const mainTitle = diagnoses[0]?.title ?? coreAssessmentLabel(assessment.state ?? core?.status);
  const attention = assessment.state ?? core?.status;
  const followUp = core?.followUp ?? actions.primary?.followUp ?? core?.mitigation?.followUp;
  const followUpText = typeof followUp === "string" ? followUp : followUp?.description ?? followUp?.message;
  const scenarioContent = scenario
    ? `<span class="core-origin">Cenário informado pelo CORE</span><h3>${escapeHtml(scenario.title ?? scenario.name ?? "Cenário")}</h3><p>${escapeHtml(scenario.description ?? "")}</p><small>Estado: ${escapeHtml(core?.environmentalScenario?.status ?? (core?.scenario?.available ? "Disponível" : "Informado"))}</small>${publicCoreItems(diagnoses, "diagnosis")}`
    : `<p>${escapeHtml(core?.environmentalScenario?.status ? assessmentLabel(core.environmentalScenario.status) : "O CORE não retornou cenário nesta leitura.")}</p>${publicCoreItems(diagnoses, "diagnosis")}`;
  const actionContent = actions.primary
    ? publicCoreItems([actions.primary, ...actions.additional], "action") + (followUp ? `<p class="core-follow-up"><strong>Acompanhar:</strong> ${escapeHtml(followUpText ?? "Acompanhamento informado pelo CORE")}</p>` : "")
    : `<p class="core-empty-state">${escapeHtml(resolutionMessage("action", actionStatus))}</p>`;
  const impactContent = `${publicCoreItems(relationships, "relationship")}${publicCoreItems(impacts, "impact")}${!relationships.length && !impacts.length ? `<p class="core-empty-state">${escapeHtml(resolutionMessage("impact", impactStatus))}</p>` : ""}`;
  const parameterRows = coreParameters(core).map(parameter => {
    const criterion = parameter.observationReference ?? parameter.reference;
    const state = parameterStatus(parameter);
    const value = parameterReading(reading, parameter.parameter);
    return `<article class="core-validation-row"><strong>${escapeHtml(parameterLabel(parameter.parameter))}</strong><span>${escapeHtml(formatValue(value, criterion?.unit ? ` ${criterion.unit}` : ""))}</span><span>${escapeHtml(assessmentLabel(state))}</span>${criterion?.period || parameter.evaluationPeriod ? `<small>Período: ${escapeHtml(criterion?.period ?? parameter.evaluationPeriod)}</small>` : ""}${criterion?.sourceCode || criterion?.sourceId ? `<small>Referência associada: ${escapeHtml(criterion.sourceCode ?? criterion.sourceId)}</small>` : ""}${parameter.currentAssessmentIsObservational || parameter.assessmentNature === "OBSERVATIONAL" ? '<small>Natureza observacional; não representa conclusão regulatória.</small>' : ""}</article>`;
  }).join("");
  const parameters = parameterRows ? `<details class="core-detail"><summary>Estados dos parâmetros avaliados (${coreParameters(core).length})</summary>${parameterRows}</details>` : "";
  const foundationContent = `${core?.publicResponseV1Complete === false ? '<p class="core-contract-note">Resultado público parcial: esta área apresenta apenas os campos fornecidos pelo contrato atual.</p>' : ""}${publicCoreItems(evidence, "evidence")}${publicCoreItems(hypotheses, "hypothesis")}${parameters}${publicCoreItems(references, "reference")}${!evidence.length && !hypotheses.length && !parameters && !references.length ? '<p class="core-empty-state">O CORE não retornou fundamento correspondente nesta leitura.</p>' : ""}`;
  const analysisMessage = assessment.message ?? core?.message;
  const coreAgora = document.querySelector("#desktop-core-agora");
  coreAgora.innerHTML = `<span class="core-status-badge">${escapeHtml(coreAssessmentLabel(attention))}</span><h3>${escapeHtml(mainTitle)}</h3>${analysisMessage ? `<p>${escapeHtml(analysisMessage)}</p>` : '<p>O CORE não retornou uma mensagem para esta leitura.</p>'}${assessment.regulatoryComplianceConclusion === "NOT_ASSESSED" || core?.regulatoryComplianceConclusion === "NOT_ASSESSED" ? '<small>Conclusão de conformidade regulatória: não avaliada.</small>' : ""}${reading?.reading_id ? `<small>Identificador desta leitura: ${escapeHtml(reading.reading_id)}</small>` : ""}`;
  document.querySelector("#desktop-core-cenario").innerHTML = scenarioContent;
  document.querySelector("#desktop-core-impactos").innerHTML = impactContent;
  document.querySelector("#desktop-core-acao").innerHTML = actionContent;
  document.querySelector("#desktop-core-fundamento").innerHTML = foundationContent;
}

async function loadDashboard() {
  if (!db) return;
  setMessage("Carregando os dados do ambiente…", "info");
  notice.hidden = true;
  try {
    const readingsPromise = (async () => {
      const expanded = await db.from("sensor_readings").select("reading_id,device_id,environment_id,measured_at,received_at,time_status,time_source,signal_strength,firmware_version,temperature,dew_point,humidity,co2,co,pm1_0,pm25,pm4_0,pm10,nc0_5,nc1_0,nc2_5,nc4_0,nc10_0,typical_size,voc_index,nox_index,core_result").order("received_at", { ascending: false, nullsFirst: false }).limit(50);
      if (!expanded.error || !["42501", "42703", "PGRST204"].includes(expanded.error.code)) return { result: expanded, limited: false };
      const compatible = await db.from("sensor_readings").select("reading_id,device_id,environment_id,measured_at,received_at,time_status,firmware_version,temperature,dew_point,humidity,co2,co,pm1_0,pm25,pm4_0,pm10,voc_index,nox_index,core_result").order("received_at", { ascending: false, nullsFirst: false }).limit(50);
      return { result: compatible, limited: !compatible.error };
    })();
    const [clientsResult, environmentsResult, devicesResult, readingsQuery, deviceCountResult, activeCountResult, environmentCountResult, readingCountResult] = await Promise.all([
      db.from("clients").select("client_id,name,status"),
      db.from("environments").select("environment_id,client_id,name,domain,status,created_at").order("created_at", { ascending: true }),
      db.from("devices").select("device_id,environment_id,status,created_at,activated_at").order("created_at", { ascending: true }),
      readingsPromise,
      db.from("devices").select("device_id", { count: "exact", head: true }),
      db.from("devices").select("device_id", { count: "exact", head: true }).eq("status", "ACTIVE"),
      db.from("environments").select("environment_id", { count: "exact", head: true }),
      db.from("sensor_readings").select("reading_id", { count: "exact", head: true })
    ]);
    const readingsResult = readingsQuery.result;
    const firstError = [clientsResult, environmentsResult, devicesResult, readingsResult, deviceCountResult, activeCountResult, environmentCountResult, readingCountResult].find(result => result.error)?.error;
    if (firstError) throw firstError;

    const clients = clientsResult.data ?? [];
    const environments = environmentsResult.data ?? [];
    const devices = devicesResult.data ?? [];
    const readings = readingsResult.data ?? [];
    const selectedEnvironment = environments.find(item => item.environment_id === readings[0]?.environment_id) ?? environments[0];
    const selectedDevice = selectedEnvironment ? devices.find(item => item.environment_id === selectedEnvironment.environment_id) : devices[0];
    const environmentReadings = selectedEnvironment ? readings.filter(item => item.environment_id === selectedEnvironment.environment_id) : readings;
    const latestReading = environmentReadings[0] ?? readings[0];
    document.querySelector("#desktop-environment-title").textContent = selectedEnvironment?.name ?? "Visão geral";
    document.querySelector("#desktop-environment-context").textContent = [selectedDevice ? `Dispositivo ${selectedDevice.device_id}` : "Sem dispositivo associado", selectedEnvironment?.domain ? `Domain: ${selectedEnvironment.domain}` : "Domain não informado", selectedDevice?.status ? `Cadastro: ${selectedDevice.status}` : "Estado do dispositivo não informado"].join(" · ");
    if (readingsQuery.limited) {
      notice.hidden = false;
      notice.innerHTML = '<span class="notice-icon">i</span><span><strong>Leituras complementares não liberadas.</strong> As medições principais seguem disponíveis; contagem de partículas, tamanho típico e dados de sinal dependem da permissão de leitura das colunas adicionais.</span>';
    }
    document.querySelector("#device-count").textContent = deviceCountResult.count ?? "—";
    document.querySelector("#active-device-count").textContent = activeCountResult.count ?? "—";
    document.querySelector("#environment-count").textContent = environmentCountResult.count ?? "—";
    document.querySelector("#reading-count").textContent = readingCountResult.count ?? "—";
      document.querySelector("#last-updated").innerHTML = `<i></i> Última recebida: ${escapeHtml(formatDate(latestReading?.received_at))}`;
    if (clients[0]) document.querySelector(".tenant-copy strong").textContent = clients[0].name ?? "Cliente";
    renderEnvironments(environments, devices);
    renderDevices(devices, environments, readings);
    renderReadings(environmentReadings);
    renderCurrentReadings(latestReading);
    renderCoreResult(latestReading?.core_result, latestReading);
      const mobileEnvironment = selectedEnvironment;
      if (mobileEnvironment) renderMobileExperience(mobileEnvironment, devices, latestReading);
      else {
        document.querySelector("#mobile-environment-name").textContent = "Ambiente indisponível";
        document.querySelector("#mobile-current-content").innerHTML = '<p class="mobile-empty">Nenhum ambiente foi disponibilizado para esta conta.</p>';
      }
      setMessage("Dados do ambiente atualizados.", "success");
  } catch (error) {
    notice.hidden = false;
    notice.innerHTML = '<span class="notice-icon">!</span><span><strong>Não foi possível carregar as informações do ambiente.</strong> Tente novamente em alguns instantes.</span>';
    document.querySelector("#mobile-current-content").innerHTML = '<p class="mobile-empty">As informações do ambiente não estão disponíveis agora.</p>';
    setMessage("Não foi possível carregar os dados do ambiente agora.", "error");
  }
}

form.addEventListener("submit", async event => {
  event.preventDefault();
  if (!db) return;
  const submit = form.querySelector("button[type=submit]");
  submit.disabled = true;
  setMessage("Validando acesso…", "info");
  const { error } = await db.auth.signInWithPassword({
    email: document.querySelector("#login-email").value.trim(),
    password: document.querySelector("#login-password").value
  });
  submit.disabled = false;
  if (error) setMessage(error.message, "error");
});

logoutButton.addEventListener("click", async () => {
  if (db) await db.auth.signOut();
});
mobileLogoutButton.addEventListener("click", async () => {
  if (db) await db.auth.signOut();
});

if (db) {
  db.auth.onAuthStateChange((_event, session) => showAuthState(session));
} else {
  showAuthState(null);
}

const navLinks = document.querySelectorAll(".nav-link, .mobile-nav a");
navLinks.forEach(link => {
  link.addEventListener("click", () => {
    navLinks.forEach(item => item.classList.remove("active"));
    document.querySelectorAll(`a[href="${link.getAttribute("href")}"]`).forEach(item => item.classList.add("active"));
  });
});

const mobileTrack = document.querySelector("#mobile-step-track");
const mobileStepButtons = [...document.querySelectorAll("[data-mobile-step]")];
mobileStepButtons.forEach(button => {
  button.addEventListener("click", () => {
    const step = document.querySelectorAll(".mobile-step")[Number(button.dataset.mobileStep)];
    step?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" });
  });
});
const mobileStepObserver = new IntersectionObserver(entries => {
  const current = entries.filter(entry => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
  if (!current) return;
  const activeIndex = [...document.querySelectorAll(".mobile-step")].indexOf(current.target);
  mobileStepButtons.forEach((button, index) => {
    button.classList.toggle("active", index === activeIndex);
    if (index === activeIndex) button.setAttribute("aria-current", "step");
    else button.removeAttribute("aria-current");
  });
}, { root: mobileTrack, threshold: [0.6, 0.8] });
document.querySelectorAll(".mobile-step").forEach(step => mobileStepObserver.observe(step));

window.MIQAI_APP_READY = true;
