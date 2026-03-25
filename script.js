// ZENTRALE DATENVERWALTUNG
const STATIONS = {
    "192.168.104.191": "Altbau alte Pforte",
    "192.168.104.192": "Altbau neue Pforte",
    "192.168.104.193": "Neubau Pforte"
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
    initStationSwitcher();
    initTheme();
    dom.switcher.addEventListener('change', (e) => loadStation(e.target.value));
    dom.pwdInput.addEventListener('change', savePassword);
    dom.triggerBtn.addEventListener('click', runTrigger);
    dom.permanentToggle.addEventListener('change', togglePermanent);
    dom.themeToggle.addEventListener('click', rotateTheme);
});

function initStationSwitcher() {
    dom.switcher.innerHTML = '<option value="" disabled selected>Station wählen...</option>';
    Object.entries(STATIONS).forEach(([ip, name]) => {
        const opt = document.createElement('option');
        opt.value = ip;
        opt.textContent = `${name} (${ip})`;
        dom.switcher.appendChild(opt);
    });
}

function loadStation(ip) {
    // Sanfter Übergang
    dom.content.style.opacity = "0";
    
    setTimeout(() => {
        stopAutoTrigger();
        if (sseConnection) sseConnection.close();
        
        currentIP = ip;
        dom.content.style.visibility = 'visible';
        dom.content.style.opacity = "1";
        
        const saved = localStorage.getItem(`behnke_pwd_${ip}`);
        dom.pwdInput.value = saved || "";
        
        dom.permanentToggle.checked = false;
        updateSystemStatus(saved ? "Bereit" : "Passwort fehlt");
        updateRelayStatus("Unbekannt");
        
        showToast(`${STATIONS[ip]} geladen`);
        if(saved) startSSE();
    }, 200);
}

function savePassword() {
    if(!currentIP) return;
    localStorage.setItem(`behnke_pwd_${currentIP}`, dom.pwdInput.value);
    showToast("Passwort gespeichert", "success");
    startSSE();
}

async function apiCall(cmd) {
    const pwd = dom.pwdInput.value;
    if (!pwd || !currentIP) return false;
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
    const sseUrl = `https://${currentIP}:8443/?key=${encodeURIComponent(pwd)}&sse&all&cors`;

    try {
        sseConnection = new EventSource(sseUrl);
        sseConnection.onopen = () => {
            updateSystemStatus("Verbunden");
            showToast("Live-Verbindung aktiv", "success");
        };
        sseConnection.onmessage = (e) => {
            const msg = e.data.trim().toUpperCase();
            if (/OPEN|FREE|STATE_ACCESS/.test(msg)) {
                updateRelayStatus("Offen");
            } else if (/CLOSED|STATE_RUN/.test(msg)) {
                if (!autoTriggerInterval) updateRelayStatus("Geschlossen");
            }
        };
        sseConnection.onerror = () => {
            updateSystemStatus("Fehler");
            sseConnection.close();
            setTimeout(startSSE, 10000);
        };
    } catch (e) { updateSystemStatus("Fehler"); }
}

async function runTrigger() {
    if (dom.triggerBtn.disabled) return;
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
    if(currentIP) updateSystemStatus("Bereit");
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