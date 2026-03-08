/**
 * QLBH - Debt Management Module
 * Handles customer debt tracking (công nợ)
 */

const Debt = {
    debts: [],
    editingDebtRow: null,
    currentFilter: 'all',

    /**
     * Load all debts from sheet
     */
    async loadDebts() {
        try {
            // Ensure Debts sheet exists
            await SheetsAPI.ensureSheetExists(CONFIG.SHEETS.DEBTS,
                ['Mã nợ', 'Mã đơn', 'Tên khách', 'SĐT', 'Tổng tiền', 'Đã trả', 'Còn nợ', 'Ngày tạo', 'Ngày cập nhật', 'Trạng thái']);

            const data = await SheetsAPI.readData(`${CONFIG.SHEETS.DEBTS}!A2:J`);
            this.debts = data.map((row, index) => ({
                rowIndex: index + 2,
                id: row[0] || '',
                saleId: row[1] || '',
                customerName: row[2] || '',
                phone: row[3] || '',
                total: parseFloat(row[4]) || 0,
                paid: parseFloat(row[5]) || 0,
                remaining: parseFloat(row[6]) || 0,
                createdAt: row[7] || '',
                updatedAt: row[8] || '',
                status: row[9] || 'Còn nợ'
            }));
            this.renderDebts();
            this.updateSummary();
            return this.debts;
        } catch (error) {
            console.error('Error loading debts:', error);
            this.debts = [];
            this.renderDebts();
            this.updateSummary();
            return [];
        }
    },

    /**
     * Add a new debt record
     */
    async addDebt(saleId, customerName, phone, total, paid) {
        const debtId = 'CN' + Date.now().toString().slice(-8);
        const remaining = total - paid;
        const now = new Date().toLocaleString('vi-VN');
        const status = remaining <= 0 ? 'Đã trả' : 'Còn nợ';

        try {
            await SheetsAPI.ensureSheetExists(CONFIG.SHEETS.DEBTS,
                ['Mã nợ', 'Mã đơn', 'Tên khách', 'SĐT', 'Tổng tiền', 'Đã trả', 'Còn nợ', 'Ngày tạo', 'Ngày cập nhật', 'Trạng thái']);

            await SheetsAPI.appendData(CONFIG.SHEETS.DEBTS, [
                debtId, saleId, customerName, phone, total, paid, remaining, now, now, status
            ]);

            await this.loadDebts();
            return debtId;
        } catch (error) {
            console.error('Error adding debt:', error);
            throw error;
        }
    },

    /**
     * Pay debt (partial or full)
     */
    async payDebt(debtId, amount) {
        const debt = this.debts.find(d => d.id === debtId);
        if (!debt) return;

        const newPaid = debt.paid + amount;
        const newRemaining = debt.total - newPaid;
        const newStatus = newRemaining <= 0 ? 'Đã trả' : 'Còn nợ';
        const now = new Date().toLocaleString('vi-VN');

        try {
            // Update the row: columns F (paid), G (remaining), I (updatedAt), J (status)
            await SheetsAPI.updateData(
                `${CONFIG.SHEETS.DEBTS}!F${debt.rowIndex}:J${debt.rowIndex}`,
                [[newPaid, Math.max(0, newRemaining), debt.createdAt, now, newStatus]]
            );

            // If fully paid, add income transaction for the payment
            if (amount > 0) {
                await Transactions.addTransaction(
                    'income',
                    `Thu nợ: ${debt.customerName} (${debtId})`,
                    amount,
                    `Thanh toán công nợ đơn ${debt.saleId}`
                );
            }

            await this.loadDebts();
            App.showToast(`Đã thanh toán ${Products.formatCurrency(amount)} cho ${debt.customerName}`);
        } catch (error) {
            console.error('Error paying debt:', error);
            App.showToast('Lỗi thanh toán nợ', 'error');
        }
    },

    /**
     * Delete a debt record
     */
    async deleteDebt(debtId) {
        if (!confirm('Bạn có chắc muốn xóa công nợ này?')) return;

        const debt = this.debts.find(d => d.id === debtId);
        if (!debt) return;

        App.showLoading(true);
        try {
            await SheetsAPI.deleteRow(CONFIG.SHEETS.DEBTS, debt.rowIndex - 1);
            App.showToast('Đã xóa công nợ');
            await this.loadDebts();
        } catch (error) {
            console.error('Error deleting debt:', error);
            App.showToast('Lỗi xóa công nợ', 'error');
        } finally {
            App.showLoading(false);
        }
    },

    /**
     * Filter debts
     */
    filterDebts(type) {
        this.currentFilter = type;
        // Update filter button UI
        document.querySelectorAll('#tab-debts .filter-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.filter === type);
        });
        this.renderDebts();
    },

    /**
     * Render debts table
     */
    renderDebts() {
        const tbody = document.getElementById('debts-tbody');
        if (!tbody) return;

        let filtered = this.debts;
        if (this.currentFilter === 'pending') {
            filtered = this.debts.filter(d => d.status === 'Còn nợ');
        } else if (this.currentFilter === 'paid') {
            filtered = this.debts.filter(d => d.status === 'Đã trả');
        }

        if (filtered.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" class="empty-state">
                        ${this.currentFilter !== 'all' ? 'Không có công nợ phù hợp' : 'Chưa có công nợ nào'}
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = filtered.map(d => `
            <tr data-row="${d.rowIndex}">
                <td><strong>${Products.escapeHtml(d.id)}</strong></td>
                <td>${Products.escapeHtml(d.customerName)}</td>
                <td>${Products.escapeHtml(d.phone)}</td>
                <td>${Products.formatCurrency(d.total)}</td>
                <td style="color: var(--accent-success)">${Products.formatCurrency(d.paid)}</td>
                <td style="color: ${d.remaining > 0 ? 'var(--accent-danger)' : 'var(--accent-success)'}">${Products.formatCurrency(d.remaining)}</td>
                <td>
                    <span class="debt-status ${d.status === 'Đã trả' ? 'status-paid' : 'status-pending'}">
                        ${d.status}
                    </span>
                </td>
                <td>
                    <div class="action-btns">
                        ${d.status === 'Còn nợ' ? `
                            <button class="action-btn edit" onclick="Debt.showPayModal('${d.id}')" title="Thanh toán">💰</button>
                        ` : ''}
                        <button class="action-btn delete" onclick="Debt.deleteDebt('${d.id}')" title="Xóa">🗑️</button>
                    </div>
                </td>
            </tr>
        `).join('');
    },

    /**
     * Update summary cards
     */
    updateSummary() {
        const totalDebt = this.debts.reduce((sum, d) => sum + d.total, 0);
        const totalPaid = this.debts.reduce((sum, d) => sum + d.paid, 0);
        const totalRemaining = this.debts.reduce((sum, d) => sum + d.remaining, 0);
        const pendingCount = this.debts.filter(d => d.status === 'Còn nợ').length;

        const el = (id) => document.getElementById(id);
        if (el('debt-total')) el('debt-total').textContent = Products.formatCurrency(totalDebt);
        if (el('debt-paid')) el('debt-paid').textContent = Products.formatCurrency(totalPaid);
        if (el('debt-remaining')) el('debt-remaining').textContent = Products.formatCurrency(totalRemaining);
        if (el('debt-count')) el('debt-count').textContent = pendingCount;
    },

    /**
     * Show pay debt modal
     */
    showPayModal(debtId) {
        const debt = this.debts.find(d => d.id === debtId);
        if (!debt) return;

        document.getElementById('pay-debt-id').value = debtId;
        document.getElementById('pay-debt-customer').textContent = debt.customerName;
        document.getElementById('pay-debt-remaining').textContent = Products.formatCurrency(debt.remaining);
        document.getElementById('pay-debt-amount').value = '';
        document.getElementById('pay-debt-amount').max = debt.remaining;
        document.getElementById('pay-debt-amount').placeholder = `Tối đa: ${Products.formatCurrency(debt.remaining)}`;

        // Add quick-fill button for full payment
        document.getElementById('pay-debt-full').onclick = () => {
            document.getElementById('pay-debt-amount').value = debt.remaining;
        };

        document.getElementById('modal-pay-debt').classList.add('active');
    },

    /**
     * Close pay modal
     */
    closePayModal() {
        document.getElementById('modal-pay-debt').classList.remove('active');
    },

    /**
     * Initialize event listeners
     */
    init() {
        // Filter buttons
        document.querySelectorAll('#tab-debts .filter-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.filterDebts(btn.dataset.filter);
            });
        });

        // Pay debt form
        const payForm = document.getElementById('form-pay-debt');
        if (payForm) {
            payForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const debtId = document.getElementById('pay-debt-id').value;
                const amount = parseFloat(document.getElementById('pay-debt-amount').value);

                if (!amount || amount <= 0) {
                    App.showToast('Vui lòng nhập số tiền hợp lệ', 'error');
                    return;
                }

                App.showLoading(true);
                try {
                    await this.payDebt(debtId, amount);
                    this.closePayModal();
                } finally {
                    App.showLoading(false);
                }
            });
        }
    }
};
