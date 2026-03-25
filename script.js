const STATIONS = {
    "192.168.104.191": "Altbau 191",
    "192.168.104.192": "Altbau 192",
    "192.168.104.193": "Neubau 193"
};

let currentIP = "";
let autoTriggerInterval = null;
let sseConnection = null;

const dom = {
    switcher: document.getElementById('stationSwitcher'),
    content: document.getElementById('mainContent'),
    pwdInput: document.getElementById('stationPwd'),
    triggerBtn: document.getElementById('triggerBtn'),
    triggerText: document.getElementById('triggerText'),
    progressBar: document.getElementById('progress'),
    permanentToggle: document.getElementById('permanentToggle'),
    systemStatus: document.getElementById('systemStatus'),
    relayStatus: document.getElementById('relayStatus'),
    toastContainer: document.getElementById('toastContainer'),
    themeToggle: document.getElementById('themeToggle')
};

document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    dom.switcher.addEventListener('change', (e) => loadStation(e.target.value));
    dom.pwdInput.addEventListener('change', savePassword);
    dom.triggerBtn.addEventListener('click', runTrigger);
    dom.permanentToggle.addEventListener('change', togglePermanent);
    dom.themeToggle.addEventListener('click', rotateTheme);
});

function loadStation(ip) {
    stopAutoTrigger();
    if (sseConnection) sseConnection.close();
    
    currentIP = ip;
    dom.content.style.visibility = 'visible';
    
    const saved = localStorage.getItem(`behnke_pwd_${ip}`);
    dom.pwdInput.value = saved || "";
    
    dom.permanentToggle.checked = false;
    updateSystemStatus(saved ? "Bereit" : "Passwort fehlt");
    updateRelayStatus("Unbekannt");
    
    showToast(`${STATIONS[ip]} geladen`);
    if(saved) startSSE();
}

function savePassword() {
    if(!currentIP) return;
    localStorage.setItem(`behnke_pwd_${currentIP}`, dom.pwdInput.value);
    showToast("Passwort gespeichert", "success");
    startSSE();
}

async function apiCall(cmd) {
    const pwd = dom.pwdInput.value;
    if (!pwd) return false;
    
    // WICHTIG: Behnke braucht oft 'key' als Parameter. 
    // Wir nutzen no-cors, damit der Browser die Antwort nicht blockiert.
    const url = `https://${currentIP}/?key=${encodeURIComponent(pwd)}&${cmd}&cors`;
    
    try {
        await fetch(url, { mode: 'no-cors', cache: 'no-cache' });
        return true;
    } catch (e) {
        console.error("API Error:", e);
        return false;
    }
}

function startSSE() {
    const pwd = dom.pwdInput.value;
    if (!currentIP || !pwd) return;

    if (sseConnection) sseConnection.close();
    
    updateSystemStatus("Verbinde...");
    
    // Port 8443 ist Standard für Behnke SSE
    const sseUrl = `https://${currentIP}:8443/?key=${encodeURIComponent(pwd)}&sse&all&cors`;

    try {
        sseConnection = new EventSource(sseUrl);

        sseConnection.onopen = () => {
            updateSystemStatus("Verbunden (Live)");
            showToast("Live-Verbindung aktiv", "success");
        };

        sseConnection.onmessage = (e) => {
            const msg = e.data.trim().toUpperCase();
            console.log("SSE-Daten:", msg); // Zur Diagnose in der F12-Konsole

            // --- VERBESSERTE LOGIK BASIEREND AUF DEINEM LOG ---
            
            // Suche nach "OPEN", "FREE" oder "STATE_ACCESS"
            if (/OPEN|FREE|STATE_ACCESS/.test(msg)) {
                updateRelayStatus("Offen");
            } 
            // Suche nach "CLOSED" oder "STATE_RUN"
            else if (/CLOSED|STATE_RUN/.test(msg)) {
                // Nur auf Geschlossen setzen, wenn kein Dauer-Modus aktiv ist
                if (!autoTriggerInterval) {
                    updateRelayStatus("Geschlossen");
                }
            }
        };

        sseConnection.onerror = (err) => {
            console.error("SSE Fehler:", err);
            updateSystemStatus("Verbindungsfehler (CORS?)");
            sseConnection.close();
            // Automatischer Reconnect alle 10 Sek.
            setTimeout(startSSE, 10000);
        };

    } catch (e) {
        updateSystemStatus("SSE nicht unterstützt");
    }
}

// --- Restliche Funktionen bleiben gleich ---

async function runTrigger() {
    if (dom.triggerBtn.disabled) return;
    updateSystemStatus("Sende Impuls...");
    const ok = await apiCall('api=trigger&relay=1');
    if (ok) {
        showToast("Impuls gesendet", "success");
        visualizeCountdown();
    }
}

function visualizeCountdown() {
    dom.triggerBtn.disabled = true;
    dom.triggerBtn.classList.add('active');
    dom.triggerText.textContent = "Aktiv";
    dom.progressBar.style.width = "100%";
    setTimeout(() => dom.progressBar.style.width = "0%", 50);
    setTimeout(() => {
        dom.triggerBtn.disabled = false;
        dom.triggerBtn.classList.remove('active');
        dom.triggerText.textContent = "Öffnen";
    }, 5000);
}

function togglePermanent() {
    if (dom.permanentToggle.checked) {
        startAutoTrigger();
        showToast("Daueröffnung EIN", "warning");
    } else {
        stopAutoTrigger();
        showToast("Daueröffnung AUS");
    }
}

function startAutoTrigger() {
    apiCall('api=trigger&relay=1');
    autoTriggerInterval = setInterval(() => apiCall('api=trigger&relay=1'), 5000);
    updateSystemStatus("Auto-Trigger AKTIV");
    updateRelayStatus("Offen");
}

function stopAutoTrigger() {
    if(autoTriggerInterval) {
        clearInterval(autoTriggerInterval);
        autoTriggerInterval = null;
    }
    updateSystemStatus("Bereit");
}

function updateSystemStatus(txt) { dom.systemStatus.textContent = txt; }
function updateRelayStatus(val) {
    dom.relayStatus.textContent = val;
    dom.relayStatus.className = `status-value relay-${val.toLowerCase()}`;
}
function showToast(m, type="info") {
    const t = document.createElement('div');
    t.className = `toast toast-${type}`;
    t.textContent = m;
    dom.toastContainer.appendChild(t);
    setTimeout(() => { t.style.opacity="0"; setTimeout(() => t.remove(), 400); }, 3000);
}
function rotateTheme() {
    const isDark = document.body.classList.toggle('dark-mode');
    localStorage.setItem('behnke_theme', isDark ? 'dark' : 'light');
}
function initTheme() {
    if (localStorage.getItem('behnke_theme') === 'dark') document.body.classList.add('dark-mode');
}