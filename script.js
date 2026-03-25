// script.js - Kompatible Version mit globalen Funktionen für index.html

// Konstanten für bessere Wartbarkeit
const API_ENDPOINT = '/';
const SSE_ENDPOINT = ':8443/';
const COMMANDS = {
    TEMP_AUF: 'trigger&relay=1',
    HELP: 'help'
};
const STATUS_MAP = {
    OPEN: 'statusOpen',
    CLOSED: 'statusClosed'
};
const THEME_KEY = 'behnke_theme';
const THEME_LIGHT = 'light';
const THEME_DARK = 'dark';
const LANG_KEY = 'behnke_lang';
const LANG_EN = 'en';
const LANG_DE = 'de';

// Translation strings
const translations = {
    en: {
        title: 'Behnke Access Control',
        selectLabel: 'Select access point (IP address):',
        selectPlaceholder: '-- Please select --',
        passwordLabel: 'Administrator password:',
        passwordPlaceholder: 'Enter password',
        statusLabel: 'Current status (Relay 1):',
        tempOn: 'Temporary On',
        permanentOn: 'Permanent On',
        permanentOff: 'Permanent Off',
        connecting: 'Connecting...',
        connected: 'Connected (waiting for status...)',
        disconnected: 'Disconnected, reconnecting...',
        error: 'Connection error',
        ipOrPasswordMissing: 'IP or password missing',
        inputRequired: 'Input required',
        commandSent: 'Command sent',
        apiError: 'API error',
        passwordRequired: 'Password required',
        statusOpen: 'Status: open',
        statusClosed: 'Status: closed',
        statusFree: 'Status: free',
        statusOn: 'Status: on',
        statusOff: 'Status: off',
        readingFailed: 'Reading failed',
        unknownFormat: 'Unknown format'
    },
    de: {
        title: 'Behnke Sprechstellen-Steuerung',
        selectLabel: 'Sprechstelle (IP-Adresse) auswählen:',
        selectPlaceholder: '-- Bitte wählen --',
        passwordLabel: 'Administrator-Passwort:',
        passwordPlaceholder: 'Passwort eingeben',
        statusLabel: 'Aktueller Status (Relais 1):',
        tempOn: 'Temporär Auf',
        permanentOn: 'Dauerhaft Auf',
        permanentOff: 'Dauerhaft Zu',
        connecting: 'Verbinde...',
        connected: 'Verbunden (warte auf Status...)',
        disconnected: 'Getrennt, reconnect...',
        error: 'Verbindungsfehler',
        ipOrPasswordMissing: 'IP oder Passwort fehlt',
        inputRequired: 'Eingabe erforderlich',
        commandSent: 'Befehl gesendet',
        apiError: 'API-Fehler',
        passwordRequired: 'Passwort erforderlich',
        statusOpen: 'Status: auf',
        statusClosed: 'Status: zu',
        statusFree: 'Status: frei',
        statusOn: 'Status: an',
        statusOff: 'Status: aus',
        readingFailed: 'Lesen fehlgeschlagen',
        unknownFormat: 'Unbekannter Format'
    }
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
    initTheme();
    initLanguage();
    bindEvents();
}

/**
 * Cached häufig verwendete DOM-Elemente
 */
function cacheElements() {
    domCache.ipSelect = document.getElementById('ipSelect');
    domCache.adminPwd = document.getElementById('adminPwd');
    domCache.statusDisplay = document.getElementById('statusDisplay');
    domCache.themeToggle = document.getElementById('themeToggle');
    domCache.themeIcon = document.querySelector('.theme-icon');
    domCache.langToggle = document.getElementById('langToggle');
    domCache.langText = document.querySelector('.lang-text');
    domCache.titleElement = document.querySelector('h1');
    domCache.selectLabel = document.querySelector('label[for="ipSelect"]');
    domCache.passwordLabel = document.querySelector('label[for="adminPwd"]');
    domCache.passwordInput = document.getElementById('adminPwd');
    domCache.statusBox = document.querySelector('.status-box');
    domCache.tempBtn = document.querySelector('.btn-temp');
    domCache.openBtn = document.querySelector('.btn-open');
    domCache.closeBtn = document.querySelector('.btn-close');
}

/**
 * Lädt gespeichertes Passwort aus localStorage
 */
function loadPassword() {
    const pwd = localStorage.getItem('behnke_pwd');
    if (pwd) domCache.adminPwd.value = pwd;
}

/**
 * Initialisiert das Theme basierend auf gespeicherten Einstellungen oder Systempräferenz
 */
function initTheme() {
    const savedTheme = localStorage.getItem(THEME_KEY);
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    let theme = savedTheme;
    if (!theme) {
        theme = systemPrefersDark ? THEME_DARK : THEME_LIGHT;
    }
    
    applyTheme(theme);
}

/**
 * Wendet das angegebene Theme an
 * @param {string} theme - 'light' oder 'dark'
 */
function applyTheme(theme) {
    const body = document.body;
    const icon = domCache.themeIcon;
    
    if (theme === THEME_DARK) {
        body.classList.add('dark-mode');
        if (icon) icon.textContent = 'wb_sunny';
    } else {
        body.classList.remove('dark-mode');
        if (icon) icon.textContent = 'brightness_2';
    }
    
    localStorage.setItem(THEME_KEY, theme);
}

/**
 * Schaltet zwischen Hell- und Dunkelmodus um
 */
function toggleTheme() {
    const isDark = document.body.classList.contains('dark-mode');
    const newTheme = isDark ? THEME_LIGHT : THEME_DARK;
    applyTheme(newTheme);
}

/**
 * Initialisiert die Sprache basierend auf gespeicherten Einstellungen oder Systempräferenz
 */
function initLanguage() {
    const savedLang = localStorage.getItem(LANG_KEY);
    const systemLang = navigator.language || navigator.userLanguage;
    const isGermanSystem = systemLang && systemLang.startsWith('de');
    
    let lang = savedLang;
    if (!lang) {
        lang = isGermanSystem ? LANG_DE : LANG_EN;
    }
    
    applyLanguage(lang);
}

/**
 * Wendet die angegebene Sprache an
 * @param {string} lang - 'en' oder 'de'
 */
function applyLanguage(lang) {
    const langText = domCache.langText;
    
    if (lang === LANG_DE) {
        if (langText) langText.textContent = 'DE';
    } else {
        if (langText) langText.textContent = 'EN';
    }
    
    // Update all text content
    updateUIText(lang);
    localStorage.setItem(LANG_KEY, lang);
}

/**
 * Aktualisiert alle UI-Texte basierend auf der gewählten Sprache
 * @param {string} lang - 'en' oder 'de'
 */
function updateUIText(lang) {
    const t = translations[lang];
    
    if (domCache.titleElement) domCache.titleElement.textContent = t.title;
    if (domCache.selectLabel) domCache.selectLabel.textContent = t.selectLabel;
    if (domCache.passwordLabel) domCache.passwordLabel.textContent = t.passwordLabel;
    if (domCache.passwordInput) domCache.passwordInput.placeholder = t.passwordPlaceholder;
    if (domCache.statusBox) domCache.statusBox.innerHTML = t.statusLabel + '<br><span class="status-indicator" id="statusDisplay">' + t.connecting + '</span>';
    if (domCache.tempBtn) domCache.tempBtn.textContent = t.tempOn;
    if (domCache.openBtn) domCache.openBtn.textContent = t.permanentOn;
    if (domCache.closeBtn) domCache.closeBtn.textContent = t.permanentOff;
    
    // Update select options
    if (domCache.ipSelect) {
        const options = domCache.ipSelect.options;
        if (options.length > 0) {
            options[0].text = t.selectPlaceholder;
        }
    }
}

/**
 * Schaltet zwischen Englisch und Deutsch um
 */
function toggleLanguage() {
    const currentLang = localStorage.getItem(LANG_KEY) || LANG_EN;
    const newLang = currentLang === LANG_EN ? LANG_DE : LANG_EN;
    applyLanguage(newLang);
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
    if (domCache.themeToggle) {
        domCache.themeToggle.addEventListener('click', toggleTheme);
    }
    if (domCache.langToggle) {
        domCache.langToggle.addEventListener('click', toggleLanguage);
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
        updateStatus('ipOrPasswordMissing', true);
        return;
    }

    const url = `https://${ip}${API_ENDPOINT}?key=${encodeURIComponent(pwd)}&api=get&access_state_1`;

    try {
        const response = await fetch(url, { method: 'GET', mode: 'cors' });
        if (!response.ok) {
            updateStatus('readingFailed', true);
            return;
        }

        const text = await response.text();
        parseAccessStateResponse(text);
    } catch (error) {
        console.error('Fehler beim Lesen ACCESS_STATE_1:', error);
        updateStatus('readingFailed', true);
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

    updateStatus(`unknownFormat: ${responseText.split('\n')[0]}`, false);
}

/**
 * Speichert Passwort und startet SSE neu (globale Funktion für index.html)
 */
function savePassword() {
    const pwd = domCache.adminPwd?.value?.trim();
    if (!pwd) {
        alert(translations[localStorage.getItem(LANG_KEY) || LANG_EN].passwordRequired);
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
        updateStatus('inputRequired', true);
        return;
    }

    // Schließe bestehende Verbindung
    if (sseConnection) {
        sseConnection.close();
    }

    updateStatus('connecting', true);

    const sseUrl = `https://${ip}${SSE_ENDPOINT}?key=${encodeURIComponent(pwd)}&sse&all&cors`;
    sseConnection = new EventSource(sseUrl);

    sseConnection.onopen = () => updateStatus('connected', true);

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
            updateStatus('disconnected', true);
            setTimeout(startSSE, 1000);
        } else {
            updateStatus('error', true);
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
        const statusKey = STATUS_MAP[relayMatch[1].toUpperCase()];
        updateStatus(statusKey, true);
        return true;
    }

    const accessMatch = data.match(/^TEMP_ACCESS_STATE_1\s+(FREE|CLOSED)$/i);
    if (accessMatch) {
        const state = accessMatch[1].toUpperCase() === 'FREE' ? 'OPEN' : 'CLOSED';
        const statusKey = STATUS_MAP[state];
        updateStatus(statusKey, true);
        return true;
    }

    if (/^STATE_ACCESS$/i.test(data)) {
        updateStatus('statusOn', true);
        return true;
    }
    if (/^STATE_RUN$/i.test(data)) {
        updateStatus('statusOff', true);
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
            const statusKey = STATUS_MAP[status] || `status${status.charAt(0).toUpperCase() + status.slice(1).toLowerCase()}`;
            updateStatus(statusKey, true);
            return true;
        }
    }

    return false;
}

/**
 * Aktualisiert Status-Anzeige
 * @param {string} key - Translation key oder direkter Text
 * @param {boolean} isKey - True wenn key ein Translation-Key ist
 */
function updateStatus(key, isKey = false) {
    if (!domCache.statusDisplay) return;
    
    let text;
    if (isKey) {
        const currentLang = localStorage.getItem(LANG_KEY) || LANG_EN;
        text = translations[currentLang][key] || key;
    } else {
        text = key;
    }
    
    domCache.statusDisplay.textContent = text;
}

// Starte App beim DOM-Load
document.addEventListener('DOMContentLoaded', initApp);