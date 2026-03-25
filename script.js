let sseSource = null;

// Lade gespeichertes Passwort beim Start
window.onload = function() {
    const savedPwd = localStorage.getItem('behnke_pwd');
    if (savedPwd) {
        document.getElementById('adminPwd').value = savedPwd;
    }
};

// Passwort lokal im Browser speichern
function savePassword() {
    const pwd = document.getElementById('adminPwd').value;
    localStorage.setItem('behnke_pwd', pwd);
    connectSSE(); // Bei Passwortänderung SSE neu verbinden
}

// HTTP-API Befehl senden
function sendCommand(action) {
    const ip = document.getElementById('ipSelect').value;
    const pwd = document.getElementById('adminPwd').value;

    if (!ip || !pwd) {
        alert("Bitte IP-Adresse und Passwort angeben.");
        return;
    }

    let apiCommand = "";

    // API Befehle exakt nach Dokumentation zuweisen
    if (action === 'temp_auf') {
        apiCommand = "trigger&relay=1";
    } else if (action === 'dauer_auf') {
        apiCommand = "set&ACCESS_STATE_1=OPEN";
    } else if (action === 'dauer_zu') {
        apiCommand = "set&ACCESS_STATE_1=CLOSED";
    }

    const url = `https://${ip}/?key=${encodeURIComponent(pwd)}&api=${apiCommand}`;

    fetch(url, { method: 'GET', mode: 'no-cors' })
        .then(() => console.log(`Befehl ${apiCommand} gesendet.`))
        .catch(err => console.error("Fehler beim Senden:", err));
}

function parseStatusFromSSE(text) {
    const statusDisplay = document.getElementById('statusDisplay');
    const t = text.trim();

    if (/^TEMP_RELAY_CONTACT_1\s+(OPEN|CLOSED)$/i.test(t)) {
        const m = t.match(/^TEMP_RELAY_CONTACT_1\s+(OPEN|CLOSED)$/i);
        statusDisplay.innerText = "Status: " + m[1].toUpperCase();
        return true;
    }

    if (/^TEMP_ACCESS_STATE_1\s+(FREE|CLOSED)$/i.test(t)) {
        const m = t.match(/^TEMP_ACCESS_STATE_1\s+(FREE|CLOSED)$/i);
        statusDisplay.innerText = "Status: " + (m[1].toUpperCase() === 'FREE' ? 'OPEN' : 'CLOSED');
        return true;
    }

    if (/^STATE_ACCESS$/i.test(t)) {
        statusDisplay.innerText = "Status: OPEN (STATE_ACCESS)";
        return true;
    }

    if (/^STATE_RUN$/i.test(t)) {
        statusDisplay.innerText = "Status: CLOSED (STATE_RUN)";
        return true;
    }

    const patterns = [
        /access_state_1\s*=\s*(\w+)/i,
        /relay_contact_1\s*=\s*(\w+)/i,
        /state\s*=\s*(\w+)/i,
        /sse_state\s*=\s*(\w+)/i
    ];

    for (const pat of patterns) {
        const m = t.match(pat);
        if (m) {
            const raw = m[1].toUpperCase();
            let shown = raw;

            if (/relay_contact_1/i.test(pat.source)) {
                if (raw === '1') shown = 'CLOSED';
                else if (raw === '0') shown = 'OPEN';
            }

            statusDisplay.innerText = "Status: " + shown;
            return true;
        }
    }

    return false;
}

// SSE API für den Status abonnieren
function connectSSE() {
    const ip = document.getElementById('ipSelect').value;
    const pwd = document.getElementById('adminPwd').value;
    const statusDisplay = document.getElementById('statusDisplay');

    if (sseSource) {
        sseSource.close();
        sseSource = null;
    }

    if (!ip || !pwd) {
        statusDisplay.innerText = "Warte auf Eingabe...";
        return;
    }

    statusDisplay.innerText = "Verbinde...";

    const sseUrl = `https://${ip}:8443/?key=${encodeURIComponent(pwd)}&sse&all&cors`;
    sseSource = new EventSource(sseUrl);

    sseSource.onopen = () => {
        statusDisplay.innerText = "SSE verbunden (warte auf Status)...";
    };

    sseSource.onmessage = (event) => {
        const eventText = event.data.trim();

        if (parseStatusFromSSE(eventText)) {
            return;
        }

        if (/SSE_KEEP_ALIVE/i.test(eventText)) {
            return;
        }

        statusDisplay.innerText = "SSE: " + eventText;

        if (/SSE_BYE/i.test(eventText)) {
            sseSource.close();
            setTimeout(connectSSE, 500);
        }
    };

    sseSource.onerror = () => {
        if (sseSource.readyState === EventSource.CLOSED) {
            statusDisplay.innerText = "SSE getrennt, reconnect...";
            setTimeout(connectSSE, 1000);
        } else {
            statusDisplay.innerText = "SSE Fehler (wiederholen...)";
        }
    };
}
