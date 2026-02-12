/**
 * QLBH - Transactions Module
 * Handles income/expense tracking
 */

const Transactions = {
    transactions: [],
    editingTransactionRow: null,
    currentFilter: 'all',

    /**
     * Load all transactions
     */
    async loadTransactions(date = new Date()) {
        try {
            const sheetName = SheetsAPI.getMonthSheetName(CONFIG.SHEETS.TRANSACTIONS, date);

            // Check if sheet exists first
            const sheetIds = await SheetsAPI.getSheetIds();
            if (!sheetIds[sheetName]) {
                console.log(`Sheet ${sheetName} not found, returning empty transactions`);
                this.transactions = [];
                this.updateSummary();
                return [];
            }

            const data = await SheetsAPI.readData(`${sheetName}!A2:F`);
            this.transactions = data.map((row, index) => ({
                rowIndex: index + 2,
                id: row[0] || '',
                date: row[1] || '',
                type: row[2] || '',
                description: row[3] || '',
                amount: parseFloat(row[4]) || 0,
                note: row[5] || '',
                sheetName: sheetName // Store sheet name
            }));
            this.renderTransactions();
            this.updateSummary();
            return this.transactions;
        } catch (error) {
            console.error('Error loading transactions:', error);
            return [];
        }
    },

    // ... (filterTransactions, renderTransactions, updateSummary, showAddModal, editTransaction unchanged) ...

    /**
     * Add transaction programmatically (from Sales)
     */
    async addTransaction(type, description, amount, note = '', dateObj = new Date()) {
        const id = 'TX' + Date.now().toString().slice(-8);
        const date = dateObj.toLocaleDateString('vi-VN');

        const sheetName = SheetsAPI.getMonthSheetName(CONFIG.SHEETS.TRANSACTIONS, dateObj);

        // Ensure sheet exists
        await SheetsAPI.ensureSheetExists(sheetName, ['ID', 'Ngày', 'Loại', 'Mô tả', 'Số tiền', 'Ghi chú']);

        await SheetsAPI.appendData(sheetName, [
            id,
            date,
            type,
            description,
            amount,
            note
        ]);

        return id;
    },

    /**
     * Save transaction (add or update)
     */
    async saveTransaction() {
        const type = document.getElementById('transaction-type').value;
        const description = document.getElementById('transaction-desc').value.trim();
        const amount = parseFloat(document.getElementById('transaction-amount').value) || 0;
        const note = document.getElementById('transaction-note').value.trim();

        if (!description || amount <= 0) {
            App.showToast('Vui lòng nhập đầy đủ thông tin', 'error');
            return;
        }

        App.showLoading(true);

        try {
            if (this.editingTransactionRow) {
                // Update existing transaction
                // Need to find the transaction to get its sheetName
                // However, editingTransactionRow based on index is risky if we don't know the sheet.
                // We should have stored the ID or something more stable, but `editTransaction` sets `this.editingTransactionRow`.
                // Let's find the transaction by row index in the CURRENT loaded transactions.

                const transaction = this.transactions.find(t => t.rowIndex === this.editingTransactionRow);

                if (transaction) {
                    await SheetsAPI.updateData(
                        `${transaction.sheetName}!A${this.editingTransactionRow}:F${this.editingTransactionRow}`,
                        [[transaction.id, transaction.date, type, description, amount, note]]
                    );
                    App.showToast('Đã cập nhật giao dịch');
                } else {
                    App.showToast('Không tìm thấy giao dịch để sửa', 'error');
                }
            } else {
                // Add new transaction
                // Use current date for manual add
                const now = new Date();
                await this.addTransaction(type, description, amount, note, now);
                App.showToast(`Đã thêm ${type === 'income' ? 'khoản thu' : 'khoản chi'}`);
            }

            this.closeModal();
            // Reload based on current selector
            const currentSelectedDate = new Date(document.getElementById('month-selector').value + '-01');
            await this.loadTransactions(currentSelectedDate);

        } catch (error) {
            console.error('Error saving transaction:', error);
            App.showToast('Lỗi lưu giao dịch', 'error');
        } finally {
            App.showLoading(false);
        }
    },

    /**
     * Delete transaction
     */
    async deleteTransaction(id) {
        if (!confirm('Bạn có chắc muốn xóa giao dịch này?')) return;

        const transaction = this.transactions.find(t => t.id === id);
        if (!transaction) return;

        App.showLoading(true);

        try {
            await SheetsAPI.deleteRow(transaction.sheetName, transaction.rowIndex - 1);
            App.showToast('Đã xóa giao dịch');

            const currentSelectedDate = new Date(document.getElementById('month-selector').value + '-01');
            await this.loadTransactions(currentSelectedDate);
        } catch (error) {
            console.error('Error deleting transaction:', error);
            App.showToast('Lỗi xóa giao dịch', 'error');
        } finally {
            App.showLoading(false);
        }
    },

    /**
     * Close modal
     */
    closeModal() {
        document.getElementById('modal-transaction').classList.remove('active');
        this.editingTransactionRow = null;
    },

    /**
     * Get transactions by period
     */
    getByPeriod(period) {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        return this.transactions.filter(t => {
            // Parse Vietnamese date format (dd/mm/yyyy)
            const parts = t.date.split('/');
            if (parts.length !== 3) return false;
            const tDate = new Date(parts[2], parts[1] - 1, parts[0]);

            switch (period) {
                case 'today':
                    return tDate.getTime() === today.getTime();
                case 'week':
                    const weekAgo = new Date(today);
                    weekAgo.setDate(weekAgo.getDate() - 7);
                    return tDate >= weekAgo;
                case 'month':
                    return tDate.getMonth() === now.getMonth() &&
                        tDate.getFullYear() === now.getFullYear();
                case 'all':
                default:
                    return true;
            }
        });
    },

    /**
     * Initialize event listeners
     */
    init() {
        // Add income button
        document.getElementById('btn-add-income').addEventListener('click', () => {
            this.showAddModal('income');
        });

        // Add expense button
        document.getElementById('btn-add-expense').addEventListener('click', () => {
            this.showAddModal('expense');
        });

        // Form submit
        document.getElementById('form-transaction').addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveTransaction();
        });

        // Filter buttons
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.filterTransactions(btn.dataset.filter);
            });
        });
    }
};
