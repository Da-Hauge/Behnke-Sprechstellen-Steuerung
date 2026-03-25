// script.js - Behnke Series 20 - Stabilisierte Version

const API_ENDPOINT = '/';
const SSE_ENDPOINT = ':8443/';

const COMMANDS = {
    // Jetzt mit dem korrekten api= Präfix
    TEMP_AUF: 'api=trigger&relay=1',
    DAUER_AUF: 'api=set&access_state_1=free',
    DAUER_ZU: 'api=set&access_state_1=closed',
    GET_STATE: 'api=get&access_state_1'
};

const messages = {
    waiting: 'Warte auf Eingabe...',
    connecting: 'Verbinde...',
    connected: 'Verbunden (Live)',
    disconnected: 'Getrennt, verbinde neu...',
    error: 'Fehler (CORS/IP)',
    inputRequired: 'IP oder Passwort fehlt',
    commandSent: 'Befehl gesendet!',
    statusOpen: 'Status: Auf',
    statusClosed: 'Status: Zu'
};

const domCache = {};
let sseConnection = null;

// Initialisierung
document.addEventListener('DOMContentLoaded', () => {
    cacheElements();
    loadPassword();
    initTheme();
    bindEvents();
    
    // Falls beim Laden schon Daten da sind, direkt starten
    if (domCache.ipSelect.value && domCache.adminPwd.value) {
        handleConnectionUpdate();
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
    domCache.ipSelect.addEventListener('change', handleConnectionUpdate);
    domCache.adminPwd.addEventListener('input', () => {
        localStorage.setItem('behnke_pwd', domCache.adminPwd.value);
    });
    // Wichtig: Beim Passwort-Feld auch 'change' für den Verbindungsaufbau
    domCache.adminPwd.addEventListener('change', handleConnectionUpdate);
    
    domCache.tempBtn.addEventListener('click', () => sendCommand(COMMANDS.TEMP_AUF));
    domCache.openBtn.addEventListener('click', () => sendCommand(COMMANDS.DAUER_AUF));
    domCache.closeBtn.addEventListener('click', () => sendCommand(COMMANDS.DAUER_ZU));
    
    domCache.themeToggle.addEventListener('click', toggleTheme);
}

function handleConnectionUpdate() {
    const ip = domCache.ipSelect.value;
    const pwd = domCache.adminPwd.value;
    
    if (ip && pwd) {
        startSSE();
        queryAccessState();
    }
}

function loadPassword() {
    const pwd = localStorage.getItem('behnke_pwd');
    if (pwd) domCache.adminPwd.value = pwd;
}

// BEFEHL SENDEN
async function sendCommand(commandString) {
    const ip = domCache.ipSelect.value;
    const pwd = domCache.adminPwd.value;
    
    if (!ip || !pwd) {
        updateStatus('inputRequired');
        return;
    }

    // Die URL wird jetzt sauber mit dem Passwort und dem API-String zusammengebaut
    const url = `https://${ip}${API_ENDPOINT}?key=${encodeURIComponent(pwd)}&${commandString}&cors`;

    console.log("Sende Befehl:", url); // Hilft dir beim Testen in der Konsole (F12)

    try {
        await fetch(url, { 
            mode: 'no-cors', // Verhindert, dass der Browser den Befehl wegen CORS blockiert
            cache: 'no-cache'
        });
        
        updateStatus('commandSent');
        
        // Farbe kurz auf Blau ändern für optisches Feedback
        domCache.statusDisplay.style.color = '#007bff';
        
        // Status nach einer kurzen Verzögerung aktualisieren
        setTimeout(queryAccessState, 1000); 
    } catch (error) {
        console.error('Sende-Fehler:', error);
        updateStatus('error');
    }
}

// STATUS ABFRAGEN (API)
async function queryAccessState() {
    const ip = domCache.ipSelect.value;
    const pwd = domCache.adminPwd.value;
    if (!ip || !pwd) return;

    const url = `https://${ip}${API_ENDPOINT}?key=${encodeURIComponent(pwd)}&${COMMANDS.GET_STATE}&cors`;

    try {
        const response = await fetch(url).catch(() => null);
        if (response && response.ok) {
            const text = await response.text();
            parseStateResponse(text);
        }
    } catch (e) {
        // Ignorieren, da SSE hoffentlich läuft
    }
}

function parseStateResponse(text) {
    if (text.includes('FREE') || text.includes('OPEN')) updateStatus('statusOpen');
    else if (text.includes('CLOSED')) updateStatus('statusClosed');
}

// LIVE STATUS (SSE)
function startSSE() {
    const ip = domCache.ipSelect.value;
    const pwd = domCache.adminPwd.value;

    if (sseConnection) sseConnection.close();
    
    const sseUrl = `https://${ip}${SSE_ENDPOINT}?key=${encodeURIComponent(pwd)}&sse&all&cors`;
    
    try {
        updateStatus('connecting');
        sseConnection = new EventSource(sseUrl);

        sseConnection.onopen = () => updateStatus('connected');

        sseConnection.onmessage = (event) => {
            const data = event.data.trim();
            if (data.includes('FREE') || data.includes('OPEN')) {
                updateStatus('statusOpen');
            } else if (data.includes('CLOSED')) {
                updateStatus('statusClosed');
            }
            
            if (data.includes('SSE_BYE')) {
                sseConnection.close();
                setTimeout(startSSE, 2000);
            }
        };

        sseConnection.onerror = () => {
            sseConnection.close();
            updateStatus('disconnected');
            setTimeout(startSSE, 5000); // Längerer Intervall bei Fehlern
        };
    } catch (e) {
        updateStatus('error');
    }
}

function updateStatus(key) {
    if (!domCache.statusDisplay) return;
    domCache.statusDisplay.textContent = messages[key] || key;
    
    // Farben setzen
    if (key === 'statusOpen') domCache.statusDisplay.style.color = '#28a745';
    else if (key === 'statusClosed') domCache.statusDisplay.style.color = '#dc3545';
    else if (key === 'connected') domCache.statusDisplay.style.color = '#007bff';
}

// THEME
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
    applyTheme(document.body.classList.contains('dark-mode') ? 'light' : 'dark');
}