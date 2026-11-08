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
  return value === null || value === undefined || value === "" ? "—" : `${value}${unit}`;
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "medium" }).format(date);
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
    const badge = [item.severity, item.status].find(value => typeof value === "string") ?? "";
    return `<article class="${className}">${title ? `<h3>${escapeHtml(title)}</h3>` : ""}${badge ? `<span class="mobile-data-badge">${escapeHtml(badge)}</span>` : ""}${description ? `<p>${escapeHtml(description)}</p>` : ""}</article>`;
  }).filter(Boolean);
}

function getCoreSection(coreResult, v2Key, v1Key) {
  const foundation = coreResult?.foundation ?? {};
  const direct = coreResult?.[v1Key];
  return foundation[v2Key] ?? direct?.items ?? direct ?? [];
}

function renderMobileExperience(environment, devices, latest) {
  const device = devices.find(item => item.environment_id === environment.environment_id) ?? devices[0];
  document.querySelector("#mobile-environment-name").textContent = environment.name ?? "Ambiente";
  document.querySelector("#mobile-environment-domain").textContent = environment.domain ? `Domain: ${environment.domain}` : "Domain não informado";
  document.querySelector("#mobile-device-label").textContent = device ? `Dispositivo ${device.device_id}` : "Sem dispositivo associado";
  document.querySelector("#mobile-device-status").textContent = device?.status
    ? `Cadastro: ${device.status}`
    : environment.status ? `Ambiente: ${environment.status}` : "Estado não informado";
  document.querySelector("#mobile-reading-time").textContent = latest?.received_at
    ? `Recebida ${formatDate(latest.received_at)}`
    : "Aguardando leitura";

  const readingFields = [
    ["Temperatura", latest?.temperature, "°C", "🌡"], ["Umidade", latest?.humidity, "%", "◉"],
    ["CO₂", latest?.co2, "ppm", "☁"], ["Ponto de orvalho", latest?.dew_point, "°C", "♨"],
    ["PM2.5", latest?.pm25, "µg/m³", "✣"], ["PM10", latest?.pm10, "µg/m³", "✣"],
  ].filter(([, value]) => value !== null && value !== undefined && value !== "");
  const currentTarget = document.querySelector("#mobile-current-content");
  currentTarget.innerHTML = readingFields.length
    ? `<div class="mobile-reading-grid">${readingFields.map(([label, value, unit, icon]) => `<article class="mobile-reading-card"><span aria-hidden="true">${icon}</span><small>${label}</small><strong>${escapeHtml(formatValue(value, unit ? ` ${unit}` : ""))}</strong></article>`).join("")}</div>`
    : '<p class="mobile-empty">Esta leitura não contém medições disponíveis.</p>';

  const core = latest?.core_result;
  const scenario = core?.scenario?.primary ?? (core?.scenario?.available ? core.scenario : null);
  const action = core?.actions?.primary ?? core?.action?.primary;
  const scenarioTarget = document.querySelector("#mobile-scenario-content");
  const diagnoses = getCoreSection(core, "diagnoses", "diagnoses");
  const scenarioHtml = scenario
    ? `<article class="mobile-feature-card"><span class="mobile-data-origin">RESULTADO DO CORE</span><h3>${escapeHtml(scenario.title ?? scenario.name ?? "Cenário")}</h3>${scenario.description ? `<p>${escapeHtml(scenario.description)}</p>` : ""}</article>`
    : "";
  const diagnosisHtml = itemList(diagnoses, "mobile-info-card").join("");
  scenarioTarget.innerHTML = scenarioHtml || diagnosisHtml
    ? `${scenarioHtml}${diagnosisHtml}`
    : '<p class="mobile-empty">Esta leitura não contém cenário ou diagnóstico do CORE.</p>';

  const impacts = core?.impacts?.items ?? core?.impacts?.primary ?? [];
  const impactItems = Array.isArray(impacts) ? impacts : impacts ? [impacts] : [];
  const impactHtml = itemList(impactItems).join("");
  document.querySelector("#mobile-impacts-content").innerHTML = impactHtml || '<p class="mobile-empty">O CORE não forneceu impactos para esta leitura.</p>';

  const actionTarget = document.querySelector("#mobile-action-content");
  if (action) {
    const additional = core?.actions?.additional ?? core?.action?.additional ?? [];
    actionTarget.innerHTML = `<article class="mobile-action-card"><span class="mobile-data-origin">AÇÃO INFORMADA PELO CORE</span><h3>${escapeHtml(action.title ?? action.name ?? "Ação")}</h3>${action.description ? `<p>${escapeHtml(action.description)}</p>` : ""}</article>${itemList(additional).join("")}`;
  } else {
    actionTarget.innerHTML = '<p class="mobile-empty">O CORE não forneceu ação para esta leitura.</p>';
  }

  const evidence = getCoreSection(core, "evidence", "evidence");
  const hypotheses = getCoreSection(core, "hypotheses", "hypotheses");
  const referenceData = core?.foundation?.references ?? core?.references?.items ?? [];
  const references = Array.isArray(referenceData) ? referenceData : referenceData?.items ?? [];
  const foundationTarget = document.querySelector("#mobile-foundation-content");
  const foundationHtml = [
    ...itemList(evidence, "mobile-info-card evidence-card"),
    ...itemList(hypotheses, "mobile-info-card hypothesis-card"),
    ...itemList(references, "mobile-reference-card")
  ].join("");
  foundationTarget.innerHTML = foundationHtml || '<p class="mobile-empty">O CORE não forneceu evidências, hipóteses ou referências para esta leitura.</p>';
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
  target.innerHTML = readings.slice(0, 8).map(reading => `<article class="reading-row"><div class="reading-row-head"><strong>Medição: ${escapeHtml(formatDate(reading.measured_at))}</strong><small>Recebida: ${escapeHtml(formatDate(reading.received_at))}</small></div><div class="reading-values"><span>Temperatura <b>${escapeHtml(formatValue(reading.temperature, " °C"))}</b></span><span>Umidade <b>${escapeHtml(formatValue(reading.humidity, " %"))}</b></span><span>CO₂ <b>${escapeHtml(formatValue(reading.co2, " ppm"))}</b></span><span>PM2.5 <b>${escapeHtml(formatValue(reading.pm25, " µg/m³"))}</b></span><span>PM10 <b>${escapeHtml(formatValue(reading.pm10, " µg/m³"))}</b></span></div></article>`).join("");
}

function renderCoreResult(coreResult) {
  const target = document.querySelector("#core-result");
  const scenario = coreResult?.scenario?.primary;
  const action = coreResult?.actions?.primary;
  const diagnoses = coreResult?.foundation?.diagnoses ?? [];
  const evidence = coreResult?.foundation?.evidence ?? [];
  if (!coreResult || (!scenario && !action && !diagnoses.length && !evidence.length)) {
    target.innerHTML = '<span class="empty-glyph">✦</span><strong>Resultado CORE indisponível</strong><p>Não há conteúdo de CORE nesta leitura.</p>';
    return;
  }
  target.innerHTML = `<span class="result-version">${escapeHtml(coreResult.schemaVersion ?? "Versão não informada")}</span>${scenario ? `<h3>${escapeHtml(scenario.title ?? scenario.name ?? "Cenário")}</h3><p>${escapeHtml(scenario.description ?? "")}</p>` : ""}${action ? `<div class="core-action"><strong>${escapeHtml(action.title ?? "Ação")}</strong><p>${escapeHtml(action.description ?? "")}</p></div>` : ""}${diagnoses.length ? `<div class="core-list"><strong>Diagnósticos recebidos</strong>${diagnoses.map(item => `<p>${escapeHtml(item.title ?? "")}${item.description ? ` — ${escapeHtml(item.description)}` : ""}</p>`).join("")}</div>` : ""}${evidence.length ? `<div class="core-list"><strong>Evidências recebidas</strong>${evidence.map(item => `<p>${escapeHtml(item.title ?? "")}${item.description ? ` — ${escapeHtml(item.description)}` : ""}</p>`).join("")}</div>` : ""}`;
}

async function loadDashboard() {
  if (!db) return;
  setMessage("Carregando os dados do ambiente…", "info");
  notice.hidden = true;
  try {
    const [clientsResult, environmentsResult, devicesResult, readingsResult, deviceCountResult, activeCountResult, environmentCountResult, readingCountResult] = await Promise.all([
      db.from("clients").select("client_id,name,status"),
      db.from("environments").select("environment_id,client_id,name,domain,status,created_at").order("created_at", { ascending: true }),
      db.from("devices").select("device_id,environment_id,status,created_at,activated_at").order("created_at", { ascending: true }),
      db.from("sensor_readings").select("reading_id,device_id,environment_id,measured_at,received_at,time_status,firmware_version,temperature,dew_point,humidity,co2,co,pm1_0,pm25,pm4_0,pm10,voc_index,nox_index,core_result").order("received_at", { ascending: false, nullsFirst: false }).limit(50),
      db.from("devices").select("device_id", { count: "exact", head: true }),
      db.from("devices").select("device_id", { count: "exact", head: true }).eq("status", "ACTIVE"),
      db.from("environments").select("environment_id", { count: "exact", head: true }),
      db.from("sensor_readings").select("reading_id", { count: "exact", head: true })
    ]);
    const firstError = [clientsResult, environmentsResult, devicesResult, readingsResult, deviceCountResult, activeCountResult, environmentCountResult, readingCountResult].find(result => result.error)?.error;
    if (firstError) throw firstError;

    const clients = clientsResult.data ?? [];
    const environments = environmentsResult.data ?? [];
    const devices = devicesResult.data ?? [];
    const readings = readingsResult.data ?? [];
    document.querySelector("#device-count").textContent = deviceCountResult.count ?? "—";
    document.querySelector("#active-device-count").textContent = activeCountResult.count ?? "—";
    document.querySelector("#environment-count").textContent = environmentCountResult.count ?? "—";
    document.querySelector("#reading-count").textContent = readingCountResult.count ?? "—";
      document.querySelector("#last-updated").innerHTML = `<i></i> Última recebida: ${escapeHtml(formatDate(readings[0]?.received_at))}`;
    if (clients[0]) document.querySelector(".tenant-copy strong").textContent = clients[0].name ?? "Cliente";
    renderEnvironments(environments, devices);
    renderDevices(devices, environments, readings);
    renderReadings(readings);
    renderCoreResult(readings[0]?.core_result);
      const mobileEnvironment = environments[0];
      if (mobileEnvironment) renderMobileExperience(mobileEnvironment, devices, readings[0]);
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
