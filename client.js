const WebSocket = require('ws');
const readline = require('readline');
const chalk = require('chalk');
const { nanoid } = require('nanoid');

class ChatClient {
    constructor(nickname, serverUrl) {
        this.id = nanoid(10);
        this.nickname = nickname;
        this.serverUrl = serverUrl;
        this.webSocket = null;
        this.readLine = null;
        this.isConnected = false;
    }

    connect() {
        return new Promise((resolve, reject) => {
            console.log(chalk.gray(`Connecting to ${this.serverUrl}...`));

            this.webSocket = new WebSocket(this.serverUrl);

            this.webSocket.on('open', () => {
                // Send join message
                this.webSocket.send(JSON.stringify({
                    type: 'join',
                    id: this.id,
                    nickname: this.nickname
                }));
            });

            this.webSocket.on('message', (data) => {
                const message = JSON.parse(data.toString());
                this.handleMessage(message, resolve);
            });

            this.webSocket.on('close', () => {
                console.log(chalk.red('\nDisconnected from server'));
                this.isConnected = false;
                if (this.readLine) {
                    this.readLine.close();
                }
                process.exit(0);
            });

            this.webSocket.on('error', (err) => {
                console.error(chalk.red('Connection error:'), err.message);
                reject(err);
            });
        });
    }

    handleMessage(message, resolveConnect) {
        switch (message.type) {
            case 'joined':
                this.isConnected = true;
                console.log(chalk.green(`\nConnected as ${message.nickname}!`));
                console.log(chalk.gray(`Your ID: ${message.id}`));
                console.log(chalk.gray(`Users online: ${message.clientsOnline}\n`));

                if (resolveConnect) {
                    resolveConnect();
                }

                this.startCLI();
                break;

            case 'chat':
                console.log(chalk.yellow(`\n${message.from}: ${message.text}`));
                this.showPrompt();
                break;

            case 'private':
                console.log(chalk.magenta(`\n[Private] ${message.from}: ${message.text}`));
                this.showPrompt();
                break;

            case 'private_sent':
                console.log(chalk.gray(`[Sent to ${message.to}]: ${message.text}`));
                this.showPrompt();
                break;

            case 'user_joined':
                console.log(chalk.blue(`\n${message.nickname} joined the chat (${message.clientsOnline} online)`));
                this.showPrompt();
                break;

            case 'user_left':
                console.log(chalk.red(`\n${message.nickname} left the chat (${message.clientsOnline} online)`));
                this.showPrompt();
                break;

            case 'user_list':
                console.log(chalk.cyan('\nOnline users:'));
                message.users.forEach(user => {
                    const isSelf = user.id === this.id;
                    console.log(chalk.gray(`  ${isSelf ? '👤' : '  '} ${user.nickname} ${isSelf ? '(you)' : `[${user.id}]`}`));
                });
                this.showPrompt();
                break;

            case 'error':
                console.log(chalk.red(`\nError: ${message.message}`));
                this.showPrompt();
                break;

            default:
                console.log('Unknown message type:', message.type);
        }
    }

    startCLI() {
        this.readLine = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            prompt: chalk.cyan(`${this.nickname}> `)
        });

        console.log(chalk.green('Commands:'));
        console.log(chalk.gray('  /users - list online users'));
        console.log(chalk.gray('  /pm <id> <message> - send private message'));
        console.log(chalk.gray('  /quit - exit\n'));

        this.readLine.prompt();

        this.readLine.on('line', (line) => {
            const text = line.trim();

            if (!text) {
                this.readLine.prompt();
                return;
            }

            // Handle commands
            if (text.startsWith('/')) {
                this.handleCommand(text);
            } else {
                // Send regular chat message
                this.sendMessage(text);
            }

            this.readLine.prompt();
        });

        this.readLine.on('close', () => {
            this.disconnect();
        });
    }

    handleCommand(command) {
        const parts = command.split(' ');
        const cmd = parts[0].toLowerCase();

        switch (cmd) {
            case '/quit':
            case '/exit':
                this.disconnect();
                break;

            case '/users':
            case '/list':
                this.webSocket.send(JSON.stringify({ type: 'list_users' }));
                break;

            case '/pm':
            case '/private':
                if (parts.length < 3) {
                    console.log(chalk.red('Usage: /pm <user-id> <message>'));
                } else {
                    const toId = parts[1];
                    const text = parts.slice(2).join(' ');
                    this.webSocket.send(JSON.stringify({
                        type: 'private',
                        toId: toId,
                        text: text
                    }));
                }
                break;

            default:
                console.log(chalk.red(`Unknown command: ${cmd}`));
                console.log(chalk.gray('Available: /users, /pm, /quit'));
        }
    }

    sendMessage(text) {
        if (!this.isConnected) {
            console.log(chalk.red('Not connected to server'));
            return;
        }

        this.webSocket.send(JSON.stringify({
            type: 'chat',
            text: text
        }));
    }

    showPrompt() {
        if (this.readLine) {
            this.readLine.prompt(true);
        }
    }

    disconnect() {
        console.log(chalk.yellow('\nDisconnecting...'));
        if (this.webSocket) {
            this.webSocket.close();
        }
        if (this.readLine) {
            this.readLine.close();
        }
        process.exit(0);
    }
}

// CLI entry point
const args = process.argv.slice(2);

if (args.length < 2) {
    console.log('Usage: node client.js <nickname> <server-url>');
    console.log('Example: node client.js Alice ws://your-server.com:3000');
    process.exit(1);
}

const nickname = args[0];
const serverUrl = args[1];

const client = new ChatClient(nickname, serverUrl);
client.connect().catch(err => {
    console.error(chalk.red('Failed to connect:'), err.message);
    process.exit(1);
});