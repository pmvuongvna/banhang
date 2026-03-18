/**
 * QLBH - Telegram Notification Module
 * Sends sale notifications via Telegram Bot API
 */

const TelegramNotify = {
    botToken: '',
    chatId: '',
    enabled: false,

    /**
     * Load config from Settings sheet
     */
    async loadConfig() {
        try {
            const data = await SheetsAPI.readData(`${CONFIG.SHEETS.SETTINGS}!A1:B20`);
            const tokenRow = data.find(row => row[0] === 'telegram_bot_token');
            const chatIdRow = data.find(row => row[0] === 'telegram_chat_id');

            this.botToken = tokenRow ? tokenRow[1] : '';
            this.chatId = chatIdRow ? chatIdRow[1] : '';
            this.enabled = !!(this.botToken && this.chatId);

            console.log(`[Telegram] Config loaded, enabled: ${this.enabled}`);
        } catch (error) {
            console.error('[Telegram] Error loading config:', error);
        }
    },

    /**
     * Save config to Settings sheet
     */
    async saveConfig(token, chatId) {
        try {
            const data = await SheetsAPI.readData(`${CONFIG.SHEETS.SETTINGS}!A1:B20`);

            // Save bot token
            const tokenRowIndex = data.findIndex(row => row[0] === 'telegram_bot_token');
            if (tokenRowIndex >= 0) {
                await SheetsAPI.updateData(
                    `${CONFIG.SHEETS.SETTINGS}!B${tokenRowIndex + 1}`,
                    [[token]]
                );
            } else {
                await SheetsAPI.appendData(CONFIG.SHEETS.SETTINGS, ['telegram_bot_token', token]);
            }

            // Save chat ID
            const chatIdRowIndex = data.findIndex(row => row[0] === 'telegram_chat_id');
            if (chatIdRowIndex >= 0) {
                await SheetsAPI.updateData(
                    `${CONFIG.SHEETS.SETTINGS}!B${chatIdRowIndex + 1}`,
                    [[chatId]]
                );
            } else {
                await SheetsAPI.appendData(CONFIG.SHEETS.SETTINGS, ['telegram_chat_id', chatId]);
            }

            this.botToken = token;
            this.chatId = chatId;
            this.enabled = !!(token && chatId);

            return true;
        } catch (error) {
            console.error('[Telegram] Error saving config:', error);
            throw error;
        }
    },

    /**
     * Check if Telegram notifications are enabled
     */
    isEnabled() {
        return this.enabled && this.botToken && this.chatId;
    },

    /**
     * Send a message via Telegram Bot API
     */
    async sendMessage(text) {
        if (!this.isEnabled()) return false;

        try {
            const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: this.chatId,
                    text: text,
                    parse_mode: 'HTML'
                })
            });

            const result = await response.json();
            if (!result.ok) {
                console.error('[Telegram] API error:', result.description);
                return false;
            }
            return true;
        } catch (error) {
            console.error('[Telegram] Send error:', error);
            return false;
        }
    },

    /**
     * Send sale notification
     */
    async sendSaleNotification({ saleId, datetime, details, total, profit, note, isDebt, customerName }) {
        const storeName = localStorage.getItem(CONFIG.STORAGE_KEYS.STORE_NAME) || 'Cửa hàng';

        let message = `🛒 <b>ĐƠN HÀNG MỚI</b> — ${saleId}\n`;
        message += `🏪 ${storeName}\n`;
        message += `📅 ${datetime}\n`;
        message += `━━━━━━━━━━━━━━━\n`;
        message += `📦 ${details}\n`;
        message += `━━━━━━━━━━━━━━━\n`;
        message += `💰 <b>Tổng: ${Products.formatCurrency(total)}</b>\n`;
        message += `📈 Lợi nhuận: ${Products.formatCurrency(profit)}\n`;

        if (isDebt) {
            message += `💳 <b>BÁN NỢ</b> — ${customerName}\n`;
        }

        if (note) {
            message += `📝 ${note}\n`;
        }

        // Fire-and-forget, don't block checkout
        this.sendMessage(message).then(ok => {
            if (ok) {
                console.log('[Telegram] Sale notification sent');
            } else {
                console.warn('[Telegram] Failed to send sale notification');
            }
        });
    },

    /**
     * Send test message to verify configuration
     */
    async testConnection(token, chatId) {
        try {
            const storeName = localStorage.getItem(CONFIG.STORAGE_KEYS.STORE_NAME) || 'Cửa hàng';
            const url = `https://api.telegram.org/bot${token}/sendMessage`;
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: chatId,
                    text: `✅ <b>Kết nối thành công!</b>\n\n🏪 ${storeName}\n🤖 Bot đã sẵn sàng gửi thông báo đơn hàng mới.`,
                    parse_mode: 'HTML'
                })
            });

            const result = await response.json();
            if (!result.ok) {
                throw new Error(result.description || 'Telegram API error');
            }
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
};
