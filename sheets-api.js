/**
 * QLBH - Google Sheets API Module
 * Handles all interactions with Google Sheets
 */

const SheetsAPI = {
    tokenClient: null,
    accessToken: null,
    spreadsheetId: null,
    isInitialized: false,
    tokenExpiresAt: null,

    /**
     * Initialize Google API
     */
    async init() {
        return new Promise((resolve, reject) => {
            gapi.load('client', async () => {
                try {
                    await gapi.client.init({
                        apiKey: CONFIG.API_KEY,
                        discoveryDocs: CONFIG.DISCOVERY_DOCS
                    });

                    // Check for saved spreadsheet ID
                    this.spreadsheetId = localStorage.getItem(CONFIG.STORAGE_KEYS.SPREADSHEET_ID);

                    // Restore saved token if available
                    this.restoreToken();

                    this.isInitialized = true;
                    resolve();
                } catch (error) {
                    console.error('Error initializing GAPI:', error);
                    reject(error);
                }
            });
        });
    },

    /**
     * Save token to localStorage for persistence
     */
    saveToken(accessToken, expiresIn) {
        this.accessToken = accessToken;
        // Calculate expiry time (expiresIn is in seconds)
        const expiresAt = Date.now() + (expiresIn * 1000);
        this.tokenExpiresAt = expiresAt;

        localStorage.setItem('qlbh_access_token', accessToken);
        localStorage.setItem('qlbh_token_expires', expiresAt.toString());
    },

    /**
     * Restore token from localStorage
     */
    restoreToken() {
        const savedToken = localStorage.getItem('qlbh_access_token');
        const expiresAt = localStorage.getItem('qlbh_token_expires');

        if (savedToken && expiresAt) {
            const expiryTime = parseInt(expiresAt);
            // Check if token is still valid (with 5 minute buffer)
            if (Date.now() < expiryTime - 300000) {
                this.accessToken = savedToken;
                this.tokenExpiresAt = expiryTime;
                // Set token for gapi client
                gapi.client.setToken({ access_token: savedToken });
                return true;
            } else {
                // Token expired, clear it
                this.clearToken();
            }
        }
        return false;
    },

    /**
     * Clear saved token
     */
    clearToken() {
        localStorage.removeItem('qlbh_access_token');
        localStorage.removeItem('qlbh_token_expires');
        this.accessToken = null;
        this.tokenExpiresAt = null;
    },

    /**
     * Check if user has valid token
     */
    hasValidToken() {
        if (!this.accessToken || !this.tokenExpiresAt) return false;
        // Check with 5 minute buffer
        return Date.now() < this.tokenExpiresAt - 300000;
    },

    /**
     * Initialize Token Client for OAuth
     */
    initTokenClient(callback) {
        this.tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: CONFIG.CLIENT_ID,
            scope: CONFIG.SCOPES,
            callback: (response) => {
                if (response.error) {
                    console.error('Token error:', response);
                    return;
                }
                // Save token with expiry (default 1 hour = 3600 seconds)
                const expiresIn = response.expires_in || 3600;
                this.saveToken(response.access_token, expiresIn);
                callback(response);
            }
        });
    },

    /**
     * Request access token (sign in)
     */
    signIn() {
        if (this.tokenClient) {
            if (this.accessToken) {
                // Token exists but may be expired, request new one
                this.tokenClient.requestAccessToken({ prompt: '' });
            } else {
                // First time, use select_account
                this.tokenClient.requestAccessToken({ prompt: 'select_account' });
            }
        }
    },

    /**
     * Sign out
     */
    signOut() {
        if (this.accessToken) {
            google.accounts.oauth2.revoke(this.accessToken);
            this.clearToken();
        }
    },

    /**
     * Get user profile info
     */
    async getUserInfo() {
        try {
            const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`
                }
            });
            return await response.json();
        } catch (error) {
            console.error('Error getting user info:', error);
            return null;
        }
    },

    /**
     * Create new spreadsheet with predefined structure
     */
    async createSpreadsheet(storeName) {
        try {
            // Create spreadsheet
            const response = await gapi.client.sheets.spreadsheets.create({
                properties: {
                    title: `QLBH - ${storeName}`
                },
                sheets: [
                    {
                        properties: {
                            title: CONFIG.SHEETS.PRODUCTS,
                            gridProperties: { frozenRowCount: 1 }
                        }
                    },
                    {
                        properties: {
                            title: CONFIG.SHEETS.SALES,
                            gridProperties: { frozenRowCount: 1 }
                        }
                    },
                    {
                        properties: {
                            title: CONFIG.SHEETS.TRANSACTIONS,
                            gridProperties: { frozenRowCount: 1 }
                        }
                    },
                    {
                        properties: {
                            title: CONFIG.SHEETS.SETTINGS,
                            gridProperties: { frozenRowCount: 1 }
                        }
                    }
                ]
            });

            this.spreadsheetId = response.result.spreadsheetId;
            localStorage.setItem(CONFIG.STORAGE_KEYS.SPREADSHEET_ID, this.spreadsheetId);
            localStorage.setItem(CONFIG.STORAGE_KEYS.STORE_NAME, storeName);

            // Initialize headers for each sheet
            await this.initializeHeaders(storeName);

            return this.spreadsheetId;
        } catch (error) {
            console.error('Error creating spreadsheet:', error);
            throw error;
        }
    },

    /**
     * Initialize headers for all sheets
     */
    async initializeHeaders(storeName) {
        const requests = [
            // Products headers
            {
                range: `${CONFIG.SHEETS.PRODUCTS}!A1:G1`,
                values: [['Mã SP', 'Tên SP', 'Giá nhập', 'Giá bán', 'Lãi', 'Tồn kho', 'Ngày tạo']]
            },
            // Sales headers
            {
                range: `${CONFIG.SHEETS.SALES}!A1:F1`,
                values: [['Mã đơn', 'Ngày giờ', 'Chi tiết', 'Tổng tiền', 'Lợi nhuận', 'Ghi chú']]
            },
            // Transactions headers
            {
                range: `${CONFIG.SHEETS.TRANSACTIONS}!A1:F1`,
                values: [['ID', 'Ngày', 'Loại', 'Mô tả', 'Số tiền', 'Ghi chú']]
            },
            // Settings data
            {
                range: `${CONFIG.SHEETS.SETTINGS}!A1:B4`,
                values: [
                    ['Key', 'Value'],
                    ['store_name', storeName],
                    ['currency', 'VND'],
                    ['created_at', new Date().toISOString()]
                ]
            }
        ];

        for (const req of requests) {
            await gapi.client.sheets.spreadsheets.values.update({
                spreadsheetId: this.spreadsheetId,
                range: req.range,
                valueInputOption: 'USER_ENTERED',
                resource: { values: req.values }
            });
        }

        // Format headers (bold, background color)
        await this.formatHeaders();
    },

    /**
     * Format headers with styling
     */
    async formatHeaders() {
        const sheetIds = await this.getSheetIds();

        const requests = Object.values(sheetIds).map(sheetId => ({
            repeatCell: {
                range: {
                    sheetId: sheetId,
                    startRowIndex: 0,
                    endRowIndex: 1
                },
                cell: {
                    userEnteredFormat: {
                        backgroundColor: { red: 0.2, green: 0.2, blue: 0.3 },
                        textFormat: {
                            bold: true,
                            foregroundColor: { red: 1, green: 1, blue: 1 }
                        }
                    }
                },
                fields: 'userEnteredFormat(backgroundColor,textFormat)'
            }
        }));

        await gapi.client.sheets.spreadsheets.batchUpdate({
            spreadsheetId: this.spreadsheetId,
            resource: { requests }
        });
    },

    /**
     * Get sheet IDs
     */
    async getSheetIds() {
        const response = await gapi.client.sheets.spreadsheets.get({
            spreadsheetId: this.spreadsheetId
        });

        const sheets = {};
        response.result.sheets.forEach(sheet => {
            sheets[sheet.properties.title] = sheet.properties.sheetId;
        });
        return sheets;
    },

    /**
     * Read data from a range
     */
    async readData(range) {
        try {
            const response = await gapi.client.sheets.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range: range
            });
            return response.result.values || [];
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
            const response = await gapi.client.sheets.spreadsheets.values.append({
                spreadsheetId: this.spreadsheetId,
                range: `${sheetName}!A:Z`,
                valueInputOption: 'USER_ENTERED',
                insertDataOption: 'INSERT_ROWS',
                resource: { values: Array.isArray(values[0]) ? values : [values] }
            });
            return response.result;
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
            const response = await gapi.client.sheets.spreadsheets.values.update({
                spreadsheetId: this.spreadsheetId,
                range: range,
                valueInputOption: 'USER_ENTERED',
                resource: { values: values }
            });
            return response.result;
        } catch (error) {
            console.error('Error updating data:', error);
            throw error;
        }
    },

    /**
     * Delete a row
     */
    async deleteRow(sheetName, rowIndex) {
        try {
            const sheetIds = await this.getSheetIds();
            const sheetId = sheetIds[sheetName];

            await gapi.client.sheets.spreadsheets.batchUpdate({
                spreadsheetId: this.spreadsheetId,
                resource: {
                    requests: [{
                        deleteDimension: {
                            range: {
                                sheetId: sheetId,
                                dimension: 'ROWS',
                                startIndex: rowIndex,
                                endIndex: rowIndex + 1
                            }
                        }
                    }]
                }
            });
            return true;
        } catch (error) {
            console.error('Error deleting row:', error);
            throw error;
        }
    },

    /**
     * Check if spreadsheet exists and is accessible
     */
    async checkSpreadsheet() {
        if (!this.spreadsheetId) return false;

        try {
            await gapi.client.sheets.spreadsheets.get({
                spreadsheetId: this.spreadsheetId
            });
            return true;
        } catch (error) {
            // Spreadsheet not found or not accessible
            localStorage.removeItem(CONFIG.STORAGE_KEYS.SPREADSHEET_ID);
            this.spreadsheetId = null;
            return false;
        }
    },

    /**
     * Get store name from settings
     */
    async getStoreName() {
        try {
            const data = await this.readData(`${CONFIG.SHEETS.SETTINGS}!A:B`);
            const row = data.find(r => r[0] === 'store_name');
            return row ? row[1] : 'Cửa hàng';
        } catch (error) {
            return localStorage.getItem(CONFIG.STORAGE_KEYS.STORE_NAME) || 'Cửa hàng';
        }
    },

    /**
     * Link an existing spreadsheet by ID
     * Validates the spreadsheet structure before linking
     */
    async linkExistingSheet(sheetId) {
        try {
            // Try to access the spreadsheet
            const response = await gapi.client.sheets.spreadsheets.get({
                spreadsheetId: sheetId
            });

            // Check if it has the required sheets
            const sheets = response.result.sheets.map(s => s.properties.title);
            // Relaxed check: Only Products and Settings are strictly required initially
            // Sales and Transactions can be created dynamically
            const requiredSheets = [CONFIG.SHEETS.PRODUCTS, CONFIG.SHEETS.SETTINGS];
            const missingSheets = requiredSheets.filter(s => !sheets.includes(s));

            if (missingSheets.length > 0) {
                throw new Error(`Sheet không hợp lệ. Thiếu các sheet: ${missingSheets.join(', ')}`);
            }

            // Save the sheet ID
            this.spreadsheetId = sheetId;
            localStorage.setItem(CONFIG.STORAGE_KEYS.SPREADSHEET_ID, sheetId);

            // Try to get store name from settings
            const storeName = await this.getStoreName();
            localStorage.setItem(CONFIG.STORAGE_KEYS.STORE_NAME, storeName);

            return { success: true, storeName };
        } catch (error) {
            console.error('Error linking spreadsheet:', error);
            if (error.status === 404) {
                throw new Error('Không tìm thấy Sheet với ID này. Vui lòng kiểm tra lại.');
            } else if (error.status === 403) {
                throw new Error('Bạn không có quyền truy cập Sheet này.');
            }
            throw error;
        }
    },

    /**
     * Get sheet name with month suffix (e.g. Sales_02_2026)
     */
    getMonthSheetName(baseName, date = new Date()) {
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        return `${baseName}_${month}_${year}`;
    },

    /**
     * Check if a sheet exists, if not create it with headers
     */
    async ensureSheetExists(sheetName, headers) {
        const sheetIds = await this.getSheetIds();
        if (sheetIds[sheetName]) return true;

        try {
            // Create new sheet
            await gapi.client.sheets.spreadsheets.batchUpdate({
                spreadsheetId: this.spreadsheetId,
                resource: {
                    requests: [{
                        addSheet: {
                            properties: {
                                title: sheetName,
                                gridProperties: { frozenRowCount: 1 }
                            }
                        }
                    }]
                }
            });

            // Add headers
            await gapi.client.sheets.spreadsheets.values.update({
                spreadsheetId: this.spreadsheetId,
                range: `${sheetName}!A1`,
                valueInputOption: 'USER_ENTERED',
                resource: { values: [headers] }
            });

            // Format headers
            const newSheetIds = await this.getSheetIds();
            const newSheetId = newSheetIds[sheetName];

            await gapi.client.sheets.spreadsheets.batchUpdate({
                spreadsheetId: this.spreadsheetId,
                resource: {
                    requests: [{
                        repeatCell: {
                            range: {
                                sheetId: newSheetId,
                                startRowIndex: 0,
                                endRowIndex: 1
                            },
                            cell: {
                                userEnteredFormat: {
                                    backgroundColor: { red: 0.2, green: 0.2, blue: 0.3 },
                                    textFormat: {
                                        bold: true,
                                        foregroundColor: { red: 1, green: 1, blue: 1 }
                                    }
                                }
                            },
                            fields: 'userEnteredFormat(backgroundColor,textFormat)'
                        }
                    }]
                }
            });

            return true;
        } catch (error) {
            console.error(`Error creating sheet ${sheetName}:`, error);
            throw error;
        }
    }
};
