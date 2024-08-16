require('dotenv').config();
const fs = require('fs');
const path = require('path'); 
const axios = require('axios');
const { TelegramClient, Api } = require('telegram');
const { StringSession } = require('telegram/sessions');
const TelegramBot = require('node-telegram-bot-api');
const glob = require('glob');

const authorizedUsers = process.env.AUTHORIZED_USERS ? process.env.AUTHORIZED_USERS.split(',') : [];

class Nookie {
    constructor() {
        this.apiId = Number(process.env.API_ID);
        this.apiHash = process.env.API_HASH;
        this.sessionPath = path.join(__dirname, 'session');
        this.dataDir = path.join(__dirname, 'data');
        this.defaultDataPath = path.join(this.dataDir, 'data.txt');
        this.deviceModel = 'Galkurta Get Query';
        this.axiosInstance = axios.create({
            httpsAgent: new (require('https').Agent)({ rejectUnauthorized: true })
        });
        this.retryCount = 3;
        this.retryDelay = 1000;
        this.botUsername = process.env.BOT_USERNAME || null;
        this.botUrl = process.env.BOT_URL || null;
        this.botToken = process.env.BOT_TOKEN;
        this.bot = new TelegramBot(this.botToken, { polling: true });

        if (!fs.existsSync(this.dataDir)) {
            fs.mkdirSync(this.dataDir);
        }

        this.initializeBot();
    }

    log(message) {
        console.log(`ℹ️ [INFO] ${message}`);
    }

    isAuthorizedUser(userId) {
        return authorizedUsers.includes(userId.toString());
    }

    async initializeBot() {
        this.bot.onText(/\/start/, (msg) => {
            const chatId = msg.chat.id;
            if (!this.isAuthorizedUser(chatId)) {
                this.bot.sendMessage(chatId, '❌ Access denied: You are not authorized to use this bot.');
                return;
            }

            this.showMainMenu(chatId, false); // Always exclude "Back" button in the initial UI
        });

        this.bot.on('callback_query', async (callbackQuery) => {
            const action = callbackQuery.data;
            const chatId = callbackQuery.message.chat.id;
            const messageId = callbackQuery.message.message_id;

            // Clear all previous listeners when Back is pressed
            this.bot.removeAllListeners('message');

            if (!this.isAuthorizedUser(chatId)) {
                this.bot.editMessageText('❌ Access denied: You are not authorized to use this bot.', {
                    chat_id: chatId,
                    message_id: messageId,
                });
                return;
            }

            if (action === 'create_session') {
                this.bot.editMessageText('📱 Please enter your phone number (+):', {
                    chat_id: chatId,
                    message_id: messageId,
                    reply_markup: {
                        inline_keyboard: [[{ text: '🔙 Back', callback_data: 'back' }]]
                    }
                });

                this.bot.once('message', async (msg) => {
                    const phoneNumber = msg.text;

                    // If the user pressed back, cancel the create session process
                    if (phoneNumber.toLowerCase() === 'back') {
                        this.showMainMenu(chatId, false, messageId);
                        return;
                    }

                    this.bot.sendMessage(chatId, '📝 Enter a name for this session:');
                    this.bot.once('message', async (msg) => {
                        const sessionName = msg.text || null;

                        // If the user pressed back, cancel the create session process
                        if (sessionName && sessionName.toLowerCase() === 'back') {
                            this.showMainMenu(chatId, false, messageId);
                            return;
                        }

                        await this.createSession(phoneNumber, sessionName, chatId, messageId);
                    });
                });
            } else if (action === 'get_query_menu') {
                this.showGetQueryMenu(chatId, messageId);
            } else if (action === 'get_query') {
                this.askForFilenameAndSaveQuery(chatId, messageId);
            } else if (action === 'update_credentials') {
                this.askForNewCredentials(chatId, messageId);
            } else if (action === 'view_files') {
                await this.sendListOfDataFiles(chatId, messageId);
            } else if (action === 'view_sessions') {
                await this.sendListOfSessionFiles(chatId, messageId);
            } else if (action === 'delete_file') {
                this.askForDeleteOptions(chatId, messageId);
            } else if (action === 'back') {
                this.showMainMenu(chatId, false, messageId); // Always exclude "Back" button when returning to the main menu
            } else if (action === 'back_to_main') {
                this.showMainMenu(chatId, false, messageId); // Back to main menu from Get Query menu
            }
        });
    }

    async createSession(phoneNumber, sessionName, chatId, messageId) {
        try {
            const sessionPath = sessionName 
                ? path.join(this.sessionPath, `session_${sessionName}.session`)
                : path.join(this.sessionPath, `session_${Date.now()}.session`);

            const client = new TelegramClient(
                new StringSession(''),
                this.apiId,
                this.apiHash,
                {
                    deviceModel: this.deviceModel,
                    connectionRetries: 5
                }
            );

            await client.start({
                phoneNumber: () => phoneNumber,
                password: () => new Promise((resolve) => {
                    this.bot.sendMessage(chatId, '🔑 Please enter your password (if necessary):');
                    this.bot.once('message', (msg) => {
                        resolve(msg.text);
                    });
                }),
                phoneCode: () => new Promise((resolve) => {
                    this.bot.sendMessage(chatId, '🔢 Please enter the code you received:');
                    this.bot.once('message', (msg) => {
                        resolve(msg.text);
                    });
                }),
                onError: (err) => {
                    throw new Error(err);
                }
            });

            const sessionString = client.session.save();
            fs.writeFileSync(sessionPath, sessionString, 'utf8');

            await client.disconnect();

            this.bot.sendMessage(chatId, '✅ Session created successfully.', {
                reply_markup: {
                    inline_keyboard: [[{ text: '🔙 Back', callback_data: 'back' }]]
                }
            });
        } catch (error) {
            this.bot.sendMessage(chatId, `⚠️ Failed to create session: ${error.message}`, {
                reply_markup: {
                    inline_keyboard: [[{ text: '🔙 Back', callback_data: 'back' }]]
                }
            });
        }
    }

    showMainMenu(chatId, includeBackButton = false, messageId = null) {
        const text = '🛠️ Choose an option:';
        const options = {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🔑 Create Session', callback_data: 'create_session' }],
                    [{ text: '📄 Get Query', callback_data: 'get_query_menu' }],
                    [{ text: '📂 View Query Files', callback_data: 'view_files' }],
                    [{ text: '🗂️ View Session Files', callback_data: 'view_sessions' }],
                    [{ text: '🗑️ Delete or Clear a Query File', callback_data: 'delete_file' }]
                ]
            }
        };

        if (includeBackButton) {
            options.reply_markup.inline_keyboard.push([{ text: '🔙 Back', callback_data: 'back' }]);
        }

        if (messageId) {
            this.bot.editMessageText(text, {
                chat_id: chatId,
                message_id: messageId,
                ...options
            });
        } else {
            this.bot.sendMessage(chatId, text, options);
        }
    }

    showGetQueryMenu(chatId, messageId = null) {
        const text = '📄 Get Query Menu:';
        const options = {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '💾 Retrive Query', callback_data: 'get_query' }],
                    [{ text: '🔄 Update Credentials', callback_data: 'update_credentials' }],
                    [{ text: '🔙 Back', callback_data: 'back_to_main' }]
                ]
            }
        };

        if (messageId) {
            this.bot.editMessageText(text, {
                chat_id: chatId,
                message_id: messageId,
                ...options
            });
        } else {
            this.bot.sendMessage(chatId, text, options);
        }
    }

    askForFilenameAndSaveQuery(chatId, messageId) {
        this.bot.editMessageText('📝 Enter the name for the query file (it will be saved as .txt):', {
            chat_id: chatId,
            message_id: messageId,
            reply_markup: {
                inline_keyboard: [[{ text: '🔙 Back', callback_data: 'back_to_main' }]]
            }
        });

        this.bot.once('message', async (msg) => {
            let filename = msg.text.trim();

            // Tambahkan ekstensi .txt jika belum ada
            if (!filename.endsWith('.txt')) {
                filename += '.txt';
            }

            // Hapus pesan pengguna setelah diproses
            await this.bot.deleteMessage(chatId, msg.message_id);

            // Tampilkan pesan "Please wait..."
            const waitingMessage = await this.bot.editMessageText('⏳ Please wait...', {
                chat_id: chatId,
                message_id: messageId,
            });

            const filepath = path.join(this.dataDir, filename);
            await this.getQueryFromSession(chatId, filepath, waitingMessage.message_id);
        });
    }      

    async getQueryFromSession(chatId, filepath, waitingMessageId) {
        const sessions = glob.sync(`${this.sessionPath}/session_*.session`);
        let saved = false;
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
                    phoneNumber: async () => sessionFile
                });
    
                const peer = await client.getInputEntity(this.botUsername);
                const webview = await client.invoke(
                    new Api.messages.RequestWebView({
                        peer: peer,
                        bot: peer,
                        fromBotMenu: false,
                        platform: 'Android',
                        url: this.botUrl,
                    })
                );
                const query = decodeURIComponent(webview.url.split("&tgWebAppVersion=")[0].split("#tgWebAppData=")[1]);
                fs.appendFileSync(filepath, `${query}\n`);
                saved = true;
                await client.disconnect();
            } catch (error) {
                this.bot.editMessageText(`⚠️ Error: ${error.message}`, {
                    chat_id: chatId,
                    message_id: waitingMessageId,
                    reply_markup: {
                        inline_keyboard: [[{ text: '🔙 Back', callback_data: 'back' }]]
                    }
                });
                return;
            }
        }
    
        if (saved) {
            this.bot.editMessageText(`✅ Saved query to ${path.basename(filepath)}.`, {
                chat_id: chatId,
                message_id: waitingMessageId,
                reply_markup: {
                    inline_keyboard: [[{ text: '🔙 Back', callback_data: 'back' }]]
                }
            });
        } else {
            this.bot.editMessageText('⚠️ No sessions found to save query from.', {
                chat_id: chatId,
                message_id: waitingMessageId,
                reply_markup: {
                    inline_keyboard: [[{ text: '🔙 Back', callback_data: 'back' }]]
                }
            });
        }
    }
    
    async sendListOfDataFiles(chatId, messageId) {
        try {
            const files = fs.readdirSync(this.dataDir).filter(file => file.endsWith('.txt'));
            if (files.length === 0) {
                this.bot.editMessageText('⚠️ No .txt files found.', {
                    chat_id: chatId,
                    message_id: messageId,
                    reply_markup: {
                        inline_keyboard: [[{ text: '🔙 Back', callback_data: 'back' }]]
                    }
                });
                return;
            }

            const fileList = files.map((file, index) => `${index + 1}. ${file}`).join('\n');
            this.bot.editMessageText(`📂 Available query files:\n${fileList}\n\nSend the number of the file you want to receive:`, {
                chat_id: chatId,
                message_id: messageId,
                reply_markup: {
                    inline_keyboard: [[{ text: '🔙 Back', callback_data: 'back' }]]
                }
            });

            this.bot.once('message', async (msg) => {
                const choice = parseInt(msg.text);
                // Hapus pesan pengguna setelah diproses
                await this.bot.deleteMessage(chatId, msg.message_id);
                if (isNaN(choice) || choice < 1 || choice > files.length) {
                    this.bot.editMessageText('🚫 Invalid choice.', {
                        chat_id: chatId,
                        message_id: messageId,
                        reply_markup: {
                            inline_keyboard: [[{ text: '🔙 Back', callback_data: 'back' }]]
                        }
                    });
                } else {
                    const selectedFile = files[choice - 1];
                    const filePath = path.join(this.dataDir, selectedFile);

                    // Periksa apakah file kosong
                    const fileContent = fs.readFileSync(filePath, 'utf8');
                    if (fileContent.trim() === '') {
                        // Tampilkan peringatan terlebih dahulu
                        this.bot.editMessageText(`⚠️ Warning: The file ${selectedFile} is empty.`, {
                            chat_id: chatId,
                            message_id: messageId,
                            reply_markup: {
                                inline_keyboard: [[{ text: '🔙 Back', callback_data: 'back' }]]
                            }
                        });
                    } else {
                        // Kirim pesan konfirmasi terlebih dahulu
                        await this.bot.editMessageText(`📤 Sending file ${selectedFile}...`, {
                            chat_id: chatId,
                            message_id: messageId
                        });

                        // Kirim file setelah pesan konfirmasi
                        await this.bot.sendDocument(chatId, filePath, {
                            contentType: 'text/plain',
                        });

                        // Tampilkan kembali UI di bawah file yang dikirimkan
                        await this.bot.sendMessage(chatId, `✅ File ${selectedFile} has been sent.`, {
                            reply_markup: {
                                inline_keyboard: [[{ text: '🔙 Back', callback_data: 'back' }]]
                            }
                        });
                    }
                }
            });
        } catch (error) {
            this.bot.editMessageText(`⚠️ Error: ${error.message}`, {
                chat_id: chatId,
                message_id: messageId,
                reply_markup: {
                    inline_keyboard: [[{ text: '🔙 Back', callback_data: 'back' }]]
                }
            });
        }
    }

    async sendListOfSessionFiles(chatId, messageId) {
        try {
            const files = fs.readdirSync(this.sessionPath).filter(file => file.startsWith('session_'));
            if (files.length === 0) {
                this.bot.editMessageText('⚠️ No session files found.', {
                    chat_id: chatId,
                    message_id: messageId,
                    reply_markup: {
                        inline_keyboard: [[{ text: '🔙 Back', callback_data: 'back' }]]
                    }
                });
                return;
            }

            const fileList = files.map((file, index) => `${index + 1}. ${file}`).join('\n');
            this.bot.editMessageText(`🗂️ Available session files:\n${fileList}`, {
                chat_id: chatId,
                message_id: messageId,
                reply_markup: {
                    inline_keyboard: [[{ text: '🔙 Back', callback_data: 'back' }]]
                }
            });

        } catch (error) {
            this.bot.editMessageText(`⚠️ Error: ${error.message}`, {
                chat_id: chatId,
                message_id: messageId,
                reply_markup: {
                    inline_keyboard: [[{ text: '🔙 Back', callback_data: 'back' }]]
                }
            });
        }
    }

    askForDeleteOptions(chatId, messageId) {
        this.bot.editMessageText('🗑️ Do you want to delete the query file or clear its content?', {
            chat_id: chatId,
            message_id: messageId,
            reply_markup: {
                inline_keyboard: [
                    [{ text: '❌ Delete Query File', callback_data: 'delete_file_confirm' }],
                    [{ text: '🧹 Clear Query File Content', callback_data: 'clear_file_content' }],
                    [{ text: '🔙 Back', callback_data: 'back' }]
                ]
            }
        });

        this.bot.once('callback_query', async (callbackQuery) => {
            const action = callbackQuery.data;

            if (action === 'delete_file_confirm') {
                this.askForFilenameAndDelete(chatId, messageId);
            } else if (action === 'clear_file_content') {
                this.askForFilenameAndClear(chatId, messageId);
            }
        });
    }

    askForFilenameAndDelete(chatId, messageId) {
        // Dapatkan daftar file .txt yang ada di direktori data
        const files = fs.readdirSync(this.dataDir).filter(file => file.endsWith('.txt'));
    
        // Tampilkan daftar file sebelum meminta input pengguna
        let fileListMessage = '🗑️ Enter the filename to delete (e.g., data.txt):\n\nAvailable files:\n';
        if (files.length === 0) {
            fileListMessage += '⚠️ No files available.';
        } else {
            fileListMessage += files.map((file, index) => `${index + 1}. ${file}`).join('\n');
        }
    
        this.bot.editMessageText(fileListMessage, {
            chat_id: chatId,
            message_id: messageId,
            reply_markup: {
                inline_keyboard: [[{ text: '🔙 Back', callback_data: 'back' }]]
            }
        });
    
        this.bot.once('message', async (msg) => {
            let filename = msg.text.trim();
    
            // Tambahkan ekstensi .txt jika belum ada
            if (!filename.endsWith('.txt')) {
                filename += '.txt';
            }
    
            // Hapus pesan pengguna setelah diproses
            await this.bot.deleteMessage(chatId, msg.message_id);
    
            const filepath = path.join(this.dataDir, filename);
    
            if (fs.existsSync(filepath)) {
                fs.unlinkSync(filepath);
                this.bot.editMessageText(`✅ File ${filename} has been deleted.`, {
                    chat_id: chatId,
                    message_id: messageId,
                    reply_markup: {
                        inline_keyboard: [[{ text: '🔙 Back', callback_data: 'back' }]]
                    }
                });
                this.showMainMenu(chatId, false, messageId); // Kembali ke menu utama setelah penghapusan file
            } else {
                this.bot.editMessageText(`❗ File ${filename} not found.`, {
                    chat_id: chatId,
                    message_id: messageId,
                    reply_markup: {
                        inline_keyboard: [[{ text: '🔙 Back', callback_data: 'back' }]]
                    }
                });
                this.showMainMenu(chatId, false, messageId); // Kembali ke menu utama jika file tidak ditemukan
            }
        });
    }    

    askForFilenameAndClear(chatId, messageId) {
        // Dapatkan daftar file .txt yang ada di direktori data
        const files = fs.readdirSync(this.dataDir).filter(file => file.endsWith('.txt'));
    
        // Tampilkan daftar file sebelum meminta input pengguna
        let fileListMessage = '🧹 Enter the filename to clear its content (e.g., data.txt):\n\nAvailable files:\n';
        if (files.length === 0) {
            fileListMessage += '⚠️ No files available.';
        } else {
            fileListMessage += files.map((file, index) => `${index + 1}. ${file}`).join('\n');
        }
    
        this.bot.editMessageText(fileListMessage, {
            chat_id: chatId,
            message_id: messageId,
            reply_markup: {
                inline_keyboard: [[{ text: '🔙 Back', callback_data: 'back' }]]
            }
        });
    
        this.bot.once('message', async (msg) => {
            let filename = msg.text.trim();
    
            // Tambahkan ekstensi .txt jika belum ada
            if (!filename.endsWith('.txt')) {
                filename += '.txt';
            }
    
            // Hapus pesan pengguna setelah diproses
            await this.bot.deleteMessage(chatId, msg.message_id);
    
            const filepath = path.join(this.dataDir, filename);
    
            if (fs.existsSync(filepath)) {
                try {
                    // Kosongkan konten file
                    fs.writeFileSync(filepath, '', 'utf8');
                    this.bot.editMessageText(`✅ Content of ${filename} has been cleared.`, {
                        chat_id: chatId,
                        message_id: messageId,
                        reply_markup: {
                            inline_keyboard: [[{ text: '🔙 Back', callback_data: 'back' }]]
                        }
                    });
                } catch (error) {
                    this.bot.editMessageText(`⚠️ Failed to clear content of ${filename}: ${error.message}`, {
                        chat_id: chatId,
                        message_id: messageId,
                        reply_markup: {
                            inline_keyboard: [[{ text: '🔙 Back', callback_data: 'back' }]]
                        }
                    });
                }
            } else {
                this.bot.editMessageText(`❗ File ${filename} not found.`, {
                    chat_id: chatId,
                    message_id: messageId,
                    reply_markup: {
                        inline_keyboard: [[{ text: '🔙 Back', callback_data: 'back' }]]
                    }
                });
            }
    
            // Kembali ke menu utama
            this.showMainMenu(chatId, false, messageId);
        });
    }       

    askForNewCredentials(chatId, messageId) {
        this.bot.editMessageText('🔄 Please enter the new bot username:', {
            chat_id: chatId,
            message_id: messageId,
            reply_markup: {
                inline_keyboard: [[{ text: '🔙 Back', callback_data: 'back_to_main' }]]
            }
        });

        this.bot.once('message', (msg) => {
            const newUsername = msg.text;

            this.bot.sendMessage(chatId, '🔗 Please enter the new bot URL:');
            this.bot.once('message', (msg) => {
                const newUrl = msg.text;

                // Simpan username dan URL baru ke dalam .env atau konfigurasi lain yang digunakan
                this.botUsername = newUsername;
                this.botUrl = newUrl;
                this.saveBotCredentials();

                this.bot.sendMessage(chatId, `✅ Bot credentials updated.\nUsername: ${this.botUsername}\nURL: ${this.botUrl}`, {
                    reply_markup: {
                        inline_keyboard: [[{ text: '🔙 Back', callback_data: 'back_to_main' }]]
                    }
                });
            });
        });
    }

    saveBotCredentials() {
        const envData = fs.readFileSync('.env', 'utf8');
        const newEnvData = envData
            .replace(/BOT_USERNAME=.*/g, `BOT_USERNAME=${this.botUsername}`)
            .replace(/BOT_URL=.*/g, `BOT_URL=${this.botUrl}`);
        fs.writeFileSync('.env', newEnvData, 'utf8');
    }
}

console.log('🤖 Bot running...');
const nookie = new Nookie();
