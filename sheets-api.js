/**
 * QLBH - Sheets API Module (Cloudflare Worker Backend)
 * Routes all data operations through Worker API with D1 database
 * Keeps same method signatures for backward compatibility
 */

const SheetsAPI = {
    workerUrl: null,
    token: null,
    spreadsheetId: null, // Kept for compatibility
    isInitialized: false,

    /**
     * Initialize - load saved config from localStorage
     */
    async init() {
        this.workerUrl = localStorage.getItem('qlbh_worker_url') || '';
        this.token = localStorage.getItem('qlbh_token') || '';
        this.spreadsheetId = this.token ? 'worker-connected' : null;
        this.isInitialized = true;
        console.log('[SheetsAPI] Initialized (Worker mode)');
    },

    /**
     * Check if user is logged in
     */
    hasValidToken() {
        return !!this.token && !!this.workerUrl;
    },

    /**
     * Register new user
     */
    async register(email, password, storeName) {
        const res = await this._fetch('/auth/register', 'POST', { email, password, storeName });
        if (res.token) {
            this.token = res.token;
            localStorage.setItem('qlbh_token', res.token);
            this.spreadsheetId = 'worker-connected';
            localStorage.setItem(CONFIG.STORAGE_KEYS.SPREADSHEET_ID, 'worker-connected');
            localStorage.setItem(CONFIG.STORAGE_KEYS.STORE_NAME, res.storeName);
        }
        return res;
    },

    /**
     * Login
     */
    async login(email, password) {
        const res = await this._fetch('/auth/login', 'POST', { email, password });
        if (res.token) {
            this.token = res.token;
            localStorage.setItem('qlbh_token', res.token);
            this.spreadsheetId = 'worker-connected';
            localStorage.setItem(CONFIG.STORAGE_KEYS.SPREADSHEET_ID, 'worker-connected');
            localStorage.setItem(CONFIG.STORAGE_KEYS.STORE_NAME, res.storeName);
        }
        return res;
    },

    /**
     * Sign in - compatibility wrapper (no-op, login is via form)
     */
    signIn() { /* handled by login form */ },

    /**
     * Sign out
     */
    signOut() {
        this.token = null;
        this.spreadsheetId = null;
        localStorage.removeItem('qlbh_token');
        localStorage.removeItem(CONFIG.STORAGE_KEYS.SPREADSHEET_ID);
        localStorage.removeItem(CONFIG.STORAGE_KEYS.STORE_NAME);
    },

    /**
     * Get user info
     */
    async getUserInfo() {
        try {
            const res = await this._fetch('/api/me');
            return {
                name: res.data?.store_name || 'QLBH User',
                email: res.data?.email || '',
                picture: ''
            };
        } catch (e) {
            return { name: localStorage.getItem(CONFIG.STORAGE_KEYS.STORE_NAME) || 'QLBH User', email: '', picture: '' };
        }
    },

    /**
     * Check if backend is reachable
     */
    async checkSpreadsheet() {
        if (!this.token || !this.workerUrl) return false;
        try {
            const res = await this._fetch('/ping');
            return res?.status === 'ok';
        } catch (e) {
            return false;
        }
    },

    /**
     * Get store name
     */
    async getStoreName() {
        try {
            const res = await this._fetch('/api/me');
            return res.data?.store_name || localStorage.getItem(CONFIG.STORAGE_KEYS.STORE_NAME) || 'Cửa hàng';
        } catch (e) {
            return localStorage.getItem(CONFIG.STORAGE_KEYS.STORE_NAME) || 'Cửa hàng';
        }
    },

    // No-ops for compatibility
    initTokenClient() {},
    startTokenGuard() {},
    saveToken() {},
    restoreToken() { return false; },
    clearToken() {},
    scheduleTokenRefresh() {},
    silentRefresh() {},
    async ensureValidToken() { return true; },
    async apiCallWithRetry(fn) { return await fn(); },

    // ==========================================
    // Data Operations (mapped to Worker API)
    // ==========================================

    /**
     * Read data from a "range" - maps to the appropriate API endpoint
     * Range format: "SheetName!A2:Z" or "SheetName_MM_YYYY!A2:Z"
     */
    async readData(range) {
        try {
            const { sheetName, month, year } = this._parseRange(range);

            if (sheetName.startsWith('Products')) {
                const res = await this._fetch('/api/products');
                return (res.data || []).map(p => [
                    p.code, p.name, p.cost, p.price, p.profit, p.stock, p.created_at, p.category,
                    p.id // Extra: row ID for editing
                ]);
            }

            if (sheetName.startsWith('Sales')) {
                const params = month && year ? `?month=${month}&year=${year}` : '';
                const res = await this._fetch(`/api/sales${params}`);
                return (res.data || []).map(s => [
                    s.sale_id, s.datetime, s.details, s.total, s.profit, s.note,
                    s.id
                ]);
            }

            if (sheetName.startsWith('Transactions')) {
                const params = month && year ? `?month=${month}&year=${year}` : '';
                const res = await this._fetch(`/api/transactions${params}`);
                return (res.data || []).map(t => [
                    t.tx_id, t.date, t.type, t.description, t.amount, t.note,
                    t.id
                ]);
            }

            if (sheetName.startsWith('Debts')) {
                const res = await this._fetch('/api/debts');
                return (res.data || []).map(d => [
                    d.debt_id, d.sale_id, d.customer_name, d.phone,
                    d.total, d.paid, d.remaining, d.created_at, d.updated_at, d.status,
                    d.id
                ]);
            }

            if (sheetName.startsWith('Settings')) {
                const res = await this._fetch('/api/settings');
                return (res.data || []).map(s => [s.key, s.value]);
            }

            return [];
        } catch (error) {
            console.error('Error reading data:', error);
            return [];
        }
    },

    /**
     * Append data to a "sheet"
     */
    async appendData(sheetName, values) {
        const row = Array.isArray(values[0]) ? values[0] : values;
        const { baseName, month, year } = this._parseSheetName(sheetName);

        if (baseName === 'Products') {
            return await this._fetch('/api/products', 'POST', {
                code: row[0], name: row[1], cost: row[2], price: row[3],
                stock: row[5], created_at: row[6], category: row[7]
            });
        }

        if (baseName === 'Sales') {
            return await this._fetch('/api/sales', 'POST', {
                sale_id: row[0], datetime: row[1], details: row[2],
                total: row[3], profit: row[4], note: row[5]
            });
        }

        if (baseName === 'Transactions') {
            return await this._fetch('/api/transactions', 'POST', {
                tx_id: row[0], date: row[1], type: row[2],
                description: row[3], amount: row[4], note: row[5]
            });
        }

        if (baseName === 'Debts') {
            return await this._fetch('/api/debts', 'POST', {
                debt_id: row[0], sale_id: row[1], customer_name: row[2],
                phone: row[3], total: row[4], paid: row[5], remaining: row[6],
                created_at: row[7], updated_at: row[8], status: row[9]
            });
        }

        if (baseName === 'Settings') {
            return await this._fetch('/api/settings', 'PUT', { key: row[0], value: row[1] });
        }

        return { success: true };
    },

    /**
     * Update data in a "range"
     * Old format: "SheetName!A{row}:Z{row}" with [[values]]
     */
    async updateData(range, values) {
        const row = values[0];
        const { sheetName } = this._parseRange(range);

        // Extract row ID from the range (e.g., "Products!A5:H5" → row 5)
        // In Worker mode, we use the DB `id` which is stored as the last element in readData
        // This is a compatibility layer — the caller passes the rowIndex

        if (sheetName.startsWith('Products')) {
            // Find product by code (row[0]) and update
            const products = await this._fetch('/api/products');
            const product = (products.data || []).find(p => p.code === row[0]);
            if (product) {
                return await this._fetch(`/api/products/${product.id}`, 'PUT', {
                    code: row[0], name: row[1], cost: row[2], price: row[3],
                    stock: row[5], category: row[7]
                });
            }
        }

        if (sheetName.startsWith('Transactions')) {
            const txId = row[0]; // TX ID
            const txs = await this._fetch('/api/transactions');
            const tx = (txs.data || []).find(t => t.tx_id === txId);
            if (tx) {
                return await this._fetch(`/api/transactions/${tx.id}`, 'PUT', {
                    type: row[2], description: row[3], amount: row[4], note: row[5]
                });
            }
        }

        if (sheetName.startsWith('Debts')) {
            // Debt updates from payDebt - update paid/remaining/status
            const debtResult = await this._fetch('/api/debts');
            // Match by finding the debt whose columns match
            // For pay operations, the caller updates columns F-J (paid, remaining, created_at, updated_at, status)
            // We handle this in the pay endpoint instead
        }

        if (sheetName.startsWith('Settings')) {
            return await this._fetch('/api/settings', 'PUT', { key: row[0], value: row[1] });
        }

        return { success: true };
    },

    /**
     * Update data in RAW mode (same as updateData for Worker)
     */
    async updateRaw(range, values) {
        return await this.updateData(range, values);
    },

    /**
     * Append in RAW mode (same as appendData for Worker)
     */
    async appendRaw(sheetName, values) {
        return await this.appendData(sheetName, values);
    },

    /**
     * Delete a row
     */
    async deleteRow(sheetName, rowIndex) {
        const { baseName } = this._parseSheetName(sheetName);

        // In Worker mode, rowIndex corresponds to the item's position
        // We need to find the item by its position and delete by DB id
        // This is a compatibility challenge - the old code uses Sheet row indices

        // For now, we read all data and find by index
        try {
            if (baseName === 'Products') {
                const res = await this._fetch('/api/products');
                const item = (res.data || [])[rowIndex - 1]; // rowIndex is 1-based
                if (item) await this._fetch(`/api/products/${item.id}`, 'DELETE');
            }
            if (baseName === 'Sales') {
                // Sales are per-month, but we can still index
                const res = await this._fetch('/api/sales');
                const item = (res.data || [])[rowIndex - 1];
                if (item) await this._fetch(`/api/sales/${item.id}`, 'DELETE');
            }
            if (baseName === 'Transactions') {
                const res = await this._fetch('/api/transactions');
                const item = (res.data || [])[rowIndex - 1];
                if (item) await this._fetch(`/api/transactions/${item.id}`, 'DELETE');
            }
            if (baseName === 'Debts') {
                const res = await this._fetch('/api/debts');
                const item = (res.data || [])[rowIndex - 1];
                if (item) await this._fetch(`/api/debts/${item.id}`, 'DELETE');
            }
        } catch (e) {
            console.error('Error deleting row:', e);
        }

        return true;
    },

    /**
     * Get sheet IDs (faked for compatibility)
     */
    async getSheetIds() {
        // Return fake sheet IDs so ensureSheetExists thinks sheets exist
        return {
            'Products': 1, 'Sales': 2, 'Transactions': 3, 'Debts': 4, 'Settings': 5
        };
    },

    /**
     * Ensure sheet exists (no-op in Worker mode, tables always exist)
     */
    async ensureSheetExists(sheetName, headers) {
        return true;
    },

    /**
     * Get month sheet name (kept for compatibility with date-based queries)
     */
    getMonthSheetName(baseName, date = new Date()) {
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        return `${baseName}_${month}_${year}`;
    },

    /**
     * Create spreadsheet (no-op, handled by registration)
     */
    async createSpreadsheet(storeName) {
        localStorage.setItem(CONFIG.STORAGE_KEYS.STORE_NAME, storeName);
        return 'worker-connected';
    },

    /**
     * Link existing sheet (no-op in Worker mode)
     */
    async linkExistingSheet() {
        return { success: true, storeName: localStorage.getItem(CONFIG.STORAGE_KEYS.STORE_NAME) };
    },

    // ==========================================
    // Internal helpers
    // ==========================================

    /**
     * Parse range string "SheetName_MM_YYYY!A2:Z" → { sheetName, month, year }
     */
    _parseRange(range) {
        const parts = range.split('!');
        const sheetName = parts[0];
        return { sheetName, ...this._parseSheetName(sheetName) };
    },

    /**
     * Parse sheet name "Sales_03_2026" → { baseName: "Sales", month: "03", year: "2026" }
     */
    _parseSheetName(name) {
        const match = name.match(/^(.+?)_(\d{2})_(\d{4})$/);
        if (match) {
            return { baseName: match[1], month: match[2], year: match[3] };
        }
        return { baseName: name, month: null, year: null };
    },

    /**
     * Fetch helper with auth
     */
    async _fetch(path, method = 'GET', body = null) {
        if (!this.workerUrl) throw new Error('Worker URL chưa được cấu hình');

        const options = {
            method,
            headers: {
                'Content-Type': 'application/json',
            }
        };

        if (this.token) {
            options.headers['Authorization'] = `Bearer ${this.token}`;
        }

        if (body && method !== 'GET') {
            options.body = JSON.stringify(body);
        }

        const response = await fetch(`${this.workerUrl}${path}`, options);

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `API error: ${response.status}`);
        }

        return await response.json();
    }
};
