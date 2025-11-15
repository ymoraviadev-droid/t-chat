const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Store messages and clients
const messages = [];
const clients = new Map(); // id -> { nickname, lastSeen }

// Register/heartbeat
app.post('/join', (req, res) => {
    const { id, nickname } = req.body;
    clients.set(id, { nickname, lastSeen: Date.now() });

    console.log(`✅ ${nickname} joined`);

    res.json({ success: true, clientsOnline: clients.size });
});

// Send message
app.post('/send', (req, res) => {
    const { id, nickname, text } = req.body;

    if (!clients.has(id)) {
        return res.status(401).json({ error: 'Not registered' });
    }

    clients.get(id).lastSeen = Date.now();

    const message = {
        from: nickname,
        fromId: id,
        text,
        timestamp: Date.now()
    };

    messages.push(message);
    console.log(`💬 ${nickname}: ${text}`);

    res.json({ success: true });
});

// Get new messages
app.get('/messages', (req, res) => {
    const { since, id } = req.query;

    if (id && clients.has(id)) {
        clients.get(id).lastSeen = Date.now();
    }

    const sinceTime = parseInt(since) || 0;
    const newMessages = messages.filter(m => m.timestamp > sinceTime);

    res.json({
        messages: newMessages,
        clientsOnline: clients.size
    });
});

// Get clients
app.get('/clients', (req, res) => {
    const clientList = Array.from(clients.entries()).map(([id, data]) => ({
        id,
        nickname: data.nickname
    }));

    res.json({ clients: clientList });
});

// Clean up inactive clients every minute
setInterval(() => {
    const now = Date.now();
    for (const [id, data] of clients.entries()) {
        if (now - data.lastSeen > 60000) {
            console.log(`👋 ${data.nickname} timed out`);
            clients.delete(id);
        }
    }
}, 30000);

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`🚀 HTTP relay server on port ${PORT}`);
});