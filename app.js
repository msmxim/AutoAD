const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const fs = require('fs');
const readline = require('readline');

const CHAT_INTERVALS = {
    '@arz_vice': 5,
    '@crarizonarp': 5,
    '@arizona_market_vice': 15,
    '@arzmarket_vice': 60,
    '@VCDarkside': 30
};

let lastMessageData = null;

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function askQuestion(query) {
    return new Promise(resolve => rl.question(query, resolve));
}

function loadConfig() {
    const defaultConfig = {
        sessionString: '',
        API_ID: 0,
        API_HASH: '',
        sourceBot: '@ArzMarketAuth_Bot'
    };

    try {
        const data = fs.readFileSync('./config.json', 'utf-8');
        return {...defaultConfig, ...JSON.parse(data)};
    } catch {
        fs.writeFileSync('./config.json', JSON.stringify(defaultConfig, null, 2));
        return defaultConfig;
    }
}

async function setupIntervalSending(client, chatId, intervalMinutes) {
    const sendMessage = async () => {
        if (!lastMessageData) return;
        
        try {
            await client.sendMessage(chatId, lastMessageData);
            console.log(`[${new Date().toLocaleTimeString()}] Отправлено в ${chatId}`);
        } catch (error) {
            console.error(`Ошибка отправки в ${chatId}:`, error.message);
        }
    };

    await sendMessage();
    
    const intervalMs = intervalMinutes * 60 * 1000;
    const intervalId = setInterval(sendMessage, intervalMs);
    
    console.log(`Настроена периодическая отправка в ${chatId} каждые ${intervalMinutes} мин`);
    
    return intervalId;
}

(async () => {
    const config = loadConfig();
    const session = new StringSession(config.sessionString);
    const client = new TelegramClient(session, config.API_ID, config.API_HASH, {
        connectionRetries: 5
    });

    console.log('Подключение к Telegram...');

    if (!config.sessionString) {
        await client.start({
            phoneNumber: async () => await askQuestion("Введите номер телефона: "),
            password: async () => await askQuestion("Пароль (если есть): "),
            phoneCode: async () => await askQuestion("Введите код подтверждения: "),
            onError: (err) => console.error('Ошибка входа:', err)
        });

        config.sessionString = client.session.save();
        fs.writeFileSync('./config.json', JSON.stringify(config, null, 2));
        console.log('Сессия сохранена!');
    } else {
        await client.connect();
    }

    // Запускаем интервалы для каждого чата
    const intervalIds = [];
    for (const [chatId, interval] of Object.entries(CHAT_INTERVALS)) {
        const id = await setupIntervalSending(client, chatId, interval);
        intervalIds.push(id);
    }

    async function checkMessages() {
        try {
            const messages = await client.getMessages(config.sourceBot, { limit: 1 });
            
            if (messages.length > 0) {
                const msg = messages[0];
                
                // Обновляем последнее сообщение
                lastMessageData = {
                    message: msg.message || '',
                    entities: msg.entities,
                    formattingEntities: msg.formattingEntities,
                    parseMode: 'html',
                    file: msg.media
                };
            }
        } catch (error) {
            console.error('Ошибка при проверке сообщений:', error);
        }

        setTimeout(checkMessages, 5000); // Проверяем каждые 5 секунд
    }

    console.log(`Мониторинг бота ${config.sourceBot}...`);
    checkMessages();

    process.on('SIGINT', async () => {
        // Очищаем все интервалы перед выходом
        intervalIds.forEach(clearInterval);
        await client.disconnect();
        process.exit();
    });
})();