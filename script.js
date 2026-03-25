// script.js - Behnke Steuerung (Deutsch, mit Auto-Trigger Workaround)

const API_ENDPOINT = '/';
const SSE_ENDPOINT = ':8443/';

const COMMANDS = {
    TEMP_AUF: 'api=trigger&relay=1',
    GET_STATE: 'api=get&access_state_1'
};

const messages = {
    waiting: 'Warte auf Eingabe...',
    connecting: 'Verbinde...',
    connected: 'Verbunden',
    commandSent: 'Befehl gesendet!',
    statusOpen: 'Status: Dauerhaft AUF (Simuliert)',
    statusTemp: 'Status: Kurzzeitig AUF',
    statusClosed: 'Status: ZU / Normalbetrieb',
    error: 'Verbindungsfehler'
};

const domCache = {};
let autoTriggerInterval = null;
let sseConnection = null;

// Initialisierung
document.addEventListener('DOMContentLoaded', () => {
    cacheElements();
    loadPassword();
    initTheme();
    bindEvents();
    
    // Falls IP und Passwort bereits vorhanden sind, SSE starten
    if (domCache.ipSelect.value && domCache.adminPwd.value) {
        startSSE();
    }
});

function cacheElements() {
    domCache.ipSelect = document.getElementById('ipSelect');
    domCache.adminPwd = document.getElementById('adminPwd');
    domCache.statusDisplay = document.getElementById('statusDisplay');
    domCache.themeToggle = document.getElementById('themeToggle');
    domCache.themeIcon = document.querySelector('.theme-icon');
    domCache.tempBtn = document.getElementById('btnTemp');
    domCache.openBtn = document.getElementById('btnOpen');
    domCache.closeBtn = document.getElementById('btnClose');
}

function bindEvents() {
    // Wenn IP gewechselt wird
    domCache.ipSelect.addEventListener('change', () => {
        stopAutoTrigger();
        startSSE();
    });

    // Passwort speichern
    domCache.adminPwd.addEventListener('input', () => {
        localStorage.setItem('behnke_pwd', domCache.adminPwd.value);
    });

    // --- BUTTON LOGIK ---

    // 1. Temporär Auf
    domCache.tempBtn.addEventListener('click', () => {
        stopAutoTrigger(); // Falls Dauerlauf an war, stoppen
        updateStatus('statusTemp');
        sendCommand(COMMANDS.TEMP_AUF);
    });

    // 2. Dauerhaft Auf (Simulation)
    domCache.openBtn.addEventListener('click', () => {
        startAutoTrigger();
    });

    // 3. Dauerhaft Zu (Stoppt Simulation)
    domCache.btnClose.addEventListener('click', () => {
        stopAutoTrigger();
        updateStatus('statusClosed');
    });

    domCache.themeToggle.addEventListener('click', toggleTheme);
}

// --- LOGIK FÜR DIE SIMULATION (Dauerhaft Auf) ---

function startAutoTrigger() {
    if (autoTriggerInterval) return; // Läuft bereits

    updateStatus('statusOpen');
    // Ersten Impuls sofort senden
    sendCommand(COMMANDS.TEMP_AUF);

    // Alle 5 Sekunden einen neuen Impuls senden, um das Tor offen zu halten
    autoTriggerInterval = setInterval(() => {
        sendCommand(COMMANDS.TEMP_AUF);
    }, 5000); 
}

function stopAutoTrigger() {
    if (autoTriggerInterval) {
        clearInterval(autoTriggerInterval);
        autoTriggerInterval = null;
    }
}

// --- HARDWARE KOMMUNIKATION ---

async function sendCommand(commandString) {
    const ip = domCache.ipSelect.value;
    const pwd = domCache.adminPwd.value;
    
    if (!ip || !pwd) return;

    // Wir senden &cors mit, damit das Gerät weiß, dass es antworten darf (falls konfiguriert)
    const url = `https://${ip}${API_ENDPOINT}?key=${encodeURIComponent(pwd)}&${commandString}&cors`;

    try {
        // mode: 'no-cors' ist entscheidend, damit der Browser den Befehl trotz CORS-Sperre abschickt
        await fetch(url, { 
            mode: 'no-cors',
            cache: 'no-cache'
        });
        
        // Visuelles Feedback nur, wenn nicht im Dauer-Modus
        if (!autoTriggerInterval) {
            domCache.statusDisplay.style.color = '#007bff';
        }
    } catch (error) {
        console.error('Send Error:', error);
    }
}

function startSSE() {
    const ip = domCache.ipSelect.value;
    const pwd = domCache.adminPwd.value;
    if (!ip || !pwd) return;

    if (sseConnection) sseConnection.close();
    
    const sseUrl = `https://${ip}:8443/?key=${encodeURIComponent(pwd)}&sse&all&cors`;
    
    try {
        sseConnection = new EventSource(sseUrl);
        sseConnection.onopen = () => {
            if (!autoTriggerInterval) updateStatus('connected');
        };
        sseConnection.onmessage = (event) => {
            const data = event.data.trim();
            // Nur Status updaten, wenn wir NICHT gerade im simulierten Dauer-Modus sind
            if (!autoTriggerInterval) {
                if (data.includes('FREE') || data.includes('OPEN')) updateStatus('statusOpen');
                if (data.includes('CLOSED')) updateStatus('statusClosed');
            }
        };
        sseConnection.onerror = () => {
            sseConnection.close();
            setTimeout(startSSE, 5000);
        };
    } catch (e) {
        console.error("SSE Error");
    }
}

// --- UI & THEME ---

function updateStatus(key) {
    if (!domCache.statusDisplay) return;
    domCache.statusDisplay.textContent = messages[key] || key;
    
    // Farben für bessere Übersicht
    domCache.statusDisplay.style.color = ''; // Reset
    if (key === 'statusOpen') domCache.statusDisplay.style.color = '#28a745'; // Grün
    if (key === 'statusClosed') domCache.statusDisplay.style.color = '#dc3545'; // Rot
}

function loadPassword() {
    const pwd = localStorage.getItem('behnke_pwd');
    if (pwd) domCache.adminPwd.value = pwd;
}

function initTheme() {
    const theme = localStorage.getItem('behnke_theme') || 'light';
    applyTheme(theme);
}

function applyTheme(theme) {
    document.body.classList.toggle('dark-mode', theme === 'dark');
    domCache.themeIcon.textContent = theme === 'dark' ? 'wb_sunny' : 'brightness_2';
    localStorage.setItem('behnke_theme', theme);
}

function toggleTheme() {
    const isDark = document.body.classList.contains('dark-mode');
    applyTheme(isDark ? 'light' : 'dark');
}