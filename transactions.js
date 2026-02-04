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
    async loadTransactions() {
        try {
            const data = await SheetsAPI.readData(`${CONFIG.SHEETS.TRANSACTIONS}!A2:F`);
            this.transactions = data.map((row, index) => ({
                rowIndex: index + 2,
                id: row[0] || '',
                date: row[1] || '',
                type: row[2] || '',
                description: row[3] || '',
                amount: parseFloat(row[4]) || 0,
                note: row[5] || ''
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
     * Filter transactions by type
     */
    filterTransactions(filter) {
        this.currentFilter = filter;

        // Update filter button states
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.filter === filter);
        });

        this.renderTransactions();
    },

    /**
     * Render transactions table
     */
    renderTransactions() {
        const tbody = document.getElementById('transactions-tbody');

        // Filter based on current filter
        let filtered = this.transactions;
        if (this.currentFilter !== 'all') {
            filtered = this.transactions.filter(t => t.type === this.currentFilter);
        }

        if (filtered.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" class="empty-state">
                        ${this.currentFilter === 'all' ? 'Chưa có giao dịch nào' :
                    this.currentFilter === 'income' ? 'Chưa có khoản thu nào' : 'Chưa có khoản chi nào'}
                    </td>
                </tr>
            `;
            return;
        }

        // Sort by date descending (newest first)
        const sorted = [...filtered].reverse();

        tbody.innerHTML = sorted.map(t => `
            <tr>
                <td>${t.date}</td>
                <td>
                    <span class="transaction-type ${t.type}">
                        ${t.type === 'income' ? '📥 Thu' : '📤 Chi'}
                    </span>
                </td>
                <td>${Products.escapeHtml(t.description)}</td>
                <td style="color: var(--accent-${t.type === 'income' ? 'success' : 'danger'}); font-weight: 600;">
                    ${t.type === 'income' ? '+' : '-'}${Products.formatCurrency(t.amount)}
                </td>
                <td class="note-cell">${Products.escapeHtml(t.note)}</td>
                <td>
                    <div class="action-btns">
                        <button class="action-btn edit" onclick="Transactions.editTransaction('${t.id}')" title="Sửa">✏️</button>
                        <button class="action-btn delete" onclick="Transactions.deleteTransaction('${t.id}')" title="Xóa">🗑️</button>
                    </div>
                </td>
            </tr>
        `).join('');
    },

    /**
     * Update summary cards
     */
    updateSummary() {
        const totalIncome = this.transactions
            .filter(t => t.type === 'income')
            .reduce((sum, t) => sum + t.amount, 0);

        const totalExpense = this.transactions
            .filter(t => t.type === 'expense')
            .reduce((sum, t) => sum + t.amount, 0);

        const balance = totalIncome - totalExpense;

        document.getElementById('total-income').textContent = Products.formatCurrency(totalIncome);
        document.getElementById('total-expense').textContent = Products.formatCurrency(totalExpense);
        document.getElementById('total-balance').textContent = Products.formatCurrency(balance);
    },

    /**
     * Show add transaction modal
     */
    showAddModal(type) {
        this.editingTransactionRow = null;
        document.getElementById('modal-transaction-title').textContent =
            type === 'income' ? '➕ Thêm khoản thu' : '➖ Thêm khoản chi';
        document.getElementById('transaction-type').value = type;
        document.getElementById('form-transaction').reset();
        document.getElementById('modal-transaction').classList.add('active');
    },

    /**
     * Edit transaction
     */
    editTransaction(id) {
        const transaction = this.transactions.find(t => t.id === id);
        if (!transaction) return;

        this.editingTransactionRow = transaction.rowIndex;
        document.getElementById('modal-transaction-title').textContent = '✏️ Sửa giao dịch';
        document.getElementById('transaction-type').value = transaction.type;
        document.getElementById('transaction-desc').value = transaction.description;
        document.getElementById('transaction-amount').value = transaction.amount;
        document.getElementById('transaction-note').value = transaction.note;
        document.getElementById('modal-transaction').classList.add('active');
    },

    /**
     * Add transaction programmatically (from Sales)
     */
    async addTransaction(type, description, amount, note = '') {
        const id = 'TX' + Date.now().toString().slice(-8);
        const date = new Date().toLocaleDateString('vi-VN');

        await SheetsAPI.appendData(CONFIG.SHEETS.TRANSACTIONS, [
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
                const transaction = this.transactions.find(t => t.rowIndex === this.editingTransactionRow);
                await SheetsAPI.updateData(
                    `${CONFIG.SHEETS.TRANSACTIONS}!A${this.editingTransactionRow}:F${this.editingTransactionRow}`,
                    [[transaction.id, transaction.date, type, description, amount, note]]
                );
                App.showToast('Đã cập nhật giao dịch');
            } else {
                // Add new transaction
                await this.addTransaction(type, description, amount, note);
                App.showToast(`Đã thêm ${type === 'income' ? 'khoản thu' : 'khoản chi'}`);
            }

            this.closeModal();
            await this.loadTransactions();
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
            await SheetsAPI.deleteRow(CONFIG.SHEETS.TRANSACTIONS, transaction.rowIndex - 1);
            App.showToast('Đã xóa giao dịch');
            await this.loadTransactions();
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
