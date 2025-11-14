const express = require('express');
const WebSocket = require('ws');
const http = require('http');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Store connected clients
// Structure: { ws, id, nickname, connectedAt }
const clients = new Map();

wss.on('connection', (ws) => {
    let clientId = null;
    let clientNickname = 'Anonymous';

    console.log('🔌 New connection attempt');

    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data.toString());

            // Handle different message types
            switch (message.type) {
                case 'join':
                    // Client joining the chat
                    clientId = message.id;
                    clientNickname = message.nickname || 'Anonymous';

                    clients.set(clientId, { ws, id: clientId, nickname: clientNickname, connectedAt: Date.now() });

                    console.log(`✅ ${clientNickname} (${clientId}) joined. Total clients: ${clients.size}`);

                    // Send confirmation to the client
                    ws.send(JSON.stringify({
                        type: 'joined',
                        id: clientId,
                        nickname: clientNickname,
                        clientsOnline: clients.size
                    }));

                    // Notify all other clients
                    broadcast({
                        type: 'user_joined',
                        nickname: clientNickname,
                        clientsOnline: clients.size
                    }, clientId);
                    break;

                case 'chat':
                    // Forward chat message to all other clients
                    console.log(`💬 ${clientNickname}: ${message.text}`);

                    broadcast({
                        type: 'chat',
                        from: clientNickname,
                        fromId: clientId,
                        text: message.text,
                        timestamp: Date.now()
                    }, clientId);
                    break;

                case 'private':
                    // Send private message to specific client
                    const recipient = clients.get(message.toId);
                    if (recipient && recipient.ws.readyState === WebSocket.OPEN) {
                        recipient.ws.send(JSON.stringify({
                            type: 'private',
                            from: clientNickname,
                            fromId: clientId,
                            text: message.text,
                            timestamp: Date.now()
                        }));

                        // Send confirmation back to sender
                        ws.send(JSON.stringify({
                            type: 'private_sent',
                            to: recipient.nickname,
                            text: message.text
                        }));
                    } else {
                        ws.send(JSON.stringify({
                            type: 'error',
                            message: 'Recipient not found or offline'
                        }));
                    }
                    break;

                case 'list_users':
                    // Send list of online users
                    const userList = Array.from(clients.values()).map(c => ({
                        id: c.id,
                        nickname: c.nickname
                    }));

                    ws.send(JSON.stringify({
                        type: 'user_list',
                        users: userList
                    }));
                    break;

                default:
                    console.log('Unknown message type:', message.type);
            }
        } catch (err) {
            console.error('Error parsing message:', err);
            ws.send(JSON.stringify({
                type: 'error',
                message: 'Invalid message format'
            }));
        }
    });

    ws.on('close', () => {
        if (clientId && clients.has(clientId)) {
            clients.delete(clientId);
            console.log(`👋 ${clientNickname} left. Total clients: ${clients.size}`);

            // Notify all other clients
            broadcast({
                type: 'user_left',
                nickname: clientNickname,
                clientsOnline: clients.size
            });
        }
    });

    ws.on('error', (err) => {
        console.error('WebSocket error:', err);
    });
});

// Broadcast message to all clients except sender
function broadcast(message, excludeId = null) {
    const messageStr = JSON.stringify(message);

    for (const [id, client] of clients.entries()) {
        if (id !== excludeId && client.ws.readyState === WebSocket.OPEN) {
            client.ws.send(messageStr);
        }
    }
}

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        clientsOnline: clients.size,
        uptime: process.uptime()
    });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    console.log(`🚀 Relay server running on port ${PORT}`);
    console.log(`📡 WebSocket endpoint: ws://localhost:${PORT}`);
});

// Clean up dead connections every minute
setInterval(() => {
    for (const [id, client] of clients.entries()) {
        if (client.ws.readyState !== WebSocket.OPEN) {
            console.log(`🧹 Removing dead connection: ${client.nickname}`);
            clients.delete(id);
        }
    }
}, 60000);