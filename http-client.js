const readline = require('readline');
const { nanoid } = require('nanoid');

class HTTPChatClient {
    constructor(nickname, serverUrl) {
        this.id = nanoid(10);
        this.nickname = nickname;
        this.serverUrl = serverUrl.replace(/\/$/, ''); // Remove trailing slash
        this.lastMessageTime = 0;
        this.rl = null;
        this.pollInterval = null;
    }

    async join() {
        try {
            const res = await fetch(`${this.serverUrl}/join`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: this.id, nickname: this.nickname })
            });

            const data = await res.json();
            console.log(`✅ Connected as ${this.nickname}!`);
            console.log(`Users online: ${data.clientsOnline}\n`);

            this.startPolling();
            this.startCLI();
        } catch (err) {
            console.error('Failed to connect:', err.message);
            process.exit(1);
        }
    }

    startPolling() {
        this.pollInterval = setInterval(async () => {
            try {
                const res = await fetch(
                    `${this.serverUrl}/messages?since=${this.lastMessageTime}&id=${this.id}`
                );
                const data = await res.json();

                for (const msg of data.messages) {
                    if (msg.fromId !== this.id) {
                        console.log(`\n💬 ${msg.from}: ${msg.text}`);
                        this.showPrompt();
                    }
                    this.lastMessageTime = Math.max(this.lastMessageTime, msg.timestamp);
                }
            } catch (err) {
                // Ignore polling errors
            }
        }, 1000); // Poll every second
    }

    async sendMessage(text) {
        try {
            await fetch(`${this.serverUrl}/send`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: this.id, nickname: this.nickname, text })
            });
        } catch (err) {
            console.log('\n⚠️  Failed to send message');
            this.showPrompt();
        }
    }

    async listUsers() {
        try {
            const res = await fetch(`${this.serverUrl}/clients`);
            const data = await res.json();

            console.log('\n📋 Online users:');
            data.clients.forEach(user => {
                const isSelf = user.id === this.id;
                console.log(`  ${isSelf ? '👤' : '  '} ${user.nickname} ${isSelf ? '(you)' : ''}`);
            });
        } catch (err) {
            console.log('\n⚠️  Failed to get user list');
        }
        this.showPrompt();
    }

    startCLI() {
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            prompt: `${this.nickname}> `
        });

        console.log('Commands: /users, /quit\n');
        this.rl.prompt();

        this.rl.on('line', async (line) => {
            const text = line.trim();

            if (!text) {
                this.rl.prompt();
                return;
            }

            if (text === '/quit' || text === '/exit') {
                this.disconnect();
                return;
            }

            if (text === '/users') {
                await this.listUsers();
                return;
            }

            await this.sendMessage(text);
            this.rl.prompt();
        });

        this.rl.on('close', () => {
            this.disconnect();
        });
    }

    showPrompt() {
        if (this.rl) {
            this.rl.prompt(true);
        }
    }

    disconnect() {
        console.log('\n👋 Disconnecting...');
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
        }
        if (this.rl) {
            this.rl.close();
        }
        process.exit(0);
    }
}

const args = process.argv.slice(2);
if (args.length < 2) {
    console.log('Usage: node http-client.js <nickname> <server-url>');
    console.log('Example: node http-client.js Alice https://your-tunnel.trycloudflare.com');
    process.exit(1);
}

const client = new HTTPChatClient(args[0], args[1]);
client.join();