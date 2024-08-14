require('dotenv').config();
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const colors = require('colors');
const readline = require('readline');
const { TelegramClient, Api } = require('telegram');
const { StringSession } = require('telegram/sessions');
const input = require('input');
const glob = require('glob');

class nookie {
    constructor() {
        this.apiId = Number(process.env.API_ID); // Ensure apiId is a number
        this.apiHash = process.env.API_HASH;
        this.sessionPath = path.join(__dirname, 'session');
        this.dataPath = path.join(__dirname, 'data.txt');
        this.deviceModel = 'Galkurta Get Query';
        this.axiosInstance = axios.create({
            httpsAgent: new (require('https').Agent)({ rejectUnauthorized: true })
        });
        this.retryCount = 3;
        this.retryDelay = 1000;
    }

    log(message) {
        console.log(`${colors.cyan('[INFO]')} ${message}`);
    }

    async createSession(phoneNumber, sessionName) {
        try {
            if (typeof this.apiId !== 'number' || typeof this.apiHash !== 'string') {
                throw new Error('Invalid API credentials');
            }

            const client = new TelegramClient(
                new StringSession(""), 
                this.apiId, 
                this.apiHash, 
                { 
                    deviceModel: this.deviceModel, 
                    connectionRetries: 5 
                }
            );
            await client.start({
                phoneNumber: async () => phoneNumber,
                password: async () => await input.text('Enter your password: '),
                phoneCode: async () => await input.text('Enter the code you received: '),
                onError: err => {
                    if (!err.message.includes('TIMEOUT') && !err.message.includes('CastError')) {
                        this.log(`Telegram authentication error: ${colors.red(err.message)}`);
                    }
                },
                twoFA: async () => {
                    const use2FA = await input.confirm('Do you use 2FA? (y/n): ');
                    if (use2FA) {
                        return await input.text('Enter your 2FA code: ');
                    } else {
                        return null;
                    }
                }
            });

            this.log(`${colors.green('Successfully created a new session!')}`);
            const stringSession = client.session.save();
            const sessionId = sessionName || new Date().getTime();
            fs.writeFileSync(path.join(this.sessionPath, `session_${sessionId}.session`), stringSession);
            await client.sendMessage("me", { message: "Successfully created a new session!" });
            this.log(`${colors.green('Saved the new session to session file.')}`);
            await client.disconnect();
        } catch (error) {
            if (!error.message.includes('TIMEOUT') && !error.message.includes('CastError')) {
                this.log(`Error: ${colors.red(error.message)}`);
            }
        }
    }

    async getQueryFromSession() {
        const sessions = glob.sync(`${this.sessionPath}/session_*.session`);
        for (const session of sessions) {
            const sessionFile = path.basename(session);
            try {
                const sessionString = fs.readFileSync(path.join(this.sessionPath, sessionFile), 'utf8');
                const client = new TelegramClient(
                    new StringSession(sessionString), 
                    this.apiId, 
                    this.apiHash,
                    {
                        deviceModel: this.deviceModel,
                        connectionRetries: 5
                    }
                );
                await client.start({
                    phoneNumber: async () => sessionFile,
                    password: async () => await input.text('Enter your password: '),
                    phoneCode: async () => await input.text('Enter the code you received: '),
                    onError: err => {
                        if (!err.message.includes('TIMEOUT') && !err.message.includes('CastError')) {
                            this.log(`Telegram authentication error: ${colors.red(err.message)}`);
                        }
                    },
                });

                const peer = await client.getInputEntity('abcd'); // Replace 'abcd' with bot's username
                if (!peer) {
                    this.log(`${colors.red('Failed to get peer entity.')}`);
                    continue;
                }

                const webview = await client.invoke(
                    new Api.messages.RequestWebView({
                        peer: peer,
                        bot: peer,
                        fromBotMenu: false,
                        platform: 'Android',
                        url: "https://doodstream.com/", // Replace this with your bot's URL
                    })
                );
                if (!webview || !webview.url) {
                    this.log(`${colors.red('Failed to get webview URL.')}`);
                    continue;
                }

                const query = decodeURIComponent(webview.url.split("&tgWebAppVersion=")[0].split("#tgWebAppData=")[1]);
                
                fs.appendFileSync(this.dataPath, `${query}\n`);
                this.log(`${colors.green('Saved query to data.txt')}`);

                await client.disconnect();
            } catch (error) {
                if (!error.message.includes('TIMEOUT') && !error.message.includes('CastError')) {
                    this.log(`Error: ${colors.red(error.message)}`);
                }
            }
        }
    }
}

// Start the process based on user input
if (require.main === module) {
    console.log(colors.red.bold(`
        ██████╗  ███████╗████████╗     ██████╗ ██╗   ██╗███████╗██████╗ ██╗   ██╗
        ██╔════╝ ██╔════╝╚══██╔══╝    ██╔═══██╗██║   ██║██╔════╝██╔══██╗╚██╗ ██╔╝
        ██║  ███╗█████╗     ██║       ██║   ██║██║   ██║█████╗  ██████╔╝ ╚████╔╝ 
        ██║   ██║██╔══╝     ██║       ██║▄▄ ██║██║   ██║██╔══╝  ██╔══██╗  ╚██╔╝  
        ╚██████╔╝███████╗   ██║       ╚██████╔╝╚██████╔╝███████╗██║  ██║   ██║   
         ╚═════╝ ╚══════╝   ╚═╝        ╚══▀▀═╝  ╚═════╝ ╚══════╝╚═╝  ╚═╝   ╚═╝   
    `));
    console.log(colors.yellow.bold(`
                                 Get Query Automation
                                     By: Galkurta
    `));

    const dood = new nookie();
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    const menu = `
${colors.magenta('Please choose an option:')}
${colors.green('1.')} ${colors.cyan('Create session')}
${colors.green('2.')} ${colors.cyan('Get query from session')}
    `;

    console.log(menu);

    rl.question(colors.blue.bold('Choose mode: '), async (option) => {
        rl.close();
        if (option === "1") {
            const phoneNumber = await input.text(`${colors.yellow('Enter your phone number (+): ')}`);
            const sessionName = await input.text(`${colors.yellow('Enter a name for this session (or leave blank for a timestamp): ')}`);
            await dood.createSession(phoneNumber, sessionName);
        } else if (option === "2") {
            await dood.getQueryFromSession();
        } else {
            console.error(colors.red.bold('Invalid option'));
        }
    });
}