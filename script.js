// script.js - Behnke Master-Steuerung

const API_ENDPOINT = '/';
const STATIONS = {
    "192.168.104.191": "Altbau neue Pforte (191)",
    "192.168.104.192": "Altbau neue Pforte (192)",
    "192.168.104.193": "Neubau Pforte (193)"
};

let currentIP = "";
let autoTriggerInterval = null;
let sseConnection = null;
let countdownTimer = null;

const dom = {
    switcher: document.getElementById('stationSwitcher'),
    nameDisplay: document.getElementById('currentStationName'),
    content: document.getElementById('mainContent'),
    pwdInput: document.getElementById('stationPwd'),
    triggerBtn: document.getElementById('triggerBtn'),
    triggerText: document.getElementById('triggerText'),
    countdownBar: document.getElementById('countdownBar'),
    permanentToggle: document.getElementById('permanentToggle'),
    statusField: document.getElementById('relayStatusField'),
    toastContainer: document.getElementById('toastContainer'),
    themeToggle: document.getElementById('themeToggle')
};

// Initialisierung
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    dom.switcher.addEventListener('change', (e) => loadStation(e.target.value));
    dom.pwdInput.addEventListener('change', savePasswordForIP);
    dom.triggerBtn.addEventListener('click', handleTrigger);
    dom.permanentToggle.addEventListener('change', handlePermanentToggle);
    dom.themeToggle.addEventListener('click', toggleTheme);
});

function loadStation(ip) {
    // Reset
    stopAutoTrigger();
    if (sseConnection) sseConnection.close();
    
    currentIP = ip;
    dom.nameDisplay.textContent = STATIONS[ip];
    dom.content.style.display = 'block';
    
    // Passwort für diese IP laden
    const savedPwd = localStorage.getItem(`behnke_pwd_${ip}`);
    dom.pwdInput.value = savedPwd || "";
    
    // UI zurücksetzen
    dom.permanentToggle.checked = false;
    updateStatusField('Verbunden', 'neutral');
    
    showToast(`${STATIONS[ip]} ausgewählt`, 'info');
    startSSE();
}

function savePasswordForIP() {
    if (currentIP) {
        localStorage.setItem(`behnke_pwd_${currentIP}`, dom.pwdInput.value);
        showToast("Passwort gespeichert", "success");
        startSSE(); // Reconnect mit neuem PW
    }
}

// --- AKTIONEN ---

async function handleTrigger() {
    if (dom.triggerBtn.classList.contains('active')) return;

    const ok = await sendCommand('api=trigger&relay=1');
    if (ok) {
        showToast("Tür wird für 5s geöffnet", "success");
        startCountdown();
    }
}

function startCountdown() {
    dom.triggerBtn.classList.add('active');
    dom.triggerText.textContent = "Geöffnet...";
    dom.countdownBar.style.width = '100%';

    // Animation der Bar
    setTimeout(() => dom.countdownBar.style.width = '0%', 10);

    setTimeout(() => {
        dom.triggerBtn.classList.remove('active');
        dom.triggerText.textContent = "Temporär öffnen";
    }, 5000);
}

function handlePermanentToggle() {
    if (dom.permanentToggle.checked) {
        startAutoTrigger();
        showToast("Daueröffnung aktiviert", "warning");
    } else {
        stopAutoTrigger();
        showToast("Daueröffnung deaktiviert", "info");
    }
}

function startAutoTrigger() {
    if (autoTriggerInterval) return;
    sendCommand('api=trigger&relay=1');
    autoTriggerInterval = setInterval(() => {
        sendCommand('api=trigger&relay=1');
    }, 5000);
    updateStatusField('DAUERHAFT OFFEN', 'open');
}

function stopAutoTrigger() {
    if (autoTriggerInterval) {
        clearInterval(autoTriggerInterval);
        autoTriggerInterval = null;
    }
    updateStatusField('Normalbetrieb', 'neutral');
}

// --- KOMMUNIKATION ---

async function sendCommand(cmd) {
    const pwd = dom.pwdInput.value;
    if (!currentIP || !pwd) {
        showToast("Passwort fehlt!", "error");
        return false;
    }

    const url = `https://${currentIP}/?key=${encodeURIComponent(pwd)}&${cmd}&cors`;
    try {
        await fetch(url, { mode: 'no-cors' });
        return true;
    } catch (e) {
        showToast("Verbindungsfehler", "error");
        return false;
    }
}

function startSSE() {
    const pwd = dom.pwdInput.value;
    if (!currentIP || !pwd) return;

    if (sseConnection) sseConnection.close();
    
    const sseUrl = `https://${currentIP}:8443/?key=${encodeURIComponent(pwd)}&sse&all&cors`;
    sseConnection = new EventSource(sseUrl);

    sseConnection.onmessage = (event) => {
        const data = event.data.trim();
        if (data.includes('FREE') || data.includes('OPEN') || data.includes('RELAY_CONTACT_1 1')) {
            updateStatusField('OFFEN', 'open');
        } else if (data.includes('CLOSED') || data.includes('RELAY_CONTACT_1 0')) {
            if (!autoTriggerInterval) updateStatusField('ZU', 'closed');
        }
    };
}

// --- UI HELPER ---

function updateStatusField(text, state) {
    dom.statusField.textContent = `Relais: ${text}`;
    dom.statusField.className = `status-badge ${state}`;
}

function showToast(msg, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = msg;
    dom.toastContainer.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 500);
    }, 3000);
}

function initTheme() {
    const theme = localStorage.getItem('behnke_theme') || 'light';
    document.body.classList.toggle('dark-mode', theme === 'dark');
}

function toggleTheme() {
    const isDark = document.body.classList.toggle('dark-mode');
    localStorage.setItem('behnke_theme', isDark ? 'dark' : 'light');
}