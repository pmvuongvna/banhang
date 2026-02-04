/**
 * QLBH - Transactions Module
 * Handles income/expense tracking
 */

const Transactions = {
    transactions: [],
    editingTransactionRow: null,

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
     * Render transactions table
     */
    renderTransactions() {
        const tbody = document.getElementById('transactions-tbody');

        if (this.transactions.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" class="empty-state">Chưa có giao dịch nào</td>
                </tr>
            `;
            return;
        }

        // Sort by date descending (newest first)
        const sorted = [...this.transactions].reverse();

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
                <td>
                    <div class="action-btns">
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
        document.getElementById('modal-transaction-title').textContent =
            type === 'income' ? '➕ Thêm khoản thu' : '➖ Thêm khoản chi';
        document.getElementById('transaction-type').value = type;
        document.getElementById('form-transaction').reset();
        document.getElementById('modal-transaction').classList.add('active');
    },

    /**
     * Add transaction (can be called programmatically)
     */
    async addTransaction(type, description, amount, note = '') {
        try {
            const id = 'GD' + Date.now().toString().slice(-8);
            const date = new Date().toLocaleDateString('vi-VN');

            await SheetsAPI.appendData(CONFIG.SHEETS.TRANSACTIONS, [
                id,
                date,
                type,
                description,
                amount,
                note
            ]);

            return true;
        } catch (error) {
            console.error('Error adding transaction:', error);
            return false;
        }
    },

    /**
     * Save transaction from form
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
            await this.addTransaction(type, description, amount, note);
            App.showToast(`Đã thêm ${type === 'income' ? 'khoản thu' : 'khoản chi'}`);
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
    }
};
