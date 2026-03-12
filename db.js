/**
 * QLBH - IndexedDB Local Database
 * Provides fast local storage with structured data for offline support
 */

const DB = {
    name: 'qlbh_db',
    version: 1,
    db: null,

    // Store definitions
    STORES: {
        PRODUCTS: 'products',
        SALES: 'sales',
        TRANSACTIONS: 'transactions',
        DEBTS: 'debts',
        SETTINGS: 'settings',
        SYNC_QUEUE: 'syncQueue',
        META: 'meta'
    },

    /**
     * Initialize / open the IndexedDB database
     */
    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.name, this.version);

            request.onerror = () => {
                console.error('[DB] Failed to open database:', request.error);
                reject(request.error);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                console.log('[DB] Upgrading database schema...');

                // Products store
                if (!db.objectStoreNames.contains(this.STORES.PRODUCTS)) {
                    const store = db.createObjectStore(this.STORES.PRODUCTS, { keyPath: 'id' });
                    store.createIndex('name', 'name', { unique: false });
                    store.createIndex('category', 'category', { unique: false });
                }

                // Sales store
                if (!db.objectStoreNames.contains(this.STORES.SALES)) {
                    const store = db.createObjectStore(this.STORES.SALES, { keyPath: 'id' });
                    store.createIndex('date', 'date', { unique: false });
                    store.createIndex('monthKey', 'monthKey', { unique: false });
                }

                // Transactions store
                if (!db.objectStoreNames.contains(this.STORES.TRANSACTIONS)) {
                    const store = db.createObjectStore(this.STORES.TRANSACTIONS, { keyPath: 'id' });
                    store.createIndex('date', 'date', { unique: false });
                    store.createIndex('type', 'type', { unique: false });
                    store.createIndex('monthKey', 'monthKey', { unique: false });
                }

                // Debts store
                if (!db.objectStoreNames.contains(this.STORES.DEBTS)) {
                    const store = db.createObjectStore(this.STORES.DEBTS, { keyPath: 'id' });
                    store.createIndex('status', 'status', { unique: false });
                    store.createIndex('customerName', 'customerName', { unique: false });
                }

                // Settings store (key-value pairs)
                if (!db.objectStoreNames.contains(this.STORES.SETTINGS)) {
                    db.createObjectStore(this.STORES.SETTINGS, { keyPath: 'key' });
                }

                // Sync queue store (pending changes to push to Sheets)
                if (!db.objectStoreNames.contains(this.STORES.SYNC_QUEUE)) {
                    const store = db.createObjectStore(this.STORES.SYNC_QUEUE, { keyPath: 'id', autoIncrement: true });
                    store.createIndex('storeName', 'storeName', { unique: false });
                    store.createIndex('timestamp', 'timestamp', { unique: false });
                }

                // Meta store (last sync times, etc.)
                if (!db.objectStoreNames.contains(this.STORES.META)) {
                    db.createObjectStore(this.STORES.META, { keyPath: 'key' });
                }
            };

            request.onsuccess = () => {
                this.db = request.result;
                console.log('[DB] Database opened successfully');

                // Handle version change (another tab upgraded)
                this.db.onversionchange = () => {
                    this.db.close();
                    console.log('[DB] Database version changed, page reload needed');
                };

                resolve(this.db);
            };
        });
    },

    /**
     * Check if DB is ready
     */
    isReady() {
        return this.db !== null;
    },

    // ========================
    // Generic CRUD Operations
    // ========================

    /**
     * Get all records from a store
     */
    async getAll(storeName) {
        return new Promise((resolve, reject) => {
            if (!this.db) { resolve([]); return; }
            const tx = this.db.transaction(storeName, 'readonly');
            const store = tx.objectStore(storeName);
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    },

    /**
     * Get records by index value
     */
    async getByIndex(storeName, indexName, value) {
        return new Promise((resolve, reject) => {
            if (!this.db) { resolve([]); return; }
            const tx = this.db.transaction(storeName, 'readonly');
            const store = tx.objectStore(storeName);
            const index = store.index(indexName);
            const request = index.getAll(value);
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    },

    /**
     * Get a single record by key
     */
    async get(storeName, key) {
        return new Promise((resolve, reject) => {
            if (!this.db) { resolve(null); return; }
            const tx = this.db.transaction(storeName, 'readonly');
            const store = tx.objectStore(storeName);
            const request = store.get(key);
            request.onsuccess = () => resolve(request.result || null);
            request.onerror = () => reject(request.error);
        });
    },

    /**
     * Put (insert/update) a record
     */
    async put(storeName, data) {
        return new Promise((resolve, reject) => {
            if (!this.db) { resolve(); return; }
            const tx = this.db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            const request = store.put(data);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    /**
     * Put multiple records in a batch
     */
    async putAll(storeName, items) {
        return new Promise((resolve, reject) => {
            if (!this.db || !items.length) { resolve(); return; }
            const tx = this.db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            items.forEach(item => store.put(item));
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    },

    /**
     * Delete a record by key
     */
    async delete(storeName, key) {
        return new Promise((resolve, reject) => {
            if (!this.db) { resolve(); return; }
            const tx = this.db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            const request = store.delete(key);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    },

    /**
     * Clear all records from a store
     */
    async clear(storeName) {
        return new Promise((resolve, reject) => {
            if (!this.db) { resolve(); return; }
            const tx = this.db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            const request = store.clear();
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    },

    /**
     * Count records in a store
     */
    async count(storeName) {
        return new Promise((resolve, reject) => {
            if (!this.db) { resolve(0); return; }
            const tx = this.db.transaction(storeName, 'readonly');
            const store = tx.objectStore(storeName);
            const request = store.count();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    // ========================
    // Sync Queue Operations
    // ========================

    /**
     * Add a change to the sync queue
     * @param {string} storeName - Which store was changed
     * @param {string} action - 'add', 'update', or 'delete'
     * @param {object} data - The data that changed
     * @param {object} sheetInfo - { sheetName, rowIndex, range }
     */
    async addToSyncQueue(storeName, action, data, sheetInfo = {}) {
        const entry = {
            storeName,
            action,
            data,
            sheetInfo,
            timestamp: Date.now(),
            retries: 0
        };
        return this.put(this.STORES.SYNC_QUEUE, entry);
    },

    /**
     * Get all pending sync entries
     */
    async getPendingSyncs() {
        return this.getAll(this.STORES.SYNC_QUEUE);
    },

    /**
     * Remove a sync entry after successful push
     */
    async removeSyncEntry(id) {
        return this.delete(this.STORES.SYNC_QUEUE, id);
    },

    /**
     * Clear all sync entries
     */
    async clearSyncQueue() {
        return this.clear(this.STORES.SYNC_QUEUE);
    },

    // ========================
    // Meta Operations
    // ========================

    /**
     * Save last sync time for a store
     */
    async setLastSync(storeName) {
        return this.put(this.STORES.META, {
            key: `lastSync_${storeName}`,
            value: Date.now()
        });
    },

    /**
     * Get last sync time for a store
     */
    async getLastSync(storeName) {
        const meta = await this.get(this.STORES.META, `lastSync_${storeName}`);
        return meta ? meta.value : 0;
    },

    // ========================
    // Data Conversion Helpers
    // ========================

    /**
     * Convert Sheets row data to product object
     */
    sheetsRowToProduct(row, rowIndex) {
        return {
            id: row[0] || '',
            name: row[1] || '',
            cost: parseFloat(row[2]) || 0,
            price: parseFloat(row[3]) || 0,
            profit: parseFloat(row[4]) || 0,
            stock: parseInt(row[5]) || 0,
            createdAt: row[6] || '',
            category: row[7] || 'Chung',
            rowIndex: rowIndex
        };
    },

    /**
     * Convert product object to Sheets row array
     */
    productToSheetsRow(product) {
        return [
            product.id,
            product.name,
            product.cost,
            product.price,
            product.profit,
            product.stock,
            product.createdAt,
            product.category
        ];
    },

    /**
     * Convert Sheets row data to sale object
     */
    sheetsRowToSale(row, rowIndex, monthKey) {
        return {
            id: row[0] || '',
            datetime: row[1] || '',
            details: row[2] || '',
            total: parseFloat(row[3]) || 0,
            profit: parseFloat(row[4]) || 0,
            note: row[5] || '',
            date: row[1] ? row[1].split(',')[0]?.trim() : '',
            monthKey: monthKey,
            rowIndex: rowIndex
        };
    },

    /**
     * Convert Sheets row to transaction object
     */
    sheetsRowToTransaction(row, rowIndex, monthKey) {
        return {
            id: row[0] || '',
            date: row[1] || '',
            type: row[2] || '',
            description: row[3] || '',
            amount: parseFloat(row[4]) || 0,
            note: row[5] || '',
            monthKey: monthKey,
            rowIndex: rowIndex
        };
    },

    /**
     * Convert Sheets row to debt object
     */
    sheetsRowToDebt(row, rowIndex) {
        return {
            id: row[0] || '',
            orderId: row[1] || '',
            customerName: row[2] || '',
            phone: row[3] || '',
            total: parseFloat(row[4]) || 0,
            paid: parseFloat(row[5]) || 0,
            remaining: parseFloat(row[6]) || 0,
            createdAt: row[7] || '',
            updatedAt: row[8] || '',
            status: row[9] || 'pending',
            rowIndex: rowIndex
        };
    },

    /**
     * Populate stores from Sheets data (initial load or full sync)
     */
    async populateFromSheets(storeName, sheetsData, converter, extraArg) {
        const items = [];
        // Skip header row (index 0)
        for (let i = 1; i < sheetsData.length; i++) {
            const row = sheetsData[i];
            if (row && row.length > 0) {
                const item = converter(row, i + 1, extraArg); // rowIndex is 1-based (i+1 for sheet row)
                if (item.id) {
                    items.push(item);
                }
            }
        }
        await this.clear(storeName);
        if (items.length > 0) {
            await this.putAll(storeName, items);
        }
        await this.setLastSync(storeName);
        console.log(`[DB] Populated ${storeName}: ${items.length} records`);
        return items;
    }
};
