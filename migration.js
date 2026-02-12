/**
 * QLBH - Data Migration Module
 * Migrates legacy data to monthly sheets
 */

const DataMigration = {
    /**
     * Run migration process
     */
    async migrate() {
        if (!confirm('Hệ thống sẽ chuyển dữ liệu cũ (từ sheet Sales, Transactions) sang các sheet theo tháng (ví dụ Sales_02_2026). Bạn có muốn tiếp tục?')) return;

        App.showLoading(true);
        try {
            await this.migrateSales();
            await this.migrateTransactions();

            App.showToast('✅ Đã chuyển đổi dữ liệu thành công!', 'success');

            // Reload data for selected month
            const monthSelector = document.getElementById('month-selector');
            if (monthSelector) {
                const date = new Date(monthSelector.value + '-01');
                await App.loadAllData(date);
            }
        } catch (error) {
            console.error('Migration error:', error);
            App.showToast('❌ Lỗi chuyển đổi: ' + error.message, 'error');
        } finally {
            App.showLoading(false);
        }
    },

    /**
     * Migrate Sales Data
     */
    async migrateSales() {
        console.log('Migrating sales...');
        // Read old data (assuming standard Sales sheet name without suffix)
        // If the user's config CONFIG.SHEETS.SALES is 'Sales', then we read 'Sales'
        // But wait, getMonthSheetName(CONFIG.SHEETS.SALES) uses the same config.
        // So baseName is correct.

        const baseName = CONFIG.SHEETS.SALES;
        const oldData = await SheetsAPI.readData(`${baseName}!A2:F`);

        if (!oldData || oldData.length === 0) {
            console.log('No legacy sales data found.');
            return;
        }

        // Group by month
        const groups = {};
        let errors = 0;

        for (const row of oldData) {
            try {
                // row: [id, datetime, details, total, profit, note]
                const dateStr = row[1];
                const date = Sales.parseVietnameseDateTime(dateStr);

                if (!date || isNaN(date.getTime()) || date.getFullYear() < 2000) {
                    // Fallback using today if invalid (shouldn't happen often)
                    console.warn('Invalid date in row:', row);
                    continue;
                }

                const sheetName = SheetsAPI.getMonthSheetName(baseName, date);
                if (!groups[sheetName]) groups[sheetName] = [];
                groups[sheetName].push(row);
            } catch (e) {
                errors++;
            }
        }

        // Write to monthly sheets
        for (const [sheetName, rows] of Object.entries(groups)) {
            // Ensure sheet exists
            await SheetsAPI.ensureSheetExists(sheetName, ['Mã đơn', 'Ngày giờ', 'Chi tiết', 'Tổng tiền', 'Lợi nhuận', 'Ghi chú']);

            // Check for existing IDs to avoid duplicates
            const existingData = await SheetsAPI.readData(`${sheetName}!A2:A`);
            const existingIds = new Set(existingData.map(r => r[0]));

            const newRows = rows.filter(r => !existingIds.has(r[0]));

            if (newRows.length > 0) {
                await SheetsAPI.appendData(sheetName, newRows);
                console.log(`Migrated ${newRows.length} rows to ${sheetName}`);
            }
        }
    },

    /**
     * Migrate Transactions Data
     */
    async migrateTransactions() {
        console.log('Migrating transactions...');
        const baseName = CONFIG.SHEETS.TRANSACTIONS;
        const oldData = await SheetsAPI.readData(`${baseName}!A2:F`);

        if (!oldData || oldData.length === 0) {
            console.log('No legacy transactions data found.');
            return;
        }

        const groups = {};

        for (const row of oldData) {
            try {
                // row: [id, date, type, desc, amount, note]
                const dateStr = row[1];
                // Transactions use dd/mm/yyyy
                const parts = dateStr.split('/');
                if (parts.length < 3) continue;

                const day = parseInt(parts[0]);
                const month = parseInt(parts[1]) - 1;
                const year = parseInt(parts[2]);
                const date = new Date(year, month, day);

                if (isNaN(date.getTime())) continue;

                const sheetName = SheetsAPI.getMonthSheetName(baseName, date);
                if (!groups[sheetName]) groups[sheetName] = [];
                groups[sheetName].push(row);
            } catch (e) {
                console.warn('Error parsing transaction row', row);
            }
        }

        for (const [sheetName, rows] of Object.entries(groups)) {
            await SheetsAPI.ensureSheetExists(sheetName, ['ID', 'Ngày', 'Loại', 'Mô tả', 'Số tiền', 'Ghi chú']);

            const existingData = await SheetsAPI.readData(`${sheetName}!A2:A`);
            const existingIds = new Set(existingData.map(r => r[0]));

            const newRows = rows.filter(r => !existingIds.has(r[0]));

            if (newRows.length > 0) {
                await SheetsAPI.appendData(sheetName, newRows);
                console.log(`Migrated ${newRows.length} transactions to ${sheetName}`);
            }
        }
    }
};
