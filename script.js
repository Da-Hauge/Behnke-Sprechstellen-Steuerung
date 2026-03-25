// script.js - Kompatible Version mit globalen Funktionen für index.html

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

// Polling für aktuellen Zustand
const ACCESS_STATE_POLL_DELAY_MS = 100;
let accessStatePollTimer = null;

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
}

/**
 * Lädt gespeichertes Passwort aus localStorage
 */
function loadPassword() {
    const pwd = localStorage.getItem('behnke_pwd');
    if (pwd) domCache.adminPwd.value = pwd;
}

/**
 * Bindet Event-Listener an Buttons (falls IDs vorhanden)
 */
function bindEvents() {
    if (domCache.ipSelect) {
        domCache.ipSelect.addEventListener('change', scheduleAccessStateQuery);
    }
    if (domCache.adminPwd) {
        domCache.adminPwd.addEventListener('input', scheduleAccessStateQuery);
    }
}

/**
 * Startet / plant eine sofortige Abfrage des aktuellen ACCESS_STATE_1 (100ms Debounce)
 */
function scheduleAccessStateQuery() {
    clearTimeout(accessStatePollTimer);
    accessStatePollTimer = setTimeout(queryAccessState, ACCESS_STATE_POLL_DELAY_MS);
}

/**
 * Liest den aktuellen ACCESS_STATE_1 per API aus und zeigt ihn an
 */
async function queryAccessState() {
    const ip = domCache.ipSelect?.value?.trim();
    const pwd = domCache.adminPwd?.value?.trim();
    if (!ip || !pwd) {
        updateStatus('IP oder Passwort fehlt');
        return;
    }

    const url = `https://${ip}${API_ENDPOINT}?key=${encodeURIComponent(pwd)}&api=get&access_state_1`;

    try {
        const response = await fetch(url, { method: 'GET', mode: 'cors' });
        if (!response.ok) {
            updateStatus(`Lesen fehlgeschlagen: ${response.status}`);
            return;
        }

        const text = await response.text();
        parseAccessStateResponse(text);
    } catch (error) {
        console.error('Fehler beim Lesen ACCESS_STATE_1:', error);
        updateStatus('Fehler beim Lesen ACCESS_STATE_1');
    }
}

/**
 * Parst den API-Output mit ACCESS_STATE_1 (z.B. OK [...] TEMP_ACCESS_STATE_1=CLOSED)
 */
function parseAccessStateResponse(responseText) {
    const match = responseText.match(/TEMP_ACCESS_STATE_1\s*=\s*(CLOSED|FREE|OPEN)/i);
    if (match) {
        const state = match[1].toUpperCase();
        const mapped = state === 'FREE' ? STATUS_MAP.OPEN : STATUS_MAP[state] || state.toLowerCase();
        updateStatus(`Status: ${mapped} (aus API)`);
        return;
    }

    updateStatus(`Unbekannter Format: ${responseText.split('\n')[0]}`);
}

/**
 * Speichert Passwort und startet SSE neu (globale Funktion für index.html)
 */
function savePassword() {
    const pwd = domCache.adminPwd?.value?.trim();
    if (!pwd) {
        alert('Passwort erforderlich');
        return;
    }
    localStorage.setItem('behnke_pwd', pwd);
    startSSE();
}

/**
 * Sendet API-Befehl asynchron (globale Funktion für index.html)
 * @param {string} action - Die Aktion ('temp_auf', 'dauer_auf', 'dauer_zu')
 */
// sendCommand wird weiter unten als einzige Implementation definiert (mit Scheduled Access-State-Query)

/**
 * Startet SSE-Verbindung (umbenannt von connectSSE für Kompatibilität)
 */
function startSSE() {
    const ip = domCache.ipSelect?.value?.trim();
    const pwd = domCache.adminPwd?.value?.trim();

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

/**
 * Globale Funktion für index.html onChange + onClick
 */
function connectSSE() {
    startSSE();
    scheduleAccessStateQuery();
}

/**
 * Sendet UI-Befehle (Temporär Auf / Dauerhaft Auf / Dauerhaft Zu)
 */
async function sendCommand(action) {
    const ip = domCache.ipSelect?.value?.trim();
    const pwd = domCache.adminPwd?.value?.trim();

    if (!ip || !pwd) {
        alert('IP und Passwort erforderlich');
        return;
    }

    let command;
    if (action === 'temp_auf') {
        command = COMMANDS.TEMP_AUF;
    } else {
        command = COMMANDS.HELP;
    }

    const url = `https://${ip}${API_ENDPOINT}?key=${encodeURIComponent(pwd)}&api=${command}`;

    try {
        await fetch(url, { method: 'GET', mode: 'no-cors' });
        console.log(`Befehl gesendet: ${command}`);
    } catch (error) {
        console.error('API-Fehler:', error);
    } finally {
        scheduleAccessStateQuery();
    }
}

/**
 * Startet SSE-Verbindung
 */
function startSSE() {
    const ip = domCache.ipSelect?.value?.trim();
    const pwd = domCache.adminPwd?.value?.trim();

    if (!ip || !pwd) {
        updateStatus('Eingabe erforderlich');
        return;
    }

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