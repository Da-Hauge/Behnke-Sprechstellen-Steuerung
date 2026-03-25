// script.js - Behnke Series 20 (Optimiert für CORS-Probleme)

const API_ENDPOINT = '/';
const SSE_ENDPOINT = ':8443/';

const COMMANDS = {
    TEMP_AUF: 'trigger&relay=1',
    DAUER_AUF: 'api=set&access_state_1=free',
    DAUER_ZU: 'api=set&access_state_1=closed',
    GET_STATE: 'api=get&access_state_1'
};

const STATUS_MAP = {
    OPEN: 'statusOpen',
    CLOSED: 'statusClosed',
    FREE: 'statusOpen' 
};

const THEME_KEY = 'behnke_theme';

const messages = {
    waiting: 'Warte auf Eingabe...',
    connecting: 'Verbinde...',
    connected: 'Verbunden',
    disconnected: 'Getrennt, verbinde neu...',
    error: 'Verbindung blockiert (CORS)',
    inputRequired: 'IP oder Passwort fehlt',
    commandSent: 'Befehl gesendet',
    apiError: 'API-Fehler',
    readingFailed: 'Status via API blockiert - warte auf Live-Stream...',
    statusOpen: 'Status: Auf',
    statusClosed: 'Status: Zu'
};

const domCache = {};
let sseConnection = null;

function initApp() {
    cacheElements();
    loadPassword();
    initTheme();
    bindEvents();
}

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
    domCache.ipSelect.addEventListener('change', handleConnectionUpdate);
    domCache.adminPwd.addEventListener('change', handleConnectionUpdate);
    
    domCache.tempBtn.addEventListener('click', () => sendCommand(COMMANDS.TEMP_AUF));
    domCache.openBtn.addEventListener('click', () => sendCommand(COMMANDS.DAUER_AUF));
    domCache.closeBtn.addEventListener('click', () => sendCommand(COMMANDS.DAUER_ZU));
    
    domCache.themeToggle.addEventListener('click', toggleTheme);
}

function handleConnectionUpdate() {
    const pwd = domCache.adminPwd.value.trim();
    if (pwd) localStorage.setItem('behnke_pwd', pwd);
    
    if (domCache.ipSelect.value && pwd) {
        // Zuerst Stream starten, da dieser oft stabiler bzgl. CORS ist
        startSSE();
        // Versuche dennoch die Abfrage mit dem cors-Parameter
        queryAccessState();
    }
}

function loadPassword() {
    const pwd = localStorage.getItem('behnke_pwd');
    if (pwd) domCache.adminPwd.value = pwd;
}

// --- API & Hardware Communication ---

async function sendCommand(commandString) {
    const ip = domCache.ipSelect.value.trim();
    const pwd = domCache.adminPwd.value.trim();
    
    if (!ip || !pwd) {
        updateStatus('inputRequired');
        return;
    }

    // Hinzufügen von &cors am Ende der URL
    const url = `https://${ip}${API_ENDPOINT}?key=${encodeURIComponent(pwd)}&${commandString}&cors`;

    try {
        // 'no-cors' ist hier oft nötig, wenn das Gerät keine Header sendet
        await fetch(url, { mode: 'no-cors' });
        updateStatus('commandSent');
        // Nach Befehl kurz warten, dann Status prüfen
        setTimeout(queryAccessState, 800); 
    } catch (error) {
        console.error('API Send Error:', error);
        updateStatus('error');
    }
}

async function queryAccessState() {
    const ip = domCache.ipSelect.value.trim();
    const pwd = domCache.adminPwd.value.trim();
    if (!ip || !pwd) return;

    // Auch hier &cors angehängt
    const url = `https://${ip}${API_ENDPOINT}?key=${encodeURIComponent(pwd)}&${COMMANDS.GET_STATE}&cors`;

    try {
        const response = await fetch(url);
        if (response.ok) {
            const text = await response.text();
            parseStateResponse(text);
        } else {
            updateStatus('readingFailed');
        }
    } catch (error) {
        // Wenn fetch wegen CORS scheitert, lassen wir den User wissen, dass wir auf SSE warten
        console.warn('API Fetch blockiert (CORS). Warte auf SSE-Update.');
        if (domCache.statusDisplay.textContent === messages.waiting) {
             updateStatus('readingFailed');
        }
    }
}

function parseStateResponse(text) {
    const match = text.match(/ACCESS_STATE_1\s*=\s*(CLOSED|FREE|OPEN)/i);
    if (match) {
        const state = match[1].toUpperCase();
        updateStatus(STATUS_MAP[state] || 'statusOpen');
    }
}

function startSSE() {
    const ip = domCache.ipSelect.value.trim();
    const pwd = domCache.adminPwd.value.trim();

    if (sseConnection) sseConnection.close();
    if (!ip || !pwd) return;

    updateStatus('connecting');
    // WICHTIG: Port 8443 und &cors
    const sseUrl = `https://${ip}${SSE_ENDPOINT}?key=${encodeURIComponent(pwd)}&sse&all&cors`;
    
    try {
        sseConnection = new EventSource(sseUrl);

        sseConnection.onopen = () => updateStatus('connected');

        sseConnection.onmessage = (event) => {
            const data = event.data.trim();
            console.log("SSE Empfangen:", data); // Zum Debuggen in der Konsole
            parseSSEData(data);
            
            if (/SSE_BYE/i.test(data)) {
                sseConnection.close();
                setTimeout(startSSE, 1000);
            }
        };

        sseConnection.onerror = () => {
            if (sseConnection.readyState === EventSource.CLOSED) {
                updateStatus('disconnected');
                setTimeout(startSSE, 3000);
            }
        };
    } catch (e) {
        console.error("SSE Setup Error:", e);
        updateStatus('error');
    }
}

function parseSSEData(data) {
    // Erkennt: ACCESS_STATE_1 FREE oder TEMP_ACCESS_STATE_1 OPEN etc.
    const stateMatch = data.match(/(?:TEMP_)?(?:ACCESS_STATE|RELAY_CONTACT)_1\s*[= ]\s*(FREE|CLOSED|OPEN)/i);
    if (stateMatch) {
        const state = stateMatch[1].toUpperCase();
        updateStatus(STATUS_MAP[state] || 'statusOpen');
    }
}

function updateStatus(key) {
    if (!domCache.statusDisplay) return;
    domCache.statusDisplay.textContent = messages[key] || key;
}

// --- UI Helpers ---

function initTheme() {
    const theme = localStorage.getItem(THEME_KEY) || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    applyTheme(theme);
}

function applyTheme(theme) {
    document.body.classList.toggle('dark-mode', theme === 'dark');
    domCache.themeIcon.textContent = theme === 'dark' ? 'wb_sunny' : 'brightness_2';
    localStorage.setItem(THEME_KEY, theme);
}

function toggleTheme() {
    const newTheme = document.body.classList.contains('dark-mode') ? 'light' : 'dark';
    applyTheme(newTheme);
}

document.addEventListener('DOMContentLoaded', initApp);