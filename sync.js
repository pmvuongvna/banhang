/**
 * QLBH - Sync Engine
 * Background synchronization between IndexedDB and Google Sheets
 */

const SyncEngine = {
    syncInterval: null,
    isSyncing: false,
    syncIntervalMs: 30000, // Sync every 30 seconds
    isOnline: navigator.onLine,

    /**
     * Initialize sync engine
     */
    init() {
        // Listen for online/offline events
        window.addEventListener('online', () => {
            console.log('[Sync] Back online, triggering sync...');
            this.isOnline = true;
            this.pushChanges();
        });

        window.addEventListener('offline', () => {
            console.log('[Sync] Gone offline');
            this.isOnline = false;
        });

        // Start periodic sync
        this.startPeriodicSync();

        console.log('[Sync] Engine initialized');
    },

    /**
     * Start periodic background sync
     */
    startPeriodicSync() {
        if (this.syncInterval) clearInterval(this.syncInterval);
        this.syncInterval = setInterval(() => {
            if (this.isOnline && !this.isSyncing) {
                this.pushChanges();
            }
        }, this.syncIntervalMs);
    },

    /**
     * Stop periodic sync
     */
    stopPeriodicSync() {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
        }
    },

    /**
     * Pull all data from Sheets into IndexedDB (full refresh)
     * Called on first load or manual sync
     */
    async pullAll(date = new Date()) {
        if (!SheetsAPI.spreadsheetId) return;
        
        console.log('[Sync] Pulling all data from Sheets...');
        const monthKey = date.toISOString().slice(0, 7); // "2026-03"

        try {
            // Determine sheet names for current month
            const salesSheetName = SheetsAPI.getMonthSheetName(CONFIG.SHEETS.SALES, date);
            const txSheetName = SheetsAPI.getMonthSheetName(CONFIG.SHEETS.TRANSACTIONS, date);

            // Batch read all sheets at once (reduces API calls from 4+ to 1)
            const ranges = [
                `${CONFIG.SHEETS.PRODUCTS}!A:H`,
                `${salesSheetName}!A:F`,
                `${txSheetName}!A:F`,
                `${CONFIG.SHEETS.DEBTS}!A:J`
            ];

            let allData;
            try {
                const response = await SheetsAPI.apiCallWithRetry(() =>
                    gapi.client.sheets.spreadsheets.values.batchGet({
                        spreadsheetId: SheetsAPI.spreadsheetId,
                        ranges: ranges
                    })
                );
                allData = response.result.valueRanges || [];
            } catch (error) {
                // If batchGet fails (e.g., monthly sheet doesn't exist), fall back to individual reads
                console.log('[Sync] batchGet failed, falling back to individual reads');
                allData = [];
                for (const range of ranges) {
                    try {
                        const data = await SheetsAPI.readData(range);
                        allData.push({ values: [[], ...data.map(r => r)] });
                    } catch {
                        allData.push({ values: [] });
                    }
                }
            }

            // Populate IndexedDB from the fetched data
            const productsData = allData[0]?.values || [];
            const salesData = allData[1]?.values || [];
            const txData = allData[2]?.values || [];
            const debtsData = allData[3]?.values || [];

            // Convert and store (includes header skip)
            if (productsData.length > 0) {
                await DB.populateFromSheets(
                    DB.STORES.PRODUCTS, productsData,
                    DB.sheetsRowToProduct
                );
            }

            if (salesData.length > 0) {
                await DB.populateFromSheets(
                    DB.STORES.SALES, salesData,
                    DB.sheetsRowToSale, monthKey
                );
            }

            if (txData.length > 0) {
                await DB.populateFromSheets(
                    DB.STORES.TRANSACTIONS, txData,
                    DB.sheetsRowToTransaction, monthKey
                );
            }

            if (debtsData.length > 0) {
                await DB.populateFromSheets(
                    DB.STORES.DEBTS, debtsData,
                    DB.sheetsRowToDebt
                );
            }

            console.log('[Sync] Pull complete');
            return true;
        } catch (error) {
            console.error('[Sync] Pull failed:', error);
            return false;
        }
    },

    /**
     * Push pending changes from sync queue to Sheets
     */
    async pushChanges() {
        if (this.isSyncing || !this.isOnline) return;
        
        const pending = await DB.getPendingSyncs();
        if (pending.length === 0) return;

        this.isSyncing = true;
        console.log(`[Sync] Pushing ${pending.length} pending changes...`);

        let successCount = 0;
        let failCount = 0;

        for (const entry of pending) {
            try {
                await this.processSyncEntry(entry);
                await DB.removeSyncEntry(entry.id);
                successCount++;
            } catch (error) {
                console.error(`[Sync] Failed to sync entry ${entry.id}:`, error);
                failCount++;

                // Increment retry count, discard after 5 retries
                entry.retries = (entry.retries || 0) + 1;
                if (entry.retries >= 5) {
                    console.warn(`[Sync] Discarding entry ${entry.id} after 5 retries`);
                    await DB.removeSyncEntry(entry.id);
                } else {
                    await DB.put(DB.STORES.SYNC_QUEUE, entry);
                }
            }
        }

        this.isSyncing = false;
        if (successCount > 0) {
            console.log(`[Sync] Push complete: ${successCount} synced, ${failCount} failed`);
        }
    },

    /**
     * Process a single sync queue entry
     */
    async processSyncEntry(entry) {
        const { storeName, action, data, sheetInfo } = entry;

        switch (action) {
            case 'add':
                if (sheetInfo.sheetName) {
                    const rowData = this.dataToSheetsRow(storeName, data);
                    await SheetsAPI.appendData(sheetInfo.sheetName, rowData);
                }
                break;

            case 'update':
                if (sheetInfo.range) {
                    const rowData = this.dataToSheetsRow(storeName, data);
                    await SheetsAPI.updateData(sheetInfo.range, [rowData]);
                }
                break;

            case 'delete':
                if (sheetInfo.sheetName && sheetInfo.rowIndex) {
                    await SheetsAPI.deleteRow(sheetInfo.sheetName, sheetInfo.rowIndex - 1);
                }
                break;

            default:
                console.warn(`[Sync] Unknown action: ${action}`);
        }
    },

    /**
     * Convert data object back to Sheets row array
     */
    dataToSheetsRow(storeName, data) {
        switch (storeName) {
            case DB.STORES.PRODUCTS:
                return DB.productToSheetsRow(data);
            case DB.STORES.SALES:
                return [data.id, data.datetime, data.details, data.total, data.profit, data.note];
            case DB.STORES.TRANSACTIONS:
                return [data.id, data.date, data.type, data.description, data.amount, data.note];
            case DB.STORES.DEBTS:
                return [data.id, data.orderId, data.customerName, data.phone,
                        data.total, data.paid, data.remaining, data.createdAt,
                        data.updatedAt, data.status];
            default:
                return Object.values(data);
        }
    },

    /**
     * Get sync queue status
     */
    async getStatus() {
        const pending = await DB.count(DB.STORES.SYNC_QUEUE);
        return {
            pending,
            isOnline: this.isOnline,
            isSyncing: this.isSyncing
        };
    }
};
