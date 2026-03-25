// script2.js - Performante und saubere Implementierung der Sprechstellensteuerung

// Konstanten für bessere Wartbarkeit
const API_ENDPOINT = '/';
const SSE_ENDPOINT = ':8443/';
const COMMANDS = {
    TEMP_AUF: 'trigger&relay=1',
    HELP: 'help'
};
const STATUS_MAP = {
    OPEN: 'auf',
    CLOSED: 'zu'
};

// Cache für DOM-Elemente zur Performance
const domCache = {};

// SSE-Verbindung
let sseConnection = null;

/**
 * Initialisiert die Anwendung nach DOM-Load
 */
function initApp() {
    cacheElements();
    loadPassword();
    bindEvents();
}

/**
 * Cached häufig verwendete DOM-Elemente
 */
function cacheElements() {
    domCache.ipSelect = document.getElementById('ipSelect');
    domCache.adminPwd = document.getElementById('adminPwd');
    domCache.statusDisplay = document.getElementById('statusDisplay');
    domCache.tempAufBtn = document.getElementById('tempAufBtn');
    domCache.dauerAufBtn = document.getElementById('dauerAufBtn');
    domCache.dauerZuBtn = document.getElementById('dauerZuBtn');
    domCache.savePwdBtn = document.getElementById('savePwdBtn');
}

/**
 * Lädt gespeichertes Passwort aus localStorage
 */
function loadPassword() {
    const pwd = localStorage.getItem('behnke_pwd');
    if (pwd) domCache.adminPwd.value = pwd;
}

/**
 * Bindet Event-Listener an Buttons
 */
function bindEvents() {
    domCache.savePwdBtn?.addEventListener('click', handleSavePassword);
    domCache.tempAufBtn?.addEventListener('click', () => sendApiCommand(COMMANDS.TEMP_AUF));
    domCache.dauerAufBtn?.addEventListener('click', () => sendApiCommand(COMMANDS.HELP));
    domCache.dauerZuBtn?.addEventListener('click', () => sendApiCommand(COMMANDS.HELP));
}

/**
 * Speichert Passwort und startet SSE neu
 */
function handleSavePassword() {
    const pwd = domCache.adminPwd.value.trim();
    if (!pwd) {
        alert('Passwort erforderlich');
        return;
    }
    localStorage.setItem('behnke_pwd', pwd);
    startSSE();
}

/**
 * Sendet API-Befehl asynchron
 * @param {string} command - Der API-Befehl
 */
async function sendApiCommand(command) {
    const ip = domCache.ipSelect.value.trim();
    const pwd = domCache.adminPwd.value.trim();

    if (!ip || !pwd) {
        alert('IP und Passwort erforderlich');
        return;
    }

    const url = `https://${ip}${API_ENDPOINT}?key=${encodeURIComponent(pwd)}&api=${command}`;

    try {
        await fetch(url, { method: 'GET', mode: 'no-cors' });
        console.log(`Befehl gesendet: ${command}`);
    } catch (error) {
        console.error('API-Fehler:', error);
    }
}

/**
 * Startet SSE-Verbindung
 */
function startSSE() {
    const ip = domCache.ipSelect.value.trim();
    const pwd = domCache.adminPwd.value.trim();

    if (!ip || !pwd) {
        updateStatus('Eingabe erforderlich');
        return;
    }

    // Schließe bestehende Verbindung
    if (sseConnection) {
        sseConnection.close();
    }

    updateStatus('Verbinde...');

    const sseUrl = `https://${ip}${SSE_ENDPOINT}?key=${encodeURIComponent(pwd)}&sse&all&cors`;
    sseConnection = new EventSource(sseUrl);

    sseConnection.onopen = () => updateStatus('Verbunden (warte auf Status...)');

    sseConnection.onmessage = (event) => {
        const data = event.data.trim();
        if (parseSSEStatus(data)) return;
        if (/SSE_KEEP_ALIVE/i.test(data)) return;
        updateStatus(`SSE: ${data}`);
        if (/SSE_BYE/i.test(data)) {
            sseConnection.close();
            setTimeout(startSSE, 500);
        }
    };

    sseConnection.onerror = () => {
        if (sseConnection.readyState === EventSource.CLOSED) {
            updateStatus('Getrennt, reconnect...');
            setTimeout(startSSE, 1000);
        } else {
            updateStatus('Verbindungsfehler');
        }
    };
}

/**
 * Parst Status aus SSE-Daten
 * @param {string} data - SSE-Nachricht
 * @returns {boolean} - True wenn Status geparst
 */
function parseSSEStatus(data) {
    const relayMatch = data.match(/^TEMP_RELAY_CONTACT_1\s+(OPEN|CLOSED)$/i);
    if (relayMatch) {
        updateStatus(`Status: ${STATUS_MAP[relayMatch[1].toUpperCase()]}`);
        return true;
    }

    const accessMatch = data.match(/^TEMP_ACCESS_STATE_1\s+(FREE|CLOSED)$/i);
    if (accessMatch) {
        const state = accessMatch[1].toUpperCase() === 'FREE' ? 'OPEN' : 'CLOSED';
        updateStatus(`Status: ${STATUS_MAP[state]}`);
        return true;
    }

    if (/^STATE_ACCESS$/i.test(data)) {
        updateStatus('Status: auf');
        return true;
    }
    if (/^STATE_RUN$/i.test(data)) {
        updateStatus('Status: zu');
        return true;
    }

    // Vereinfachte Patterns
    const patterns = [
        /access_state_1\s*=\s*(\w+)/i,
        /relay_contact_1\s*=\s*(\w+)/i,
        /state\s*=\s*(\w+)/i
    ];

    for (const pattern of patterns) {
        const match = data.match(pattern);
        if (match) {
            let status = match[1].toUpperCase();
            if (/relay_contact_1/i.test(pattern.source)) {
                status = status === '1' ? 'CLOSED' : 'OPEN';
            }
            updateStatus(`Status: ${STATUS_MAP[status] || status}`);
            return true;
        }
    }

    return false;
}

/**
 * Aktualisiert Status-Anzeige
 * @param {string} text - Status-Text
 */
function updateStatus(text) {
    if (domCache.statusDisplay) {
        domCache.statusDisplay.textContent = text;
    }
}

// Starte App beim DOM-Load
document.addEventListener('DOMContentLoaded', initApp);