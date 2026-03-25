const STATIONS = {
    "192.168.104.191": "Altbau neue Pforte (191)",
    "192.168.104.192": "Altbau neue Pforte (192)",
    "192.168.104.193": "Neubau Pforte (193)"
};

let currentIP = "";
let autoTriggerInterval = null;
let sseConnection = null;

const dom = {
    switcher: document.getElementById('stationSwitcher'),
    nameDisplay: document.getElementById('currentStationName'),
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
    dom.nameDisplay.textContent = STATIONS[ip];
    dom.content.style.visibility = 'visible';
    
    // Passwort-Logik (IP-spezifisch)
    const saved = localStorage.getItem(`behnke_pwd_${ip}`);
    dom.pwdInput.value = saved || "";
    
    dom.permanentToggle.checked = false;
    updateSystemStatus(saved ? "Bereit" : "Passwort eingeben");
    updateRelayStatus("Unbekannt");
    
    showToast(`${STATIONS[ip]} geladen`);
    if(saved) startSSE();
}

function savePassword() {
    localStorage.setItem(`behnke_pwd_${currentIP}`, dom.pwdInput.value);
    showToast("Passwort gespeichert", "success");
    updateSystemStatus("Bereit");
    startSSE();
}

async function runTrigger() {
    if (dom.triggerBtn.disabled) return;
    const ok = await apiCall('api=trigger&relay=1');
    if (ok) {
        showToast("Öffne für 5 Sekunden", "success");
        visualizeCountdown();
    }
}

function visualizeCountdown() {
    dom.triggerBtn.disabled = true;
    dom.triggerBtn.classList.add('btn-active');
    dom.triggerText.textContent = "Geöffnet...";
    dom.progressBar.style.width = "100%";
    
    setTimeout(() => dom.progressBar.style.width = "0%", 50);
    setTimeout(() => {
        dom.triggerBtn.disabled = false;
        dom.triggerBtn.classList.remove('btn-active');
        dom.triggerText.textContent = "Temporär öffnen";
    }, 5000);
}

function togglePermanent() {
    if (dom.permanentToggle.checked) {
        startAutoTrigger();
        showToast("Daueröffnung aktiv", "warning");
    } else {
        stopAutoTrigger();
        showToast("Daueröffnung beendet");
    }
}

function startAutoTrigger() {
    apiCall('api=trigger&relay=1');
    autoTriggerInterval = setInterval(() => apiCall('api=trigger&relay=1'), 5000);
    updateSystemStatus("Auto-Trigger läuft");
}

function stopAutoTrigger() {
    clearInterval(autoTriggerInterval);
    autoTriggerInterval = null;
    updateSystemStatus("Bereit");
}

async function apiCall(cmd) {
    const pwd = dom.pwdInput.value;
    if (!pwd) { showToast("Passwort fehlt!", "error"); return false; }
    
    try {
        await fetch(`https://${currentIP}/?key=${encodeURIComponent(pwd)}&${cmd}&cors`, { mode: 'no-cors' });
        return true;
    } catch (e) {
        showToast("API Fehler", "error");
        return false;
    }
}

function startSSE() {
    const pwd = dom.pwdInput.value;
    if (sseConnection) sseConnection.close();
    
    updateSystemStatus("Verbinde...");
    sseConnection = new EventSource(`https://${currentIP}:8443/?key=${encodeURIComponent(pwd)}&sse&all&cors`);

    sseConnection.onopen = () => updateSystemStatus("Verbunden");
    sseConnection.onmessage = (e) => {
        const d = e.data.toUpperCase();
        if (d.includes('OPEN') || d.includes('FREE') || d.includes('RELAY_CONTACT_1 1')) {
            updateRelayStatus("Offen");
        } else if (d.includes('CLOSED') || d.includes('RELAY_CONTACT_1 0')) {
            updateRelayStatus("Geschlossen");
        }
    };
    sseConnection.onerror = () => updateSystemStatus("Verbindung verloren");
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