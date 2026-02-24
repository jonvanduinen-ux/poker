const STORAGE_KEY = "poker-app-data-v1";
const PROFILE_KEY = "poker-player-profile-v1";
const ADMIN_PASSWORD = "pokernight";
const REMOTE_ROW_ID = 1;

const defaultData = {
  nextGameISO: defaultNextFridayAt7(),
  locationName: "Host Home",
  locationUrl: "https://maps.google.com",
  status: "Game ON",
  showPhones: false,
  players: [],
  history: []
};

let data = structuredClone(defaultData);
let supabaseClient = null;
let remoteEnabled = false;

const byId = (id) => document.getElementById(id);
const signupForm = byId("signup-form");
const playersList = byId("players");
const playerCountEl = byId("player-count");
const thresholdEl = byId("player-threshold");
const statusEl = byId("game-status");
const dateEl = byId("game-date");
const locationEl = byId("game-location");
const syncStatusEl = byId("sync-status");

const detailsModal = byId("details-modal");
const adminModal = byId("admin-modal");
const adminLoginForm = byId("admin-login-form");
const adminPanel = byId("admin-panel");

function defaultNextFridayAt7() {
  const now = new Date();
  const date = new Date(now);
  const day = date.getDay();
  const daysUntilFriday = (5 - day + 7) % 7 || 7;
  date.setDate(now.getDate() + daysUntilFriday);
  date.setHours(19, 0, 0, 0);
  return date.toISOString().slice(0, 16);
}

function loadLocalData() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return structuredClone(defaultData);
  try {
    return { ...defaultData, ...JSON.parse(raw) };
  } catch {
    return structuredClone(defaultData);
  }
}

function saveLocalData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function loadProfile() {
  const raw = localStorage.getItem(PROFILE_KEY);
  if (!raw) return;
  try {
    const profile = JSON.parse(raw);
    byId("name").value = profile.name || "";
    byId("phone").value = profile.phone || "";
    byId("note").value = profile.note || "";
  } catch {
    // ignore invalid profile payload
  }
}

function saveProfile(name, phone, note) {
  localStorage.setItem(PROFILE_KEY, JSON.stringify({ name, phone, note }));
}

function formatDateTime(iso) {
  const date = new Date(iso);
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function setSyncStatus(message, isRemote) {
  if (!syncStatusEl) return;
  syncStatusEl.textContent = message;
  syncStatusEl.className = isRemote ? "sync-status remote" : "sync-status local";
}

function updateView() {
  const count = data.players.length;
  const displayStatus = data.status === "Game ON" && count < 8 ? "Waiting for players" : data.status;
  statusEl.textContent = displayStatus;
  statusEl.style.background = displayStatus === "Game CANCELLED" ? "#933" : "#2f7a40";

  dateEl.textContent = formatDateTime(data.nextGameISO);
  locationEl.textContent = data.locationName;
  locationEl.href = data.locationUrl;

  playerCountEl.textContent = String(count);
  if (count < 8) {
    thresholdEl.textContent = `We need ${8 - count} more players to reach 8`;
    thresholdEl.className = "threshold low";
  } else {
    thresholdEl.textContent = "Game on";
    thresholdEl.className = "threshold good";
  }

  renderPlayers();
  renderHistory();
  byId("text-list").value = data.players.map((p) => p.phone).join(", ");
}

function renderPlayers() {
  playersList.innerHTML = "";
  if (!data.players.length) {
    playersList.innerHTML = "<li>No one yet — be first!</li>";
    return;
  }
  for (const player of data.players) {
    const li = document.createElement("li");
    const phone = data.showPhones ? ` | ${player.phone}` : " | (hidden)";
    const note = player.note ? ` | Note: ${player.note}` : "";
    li.textContent = `${player.name}${phone}${note}`;
    playersList.appendChild(li);
  }
}

function renderHistory() {
  const list = byId("history-list");
  list.innerHTML = "";
  if (!data.history.length) {
    list.innerHTML = "<li>No history yet.</li>";
    return;
  }

  data.history.slice().reverse().forEach((game, idx) => {
    const li = document.createElement("li");
    li.textContent = `${data.history.length - idx}. ${formatDateTime(game.nextGameISO)} at ${game.locationName} (${game.status}) — ${game.players.length} players`;
    list.appendChild(li);
  });
}

function initSupabase() {
  const cfg = window.POKER_CONFIG || {};
  if (!window.supabase || !cfg.supabaseUrl || !cfg.supabaseAnonKey) {
    remoteEnabled = false;
    return;
  }
  supabaseClient = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
  remoteEnabled = true;
}

async function loadRemoteData() {
  const { data: row, error } = await supabaseClient
    .from("poker_state")
    .select("id, data")
    .eq("id", REMOTE_ROW_ID)
    .maybeSingle();

  if (error) throw error;

  if (!row) {
    await saveRemoteData();
    return;
  }

  data = { ...defaultData, ...(row.data || {}) };
  saveLocalData();
}

async function saveRemoteData() {
  const payload = { id: REMOTE_ROW_ID, data, updated_at: new Date().toISOString() };
  const { error } = await supabaseClient.from("poker_state").upsert(payload, { onConflict: "id" });
  if (error) throw error;
}

function subscribeRemoteChanges() {
  supabaseClient
    .channel("poker-state-live")
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "poker_state", filter: `id=eq.${REMOTE_ROW_ID}` },
      (payload) => {
        data = { ...defaultData, ...(payload.new.data || {}) };
        saveLocalData();
        updateView();
      }
    )
    .subscribe();
}

async function saveData() {
  saveLocalData();
  if (!remoteEnabled) return;
  try {
    await saveRemoteData();
    setSyncStatus("Storage: Synced with Supabase", true);
  } catch {
    setSyncStatus("Storage: Local fallback (Supabase save failed)", false);
  }
}

signupForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(signupForm);
  const name = String(form.get("name") || "").trim();
  const phone = String(form.get("phone") || "").trim();
  const note = String(form.get("note") || "").trim();
  if (!name || !phone) return;

  const existing = data.players.find((p) => p.name.toLowerCase() === name.toLowerCase());
  if (existing) {
    existing.phone = phone;
    existing.note = note;
  } else {
    data.players.push({ name, phone, note });
  }

  saveProfile(name, phone, note);
  await saveData();
  updateView();
  signupForm.reset();
  loadProfile();
});

byId("more-details-link").addEventListener("click", (event) => {
  event.preventDefault();
  detailsModal.showModal();
});
byId("details-close").addEventListener("click", () => detailsModal.close());

byId("admin-open").addEventListener("click", () => adminModal.showModal());
byId("admin-cancel").addEventListener("click", () => adminModal.close());
byId("admin-close").addEventListener("click", () => {
  adminPanel.classList.add("hidden");
  adminLoginForm.classList.remove("hidden");
  adminModal.close();
});

adminLoginForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const password = byId("admin-password").value;
  if (password !== ADMIN_PASSWORD) {
    byId("admin-error").textContent = "Incorrect password.";
    return;
  }
  byId("admin-error").textContent = "";
  adminLoginForm.classList.add("hidden");
  adminPanel.classList.remove("hidden");

  byId("admin-date").value = data.nextGameISO;
  byId("admin-location-name").value = data.locationName;
  byId("admin-location-url").value = data.locationUrl;
  byId("admin-status").value = data.status;
  byId("admin-show-phones").checked = data.showPhones;
});

adminPanel.addEventListener("submit", async (event) => {
  event.preventDefault();
  data.nextGameISO = byId("admin-date").value;
  data.locationName = byId("admin-location-name").value.trim() || "Host Home";
  data.locationUrl = byId("admin-location-url").value.trim() || "https://maps.google.com";
  data.status = byId("admin-status").value;
  data.showPhones = byId("admin-show-phones").checked;

  await saveData();
  updateView();
});

byId("copy-text-list").addEventListener("click", async () => {
  const text = byId("text-list").value;
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // ignore clipboard errors
  }
});

byId("reset-month").addEventListener("click", async () => {
  data.history.push({
    nextGameISO: data.nextGameISO,
    locationName: data.locationName,
    status: data.status,
    players: data.players
  });
  data.players = [];
  data.nextGameISO = defaultNextFridayAt7();
  data.status = "Game ON";

  await saveData();
  updateView();
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js"));
}

(async function boot() {
  loadProfile();
  data = loadLocalData();
  initSupabase();

  if (remoteEnabled) {
    try {
      await loadRemoteData();
      subscribeRemoteChanges();
      setSyncStatus("Storage: Synced with Supabase", true);
    } catch {
      setSyncStatus("Storage: Local fallback (Supabase unavailable)", false);
    }
  } else {
    setSyncStatus("Storage: Local-only mode (configure Supabase in config.js)", false);
  }

  updateView();
})();
