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
    updateSystemStatus(saved ? "Bereit" : "Passwort eingeben");
    updateRelayStatus("Unbekannt");
    
    showToast(`${STATIONS[ip]} ausgewählt`);
    if(saved) startSSE();
}

function savePassword() {
    if(!currentIP) return;
    localStorage.setItem(`behnke_pwd_${currentIP}`, dom.pwdInput.value);
    showToast("Passwort gespeichert", "success");
    updateSystemStatus("Bereit");
    startSSE();
}

async function runTrigger() {
    if (dom.triggerBtn.disabled) return;
    const ok = await apiCall('api=trigger&relay=1');
    if (ok) {
        showToast("Öffnungs-Impuls gesendet", "success");
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
        showToast("Daueröffnung AKTIV", "warning");
    } else {
        stopAutoTrigger();
        showToast("Daueröffnung DEAKTIVIERT");
    }
}

function startAutoTrigger() {
    apiCall('api=trigger&relay=1');
    autoTriggerInterval = setInterval(() => apiCall('api=trigger&relay=1'), 5000);
    updateSystemStatus("Auto-Trigger läuft...");
}

function stopAutoTrigger() {
    if(autoTriggerInterval) {
        clearInterval(autoTriggerInterval);
        autoTriggerInterval = null;
    }
    updateSystemStatus("Bereit");
}

async function apiCall(cmd) {
    const pwd = dom.pwdInput.value;
    if (!pwd) return false;
    try {
        // Wir senden den Befehl "blind" (no-cors), da die Hardware oft nicht korrekt auf OPTIONS reagiert
        await fetch(`https://${currentIP}/?key=${encodeURIComponent(pwd)}&${cmd}&cors`, { mode: 'no-cors' });
        return true;
    } catch (e) { return false; }
}

function startSSE() {
    const pwd = dom.pwdInput.value;
    if (sseConnection) sseConnection.close();
    
    updateSystemStatus("Verbinde...");
    
    sseConnection = new EventSource(`https://${currentIP}:8443/?key=${encodeURIComponent(pwd)}&sse&all&cors`);

    sseConnection.onopen = () => {
        updateSystemStatus("Verbunden (Live)");
    };

    sseConnection.onmessage = (e) => {
        const data = e.data.trim().toUpperCase();
        
        // --- LOGIK FÜR DEINEN LOG-OUTPUT ---
        // Erkennt: TEMP_RELAY_CONTACT_1 OPEN, TEMP_ACCESS_STATE_1 FREE, STATE_ACCESS
        if (data.includes('OPEN') || data.includes('FREE') || data.includes('STATE_ACCESS')) {
            updateRelayStatus("Offen");
        } 
        // Erkennt: TEMP_RELAY_CONTACT_1 CLOSED, TEMP_ACCESS_STATE_1 CLOSED, STATE_RUN
        else if (data.includes('CLOSED') || data.includes('STATE_RUN')) {
            // Nur auf "Geschlossen" setzen, wenn wir nicht gerade im Auto-Trigger Modus sind
            if (!autoTriggerInterval) {
                updateRelayStatus("Geschlossen");
            }
        }
    };

    sseConnection.onerror = () => {
        updateSystemStatus("Verbindung unterbrochen");
        // Automatischer Reconnect nach 5 Sek
        setTimeout(startSSE, 5000);
    };
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