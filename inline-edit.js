/**
 * QLBH - Inline Editing Utility
 * Handles inline cell editing for tables
 */

const InlineEdit = {
    /**
     * Make a cell editable
     * @param {HTMLElement} cell - The table cell element
     * @param {Function} onSave - Callback function when value is saved (newValue, cell)
     */
    makeEditable(cell, onSave) {
        const originalValue = cell.textContent.trim();

        cell.addEventListener('click', () => {
            if (cell.classList.contains('editing')) return;

            cell.classList.add('editing');
            const input = document.createElement('input');
            input.type = 'text';
            input.value = originalValue;

            cell.textContent = '';
            cell.appendChild(input);
            input.focus();
            input.select();

            const saveEdit = async () => {
                const newValue = input.value.trim();
                cell.classList.remove('editing');

                if (newValue && newValue !== originalValue) {
                    // Show loading state
                    cell.textContent = '⏳ Đang lưu...';

                    try {
                        await onSave(newValue, cell);
                        cell.textContent = newValue;
                        App.showToast('Đã cập nhật', 'success');
                    } catch (error) {
                        console.error('Error saving edit:', error);
                        cell.textContent = originalValue;
                        App.showToast('Lỗi cập nhật', 'error');
                    }
                } else {
                    cell.textContent = originalValue;
                }
            };

            input.addEventListener('blur', saveEdit);
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    saveEdit();
                } else if (e.key === 'Escape') {
                    cell.classList.remove('editing');
                    cell.textContent = originalValue;
                }
            });
        });
    },

    /**
     * Update sale datetime
     */
    async updateSaleDatetime(saleId, newDatetime) {
        const sale = Sales.sales.find(s => s.id === saleId);
        if (!sale) throw new Error('Sale not found');

        // Update in Google Sheets
        await SheetsAPI.updateData(
            `${CONFIG.SHEETS.SALES}!B${sale.rowIndex}`,
            [[newDatetime]]
        );

        // Update local data
        sale.datetime = newDatetime;

        // Also update corresponding transaction if exists
        const transaction = Transactions.transactions.find(t =>
            t.description.includes(sale.details.split(',')[0]) &&
            Math.abs(t.amount - sale.total) < 1
        );

        if (transaction) {
            // Extract date from datetime (e.g., "4/2/2026, 10:30:00" -> "4/2/2026")
            const datePart = newDatetime.split(',')[0];
            await SheetsAPI.updateData(
                `${CONFIG.SHEETS.TRANSACTIONS}!B${transaction.rowIndex}`,
                [[datePart]]
            );
            transaction.date = datePart;
        }

        // Reload to refresh displays
        await Sales.loadSales();
        await Transactions.loadTransactions();
    },

    /**
     * Update transaction date
     */
    async updateTransactionDate(transactionId, newDate) {
        const transaction = Transactions.transactions.find(t => t.id === transactionId);
        if (!transaction) throw new Error('Transaction not found');

        // Update in Google Sheets
        await SheetsAPI.updateData(
            `${CONFIG.SHEETS.TRANSACTIONS}!B${transaction.rowIndex}`,
            [[newDate]]
        );

        // Update local data
        transaction.date = newDate;

        // If this is a sale transaction, update the sale datetime too
        const saleIdMatch = transaction.note.match(/Đơn: (DH\d+)/);
        if (saleIdMatch) {
            const saleId = saleIdMatch[1];
            const sale = Sales.sales.find(s => s.id === saleId);

            if (sale) {
                // Keep the time part from original datetime
                const timePart = sale.datetime.includes(',') ? sale.datetime.split(', ')[1] : '00:00:00';
                const newDatetime = `${newDate}, ${timePart}`;

                await SheetsAPI.updateData(
                    `${CONFIG.SHEETS.SALES}!B${sale.rowIndex}`,
                    [[newDatetime]]
                );
                sale.datetime = newDatetime;
            }
        }

        // Reload to refresh displays
        await Transactions.loadTransactions();
        await Sales.loadSales();
    }
};
