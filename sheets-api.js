/**
 * QLBH - Sheets API Module (Apps Script Backend)
 * Replaces direct Google API calls with fetch() to Apps Script Web App URL
 * No OAuth login required - Apps Script runs as the Sheet owner
 */

const SheetsAPI = {
    scriptUrl: null,
    spreadsheetId: null, // Keep for compatibility, but not used in API calls
    isInitialized: false,
    _sheetIdsCache: null,
    _sheetIdsCacheTime: 0,

    /**
     * Initialize - load saved script URL from localStorage
     */
    async init() {
        this.scriptUrl = localStorage.getItem('qlbh_script_url');
        this.spreadsheetId = localStorage.getItem(CONFIG.STORAGE_KEYS.SPREADSHEET_ID) || 'apps-script';
        this.isInitialized = true;
        console.log('[SheetsAPI] Initialized (Apps Script mode)');
    },

    /**
     * Save the Apps Script URL
     */
    setScriptUrl(url) {
        // Clean up URL - remove trailing slash
        url = url.trim().replace(/\/+$/, '');
        this.scriptUrl = url;
        localStorage.setItem('qlbh_script_url', url);
        // Also set a pseudo spreadsheet ID so other parts of the app think it's connected
        this.spreadsheetId = 'apps-script-connected';
        localStorage.setItem(CONFIG.STORAGE_KEYS.SPREADSHEET_ID, this.spreadsheetId);
    },

    /**
     * Check if script URL is configured
     */
    hasValidToken() {
        return !!this.scriptUrl;
    },

    /**
     * Check if the Apps Script URL is reachable
     */
    async checkSpreadsheet() {
        if (!this.scriptUrl) return false;
        try {
            const result = await this._get('ping');
            return result && result.status === 'ok';
        } catch (error) {
            console.error('[SheetsAPI] Ping failed:', error);
            return false;
        }
    },

    /**
     * Get store name from the Sheet
     */
    async getStoreName() {
        try {
            const result = await this._get('getStoreName');
            const name = result?.name || '';
            // Strip "QLBH - " prefix if present
            return name.replace(/^QLBH\s*-\s*/, '') || 'Cửa hàng';
        } catch (error) {
            return localStorage.getItem(CONFIG.STORAGE_KEYS.STORE_NAME) || 'Cửa hàng';
        }
    },

    /**
     * "Sign in" — just verify the URL works
     * For compatibility with existing code that calls signIn()
     */
    signIn() {
        // In Apps Script mode, there's no OAuth sign in
        // The setup screen handles URL input
        console.log('[SheetsAPI] signIn() called — using Apps Script mode, no OAuth needed');
    },

    /**
     * "Sign out" — clear saved URL
     */
    signOut() {
        this.scriptUrl = null;
        this.spreadsheetId = null;
        localStorage.removeItem('qlbh_script_url');
        localStorage.removeItem(CONFIG.STORAGE_KEYS.SPREADSHEET_ID);
        localStorage.removeItem(CONFIG.STORAGE_KEYS.STORE_NAME);
    },

    /**
     * Get user info — not available in Apps Script mode
     * Return a dummy object
     */
    async getUserInfo() {
        return {
            name: localStorage.getItem(CONFIG.STORAGE_KEYS.STORE_NAME) || 'QLBH User',
            picture: '',
            email: ''
        };
    },

    /**
     * These methods are no-ops in Apps Script mode:
     */
    initTokenClient(callback) { /* no-op */ },
    startTokenGuard() { /* no-op */ },
    saveToken() { /* no-op */ },
    restoreToken() { return false; },
    clearToken() { /* no-op */ },
    scheduleTokenRefresh() { /* no-op */ },
    silentRefresh() { /* no-op */ },
    async ensureValidToken() { return true; },

    /**
     * API call with retry - simplified for Apps Script
     */
    async apiCallWithRetry(apiCall) {
        try {
            return await apiCall();
        } catch (error) {
            // Retry once
            console.warn('[SheetsAPI] First attempt failed, retrying...', error);
            return await apiCall();
        }
    },

    // ==========================================
    // Core Data Operations
    // ==========================================

    /**
     * Read data from a range
     */
    async readData(range) {
        try {
            const result = await this._get('read', { range });
            return result?.data || [];
        } catch (error) {
            console.error('Error reading data:', error);
            return [];
        }
    },

    /**
     * Append data to a sheet
     */
    async appendData(sheetName, values) {
        try {
            const row = Array.isArray(values[0]) ? values[0] : values;
            return await this._post({
                action: 'append',
                sheetName: sheetName,
                row: row
            });
        } catch (error) {
            console.error('Error appending data:', error);
            throw error;
        }
    },

    /**
     * Update data in a specific range
     */
    async updateData(range, values) {
        try {
            return await this._post({
                action: 'update',
                range: range,
                values: values
            });
        } catch (error) {
            console.error('Error updating data:', error);
            throw error;
        }
    },

    /**
     * Update data in RAW mode (for values with commas, etc.)
     */
    async updateRaw(range, values) {
        try {
            return await this._post({
                action: 'updateRaw',
                range: range,
                values: values
            });
        } catch (error) {
            console.error('Error updating data (RAW):', error);
            throw error;
        }
    },

    /**
     * Append data in RAW mode
     */
    async appendRaw(sheetName, values) {
        try {
            const row = Array.isArray(values[0]) ? values[0] : values;
            return await this._post({
                action: 'appendRaw',
                sheetName: sheetName,
                row: row
            });
        } catch (error) {
            console.error('Error appending data (RAW):', error);
            throw error;
        }
    },

    /**
     * Delete a row by index (1-based as passed from existing code)
     */
    async deleteRow(sheetName, rowIndex) {
        try {
            return await this._post({
                action: 'deleteRow',
                sheetName: sheetName,
                rowIndex: rowIndex
            });
        } catch (error) {
            console.error('Error deleting row:', error);
            throw error;
        }
    },

    /**
     * Get sheet IDs (cached for 30 seconds)
     */
    async getSheetIds() {
        const now = Date.now();
        if (this._sheetIdsCache && (now - this._sheetIdsCacheTime) < 30000) {
            return this._sheetIdsCache;
        }

        try {
            const result = await this._get('getSheetIds');
            this._sheetIdsCache = result?.sheetIds || {};
            this._sheetIdsCacheTime = now;
            return this._sheetIdsCache;
        } catch (error) {
            console.error('Error getting sheet IDs:', error);
            return this._sheetIdsCache || {};
        }
    },

    /**
     * Ensure a sheet exists, create if not
     */
    async ensureSheetExists(sheetName, headers) {
        // Check local cache first
        const sheetIds = await this.getSheetIds();
        if (sheetIds[sheetName]) return true;

        try {
            const result = await this._post({
                action: 'ensureSheet',
                sheetName: sheetName,
                headers: headers
            });

            // Invalidate cache
            this._sheetIdsCache = null;
            return true;
        } catch (error) {
            console.error(`Error creating sheet ${sheetName}:`, error);
            throw error;
        }
    },

    /**
     * Get sheet name with month suffix (e.g. Sales_02_2026)
     * Pure utility function — no API call needed
     */
    getMonthSheetName(baseName, date = new Date()) {
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        return `${baseName}_${month}_${year}`;
    },

    /**
     * Create spreadsheet — in Apps Script mode, the Sheet already exists
     * This is called from the setup flow, so we just verify connection
     */
    async createSpreadsheet(storeName) {
        // In Apps Script mode, user already has a Sheet
        // Just save the store name
        localStorage.setItem(CONFIG.STORAGE_KEYS.STORE_NAME, storeName);
        return 'apps-script-connected';
    },

    /**
     * Link existing sheet — in Apps Script mode, user provides the script URL
     * Called when user enters URL in setup screen
     */
    async linkExistingSheet(scriptUrl) {
        try {
            this.setScriptUrl(scriptUrl);
            const isOk = await this.checkSpreadsheet();
            if (!isOk) {
                this.signOut();
                throw new Error('Không thể kết nối. Kiểm tra lại URL Apps Script.');
            }

            const storeName = await this.getStoreName();
            localStorage.setItem(CONFIG.STORAGE_KEYS.STORE_NAME, storeName);

            return { success: true, storeName };
        } catch (error) {
            console.error('Error linking via Apps Script:', error);
            throw error;
        }
    },

    // ==========================================
    // Internal HTTP helpers
    // ==========================================

    /**
     * GET request to Apps Script
     */
    async _get(action, params = {}) {
        if (!this.scriptUrl) throw new Error('Apps Script URL chưa được cấu hình');

        const url = new URL(this.scriptUrl);
        url.searchParams.set('action', action);
        for (const [key, value] of Object.entries(params)) {
            url.searchParams.set(key, value);
        }

        const response = await fetch(url.toString(), {
            method: 'GET',
            redirect: 'follow' // Apps Script redirects on deployment
        });

        if (!response.ok) {
            throw new Error(`GET failed: ${response.status} ${response.statusText}`);
        }

        return await response.json();
    },

    /**
     * POST request to Apps Script
     */
    async _post(body) {
        if (!this.scriptUrl) throw new Error('Apps Script URL chưa được cấu hình');

        const response = await fetch(this.scriptUrl, {
            method: 'POST',
            redirect: 'follow',
            headers: { 'Content-Type': 'text/plain' }, // Apps Script requires text/plain for CORS
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            throw new Error(`POST failed: ${response.status} ${response.statusText}`);
        }

        return await response.json();
    }
};
