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
                type: (row[2] && (row[2].toLowerCase() === 'thu' || row[2] === 'Thu')) ? 'income' :
                    (row[2] && (row[2].toLowerCase() === 'chi' || row[2] === 'Chi')) ? 'expense' :
                        row[2] || '',
                description: row[3] || '',
                // Handle Vietnamese currency format (e.g., "280.000" or "280,000")
                // remove dots (thousands sep) and replace comma with dot (decimal) if any
                // BUT typically in VN: 1.000.000 = 1 million. 
                amount: typeof row[4] === 'string' ?
                    parseFloat(row[4].replace(/\./g, '').replace(/,/g, '.')) || 0 :
                    parseFloat(row[4]) || 0,
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

    /**
     * Filter transactions
     */
    filterTransactions(type) {
        this.currentFilter = type;

        // Update active filter button
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.filter === type);
        });

        this.renderTransactions();
    },

    /**
     * Render transactions list
     */
    renderTransactions() {
        const container = document.getElementById('transactions-tbody');
        if (!container) return;

        let filtered = this.transactions;
        if (this.currentFilter !== 'all') {
            filtered = this.transactions.filter(t => t.type === this.currentFilter);
        }

        if (filtered.length === 0) {
            container.innerHTML = '<tr><td colspan="6" class="empty-state">Không có giao dịch</td></tr>';
            return;
        }

        // Sort by date desc (if date is string dd/mm/yyyy, need parsing)
        filtered.sort((a, b) => {
            const dateA = this.parseDate(a.date);
            const dateB = this.parseDate(b.date);
            return dateB - dateA;
        });

        container.innerHTML = filtered.map(t => {
            const isIncome = t.type === 'income';
            return `
                <tr class="transaction-row ${t.type}">
                    <td>${t.date}</td>
                    <td>
                        <span class="badge ${isIncome ? 'badge-success' : 'badge-danger'}">
                            ${isIncome ? 'Thu' : 'Chi'}
                        </span>
                    </td>
                    <td>${Products.escapeHtml(t.description)}</td>
                    <td class="amount ${isIncome ? 'text-success' : 'text-danger'}">
                        ${isIncome ? '+' : '-'}${Products.formatCurrency(t.amount)}
                    </td>
                    <td>${Products.escapeHtml(t.note)}</td>
                    <td>
                        <div class="action-btns">
                            <button class="action-btn edit" onclick="Transactions.editTransaction(${t.rowIndex})" title="Sửa">✏️</button>
                            <button class="action-btn delete" onclick="Transactions.deleteTransaction('${t.id}')" title="Xóa">🗑️</button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    },

    /**
     * Update summary stats (income/expense/balance)
     */
    updateSummary() {
        const income = this.transactions
            .filter(t => t.type === 'income')
            .reduce((sum, t) => sum + t.amount, 0);

        const expense = this.transactions
            .filter(t => t.type === 'expense')
            .reduce((sum, t) => sum + t.amount, 0);

        const balance = income - expense;

        document.getElementById('stat-income').textContent = Products.formatCurrency(income);
        document.getElementById('stat-expense').textContent = Products.formatCurrency(expense);
        document.getElementById('stat-balance').textContent = Products.formatCurrency(balance);

        // Also update dashboard chart if needed, but App.js handles that via DashboardChart.updateChart
    },

    /**
     * Helper: Parse date string dd/mm/yyyy
     */
    parseDate(str) {
        if (!str) return new Date(0);
        const parts = str.split('/');
        if (parts.length === 3) {
            return new Date(parts[2], parts[1] - 1, parts[0]);
        }
        return new Date(0);
    },

    /**
     * Show add transaction modal
     */
    showAddModal(type) {
        document.getElementById('transaction-type').value = type;
        document.getElementById('transaction-desc').value = '';
        document.getElementById('transaction-amount').value = '';
        document.getElementById('transaction-note').value = '';

        // Update modal title logic if needed, or just generic "Thêm giao dịch"
        // UI might want "Thêm khoản thu" or "Thêm khoản chi" title update
        const title = type === 'income' ? 'Thêm khoản thu' : 'Thêm khoản chi';
        document.querySelector('#modal-transaction .modal-header h3').textContent = title;

        this.editingTransactionRow = null;
        document.getElementById('modal-transaction').classList.add('active');
    },

    /**
     * Edit transaction
     */
    editTransaction(rowIndex) {
        const transaction = this.transactions.find(t => t.rowIndex === rowIndex);
        if (!transaction) return;

        this.editingTransactionRow = rowIndex;

        document.getElementById('transaction-type').value = transaction.type;
        document.getElementById('transaction-desc').value = transaction.description;
        document.getElementById('transaction-amount').value = transaction.amount;
        document.getElementById('transaction-note').value = transaction.note;

        document.querySelector('#modal-transaction .modal-header h3').textContent = 'Sửa giao dịch';
        document.getElementById('modal-transaction').classList.add('active');
    },

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
