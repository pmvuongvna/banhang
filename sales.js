/**
 * QLBH - Sales Module
 * Handles sales/checkout functionality
 */

const Sales = {
    cart: [],
    sales: [],

    /**
     * Load sales history
     */
    async loadSales(date = new Date()) {
        try {
            const sheetName = SheetsAPI.getMonthSheetName(CONFIG.SHEETS.SALES, date);

            // Check if sheet exists first
            const sheetIds = await SheetsAPI.getSheetIds();
            if (!sheetIds[sheetName]) {
                console.log(`Sheet ${sheetName} not found, returning empty sales`);
                this.sales = [];
                this.updateDashboardStats();
                return [];
            }

            const data = await SheetsAPI.readData(`${sheetName}!A2:F`);
            this.sales = data.map((row, index) => ({
                rowIndex: index + 2,
                id: row[0] || '',
                datetime: row[1] || '',
                details: row[2] || '',
                total: parseFloat(row[3]) || 0,
                profit: parseFloat(row[4]) || 0,
                note: row[5] || '',
                sheetName: sheetName // Store sheet name for updates
            }));
            this.updateDashboardStats();
            this.renderSalesHistory();
            return this.sales;
        } catch (error) {
            console.error('Error loading sales:', error);
            return [];
        }
    },

    /**
     * Search products for cart
     */
    searchProducts(query) {
        const container = document.getElementById('product-search-results');
        if (!query) {
            container.innerHTML = '';
            container.style.display = 'none';
            return;
        }

        const filtered = Products.products.filter(p =>
            p.name.toLowerCase().includes(query.toLowerCase()) ||
            p.code.toLowerCase().includes(query.toLowerCase())
        );

        if (filtered.length === 0) {
            container.innerHTML = '<div class="search-item">Không tìm thấy sản phẩm</div>';
            container.style.display = 'block';
            return;
        }

        container.innerHTML = filtered.map(p => `
            <div class="search-item" onclick="Sales.addToCart('${p.code}')">
                <div class="item-name">${Products.escapeHtml(p.name)}</div>
                <div class="item-meta">
                    <span class="item-code">${p.code}</span>
                    <span class="item-price">${Products.formatCurrency(p.price)}</span>
                    <span class="item-stock">Kho: ${p.stock}</span>
                </div>
            </div>
        `).join('');
        container.style.display = 'block';
    },

    /**
     * Add product to cart
     */
    addToCart(code) {
        const product = Products.products.find(p => p.code === code);
        if (!product) return;

        if (product.stock <= 0) {
            App.showToast('Sản phẩm đã hết hàng', 'warning');
            return;
        }

        const existing = this.cart.find(i => i.code === code);
        if (existing) {
            if (existing.quantity >= product.stock) {
                App.showToast('Số lượng vượt quá tồn kho', 'warning');
                return;
            }
            existing.quantity++;
        } else {
            this.cart.push({
                code: product.code,
                name: product.name,
                price: product.price,
                originalPrice: product.price,
                cost: product.cost,
                quantity: 1
            });
        }

        this.renderCart();
        document.getElementById('product-search-results').style.display = 'none';
        document.getElementById('search-sale-product').value = '';
    },

    /**
     * Remove from cart
     */
    removeFromCart(index) {
        this.cart.splice(index, 1);
        this.renderCart();
    },

    /**
     * Clear cart
     */
    clearCart() {
        this.cart = [];
        this.renderCart();
    },

    /**
     * Render cart items
     */
    renderCart() {
        const container = document.getElementById('cart-items');
        const totalEl = document.getElementById('cart-total');
        const profitEl = document.getElementById('cart-profit');

        if (this.cart.length === 0) {
            container.innerHTML = '<p class="empty-state">Chưa có sản phẩm trong giỏ</p>';
            totalEl.textContent = '0đ';
            profitEl.textContent = '0đ';
            return;
        }

        let total = 0;
        let profit = 0;

        container.innerHTML = this.cart.map((item, index) => {
            total += item.price * item.quantity;
            profit += (item.price - item.cost) * item.quantity;

            return `
                <div class="cart-item">
                    <div class="cart-item-info">
                        <div class="cart-item-name">${Products.escapeHtml(item.name)}</div>
                        <div class="cart-item-price">
                            <input type="number" class="price-input" 
                                value="${item.price}" 
                                onchange="Sales.updateItemPrice(${index}, this.value)"
                                onclick="this.select()">
                        </div>
                    </div>
                    <div class="cart-item-actions">
                        <button class="btn-qty" onclick="Sales.updateQuantity(${index}, -1)">-</button>
                        <span>${item.quantity}</span>
                        <button class="btn-qty" onclick="Sales.updateQuantity(${index}, 1)">+</button>
                        <button class="btn-remove" onclick="Sales.removeFromCart(${index})">×</button>
                    </div>
                </div>
            `;
        }).join('');

        totalEl.textContent = Products.formatCurrency(total);
        profitEl.textContent = Products.formatCurrency(profit);
    },

    /**
     * Update item quantity
     */
    updateQuantity(index, change) {
        const item = this.cart[index];
        const product = Products.products.find(p => p.code === item.code);

        const newQty = item.quantity + change;

        if (newQty <= 0) {
            this.removeFromCart(index);
            return;
        }

        if (product && newQty > product.stock) {
            App.showToast('Số lượng vượt quá tồn kho', 'warning');
            return;
        }

        item.quantity = newQty;
        this.renderCart();
    },

    /**
     * Update item price
     */
    updateItemPrice(index, newPrice) {
        const price = parseFloat(newPrice);
        if (price >= 0) {
            this.cart[index].price = price;
            this.renderCart();
        }
    },

    /**
     * Checkout
     */
    async checkout() {
        if (this.cart.length === 0) {
            App.showToast('Giỏ hàng trống', 'error');
            return;
        }

        App.showLoading(true);

        try {
            // Calculate totals
            let total = 0;
            let profit = 0;
            const details = [];

            for (const item of this.cart) {
                total += item.price * item.quantity;
                profit += (item.price - item.cost) * item.quantity;
                const priceNote = item.price !== item.originalPrice ? ` @${item.price}` : '';
                details.push(`${item.name}${priceNote} x${item.quantity}`);
            }

            const saleId = 'DH' + Date.now().toString().slice(-8);
            const now = new Date();
            const datetime = now.toLocaleString('vi-VN');
            const note = document.getElementById('cart-note').value.trim();

            const sheetName = SheetsAPI.getMonthSheetName(CONFIG.SHEETS.SALES, now);

            // Ensure sheet exists with headers
            await SheetsAPI.ensureSheetExists(sheetName, ['Mã đơn', 'Ngày giờ', 'Chi tiết', 'Tổng tiền', 'Lợi nhuận', 'Ghi chú']);

            // Save sale to sheet
            await SheetsAPI.appendData(sheetName, [
                saleId,
                datetime,
                details.join(', '),
                total,
                profit,
                note
            ]);

            // Update stock
            for (const item of this.cart) {
                await Products.updateStock(item.code, -item.quantity);
            }

            // ADD TRANSACTION
            const productNames = this.cart.map(item => item.name).join(', ');
            // Transactions also use monthly sheets now
            await Transactions.addTransaction('income', productNames, total, note || `Đơn: ${saleId}`, now);

            // Clear cart & reload
            this.cart = [];
            this.renderCart();
            document.getElementById('cart-note').value = '';
            await Products.loadProducts();

            // Reload sales for CURRENT SELECTED month (which might not be this month, but likely we want to see the result if it matches)
            // But best to reload based on current selector
            const currentSelectedDate = new Date(document.getElementById('month-selector').value + '-01');
            await this.loadSales(currentSelectedDate);

            App.showToast(`Thanh toán thành công! Tổng: ${Products.formatCurrency(total)}`, 'success');

        } catch (error) {
            console.error('Error during checkout:', error);
            App.showToast('Lỗi thanh toán', 'error');
        } finally {
            App.showLoading(false);
        }
    },

    /**
     * Helper: Parse datetime string to object
     */
    parseDatetime(str) {
        if (!str) return null;
        // Format: "10:30:00 12/02/2026" or similar
        const parts = str.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
        if (parts) {
            return new Date(parts[3], parts[2] - 1, parts[1]);
        }
        return null;
    },

    /**
     * Helper: Check if date is today
     */
    isToday(date) {
        if (!date) return false;
        const today = new Date();
        return date.getDate() === today.getDate() &&
            date.getMonth() === today.getMonth() &&
            date.getFullYear() === today.getFullYear();
    },

    /**
     * Render sales history table (Grouped by Date)
     */
    renderSalesHistory(searchQuery = '') {
        const container = document.getElementById('sales-tbody'); // This is actually a tbody, but for grouping we might need to change structure or use rows efficiently
        // Wait, grouping in a table is tricky. 
        // User asked: "Order history, group and display by date, newest date expanded, others collapsed".
        // Doing this inside a <table> (tbody) is possible but requires careful row management or multiple tbodys.
        // A better approach might be to replace the TABLE structure with a DIV structure for history, OR use multiple <tbody>s.
        // Let's stick to the table but use multiple tbodys or headers.

        // actually, standard table doesn't support "collapse" easily without JS. 
        // I will re-implement the render logic to render multiple logs, grouped by headers.

        if (!container) return;

        // Clear current content
        container.innerHTML = '';

        // Note: The container is `sales-tbody`. If I want to group, I probably should return row-span logic or just header rows.
        // BUT, user wants "click to expand". 
        // Best approach: 
        // 1. Group data.
        // 2. For each group, render a "Header Row" (clickable).
        // 3. Render "Data Rows" (hidden/shown based on state).

        let filtered = this.sales;
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            filtered = this.sales.filter(s =>
                s.id.toLowerCase().includes(query) ||
                s.details.toLowerCase().includes(query) ||
                s.note.toLowerCase().includes(query)
            );
        }

        if (filtered.length === 0) {
            container.innerHTML = `<tr><td colspan="6" class="empty-state">Không có dữ liệu</td></tr>`;
            return;
        }

        // Sort descending
        filtered.sort((a, b) => this.parseVietnameseDateTime(b.datetime) - this.parseVietnameseDateTime(a.datetime));

        // Group by Date (dd/mm/yyyy)
        const groups = {};
        filtered.forEach(s => {
            const dateStr = s.datetime.split(',')[0].trim(); // Extract date part
            if (!groups[dateStr]) groups[dateStr] = [];
            groups[dateStr].push(s);
        });

        const dates = Object.keys(groups).sort((a, b) => {
            // Sort dates descending
            const [d1, m1, y1] = a.split('/').map(Number);
            const [d2, m2, y2] = b.split('/').map(Number);
            return new Date(y2, m2 - 1, d2) - new Date(y1, m1 - 1, d1);
        });

        let html = '';
        dates.forEach((date, index) => {
            const isFirst = index === 0;
            const isOpen = isFirst ? 'open' : '';
            const display = isFirst ? 'table-row' : 'none';
            const icon = isFirst ? '▼' : '▶';

            // Header Row
            html += `
                <tr class="group-header" onclick="Sales.toggleGroup(this)" style="background-color: var(--bg-tertiary); cursor: pointer; font-weight: bold;">
                    <td colspan="6">
                        <span class="group-icon">${icon}</span> ${date} (${groups[date].length} đơn)
                        <span style="float: right; color: var(--accent-success);">${Products.formatCurrency(groups[date].reduce((sum, s) => sum + s.total, 0))}</span>
                    </td>
                </tr>
            `;

            // Data Rows
            groups[date].forEach(s => {
                html += `
                    <tr class="group-item" data-date="${date}" style="display: ${display};">
                        <td><strong>${s.id}</strong></td>
                         <td class="editable-cell" data-sale-id="${s.id}" data-field="datetime">
                            ${s.datetime}
                            <span class="edit-hint">✏️</span>
                        </td>
                        <td class="details-cell">${Products.escapeHtml(s.details)}</td>
                        <td style="font-weight: 600; color: var(--accent-success);">
                            ${Products.formatCurrency(s.total)}
                        </td>
                        <td class="note-cell">${Products.escapeHtml(s.note)}</td>
                        <td>
                            <div class="action-btns">
                                <button class="action-btn edit" onclick="Sales.editSale('${s.id}')" title="Sửa">✏️</button>
                                <button class="action-btn delete" onclick="Sales.deleteSale('${s.id}')" title="Xóa">🗑️</button>
                            </div>
                        </td>
                    </tr>
                `;
            });
        });

        container.innerHTML = html;

        // Re-attach editable events
        container.querySelectorAll('.editable-cell[data-field="datetime"]').forEach(cell => {
            InlineEdit.makeEditable(cell, async (newValue) => {
                const saleId = cell.dataset.saleId;
                await InlineEdit.updateSaleDatetime(saleId, newValue);
            });
        });
    },

    /**
     * Toggle group visibility
     */
    toggleGroup(headerRow) {
        const icon = headerRow.querySelector('.group-icon');
        const nextRows = [];
        let next = headerRow.nextElementSibling;

        // Find all rows until next header
        while (next && !next.classList.contains('group-header')) {
            nextRows.push(next);
            next = next.nextElementSibling;
        }

        const isCollapsed = nextRows[0].style.display === 'none';

        nextRows.forEach(row => {
            row.style.display = isCollapsed ? 'table-row' : 'none';
        });

        icon.textContent = isCollapsed ? '▼' : '▶';
    },

    /**
     * Parse Vietnamese DateTime string to Date object
     * Supported formats: "HH:mm:ss dd/mm/yyyy" or "dd/mm/yyyy"
     */
    parseVietnameseDateTime(str) {
        if (!str) return new Date();

        // Extract date part
        const dateMatch = str.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
        if (!dateMatch) return new Date();

        const d = parseInt(dateMatch[1]);
        const m = parseInt(dateMatch[2]) - 1;
        const y = parseInt(dateMatch[3]);

        // Extract time part if exists
        const timeMatch = str.match(/(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?/);
        let h = 0, min = 0, s = 0;
        if (timeMatch) {
            h = parseInt(timeMatch[1]);
            min = parseInt(timeMatch[2]);
            s = timeMatch[3] ? parseInt(timeMatch[3]) : 0;
        }

        return new Date(y, m, d, h, min, s);
    },

    /**
     * Show modal to add old sale
     */
    showAddSaleModal() {
        document.getElementById('sale-row').value = '';
        document.getElementById('sale-id').value = 'DH' + Date.now().toString().slice(-8);
        document.getElementById('sale-id').readOnly = false; // Allow editing ID for old sales? Maybe not.

        // Set default datetime to now
        const now = new Date();
        document.getElementById('sale-datetime').value = now.toLocaleString('vi-VN');

        document.getElementById('sale-details').value = '';
        document.getElementById('sale-total').value = '';
        document.getElementById('sale-profit').value = '';
        document.getElementById('sale-note').value = '';

        document.getElementById('modal-sale').classList.add('active');
    },

    /**
     * Edit sale
     */
    editSale(id) {
        const sale = this.sales.find(s => s.id === id);
        if (!sale) return;

        document.getElementById('sale-row').value = sale.rowIndex;
        document.getElementById('sale-id').value = sale.id;
        document.getElementById('sale-id').readOnly = true;
        document.getElementById('sale-datetime').value = sale.datetime;
        document.getElementById('sale-details').value = sale.details;
        document.getElementById('sale-total').value = sale.total;
        document.getElementById('sale-profit').value = sale.profit;
        document.getElementById('sale-note').value = sale.note;

        document.getElementById('modal-sale').classList.add('active');
    },

    /**
     * Update dashboard stats
     */
    updateDashboardStats() {
        const revenue = this.sales.reduce((sum, s) => sum + s.total, 0);
        const profit = this.sales.reduce((sum, s) => sum + s.profit, 0);
        const orders = this.sales.length;

        document.getElementById('stat-revenue').textContent = Products.formatCurrency(revenue);
        document.getElementById('stat-profit').textContent = Products.formatCurrency(profit);
        document.getElementById('stat-orders').textContent = orders;

        // Products count is managed by Products module usually, but we can update it if needed or leave it.
        // Dashboard also has chart which is updated separately.
    },

    /**
     * Save sale (add or update)
     */
    async saveSale() {
        // ... (validation logic same) ...
        const rowIndex = document.getElementById('sale-row').value;
        const id = document.getElementById('sale-id').value.trim();
        const datetime = document.getElementById('sale-datetime').value.trim();
        const details = document.getElementById('sale-details').value.trim();
        const total = parseFloat(document.getElementById('sale-total').value) || 0;
        const profit = parseFloat(document.getElementById('sale-profit').value) || 0;
        const note = document.getElementById('sale-note').value.trim();

        if (!id || !datetime || !details || total <= 0) {
            App.showToast('Vui lòng nhập đầy đủ thông tin', 'error');
            return;
        }

        App.showLoading(true);

        try {
            // Determine sheet based on date
            // Note: If editing, we should ideally know which sheet it came from.
            // For now, let's assume we are editing within the CURRENT context view or pass sheetName.
            // The `editSale` set form values but didn't store origin sheet. 
            // We can infer sheet from the date provided in the form, OR rely on the loaded data's context.
            // Since we added `sheetName` to `this.sales` items in `loadSales`, we should track it.

            // However, if user CHANGES the date to a different month, we technically need to move the row.
            // That is complex. Let's assume for now edits stay in the same sheet or user knows what they are doing.
            // Simplest: Always write to the sheet corresponding to the DATE in the form.

            const saleDate = this.parseVietnameseDateTime(datetime);
            const targetSheetName = SheetsAPI.getMonthSheetName(CONFIG.SHEETS.SALES, saleDate);

            // Ensure target sheet exists
            await SheetsAPI.ensureSheetExists(targetSheetName, ['Mã đơn', 'Ngày giờ', 'Chi tiết', 'Tổng tiền', 'Lợi nhuận', 'Ghi chú']);

            // If we are editing, we have a problem: the original row might be in a different sheet if we changed dates.
            // But usually edits are small. 
            // If `rowIndex` exists, it implies we are updating a row in the *currently viewed* list (which is bound to a specific month).
            // So if I am viewing Feb 2026, and edit a row, I am "likely" updating Sales_02_2026.
            // But if I change date to Jan 2026, it should technically move to Sales_01_2026.
            // For simplicity in this iteration: Update strictly updates the row index in the SHEET that was loaded.
            // UNLESS we want to support moving. 
            // Let's stick to updating the loaded sheet for now to avoid complexity of "delete from A, add to B".

            // Wait, I need to know which sheet the currently edited item belongs to. 
            // I'll grab it from `this.sales`.

            let sheetToUpdate = targetSheetName; // Default for new

            if (rowIndex) {
                // Editing
                const existingSale = this.sales.find(s => s.id === id); // Find by ID might be risky if changed, but usually ID is stable-ish or we have reference
                // actually `rowIndex` comes from the form which was populated by `editSale`.
                // let's trust the loaded context. The loaded context is `Sales_MM_YYYY` unless we loaded multiple?
                // We loaded one month. So `sheetToUpdate` should be the loaded sheet.
                // But wait, `loadSales` set `this.sales` with `sheetName`.

                if (existingSale && existingSale.sheetName) {
                    sheetToUpdate = existingSale.sheetName;
                }

                // If date changed significantly (month change), we technically should move it.
                // Let's just update in place for now.
                await SheetsAPI.updateData(
                    `${sheetToUpdate}!A${rowIndex}:F${rowIndex}`,
                    [[id, datetime, details, total, profit, note]]
                );
                App.showToast('Đã cập nhật đơn hàng');

            } else {
                // Add new
                await SheetsAPI.appendData(targetSheetName, [
                    id, datetime, details, total, profit, note
                ]);
                App.showToast('Đã thêm đơn hàng');
            }

            document.getElementById('modal-sale').classList.remove('active');

            // Reload based on current selector
            const currentSelectedDate = new Date(document.getElementById('month-selector').value + '-01');
            await this.loadSales(currentSelectedDate);

        } catch (error) {
            console.error('Error saving sale:', error);
            App.showToast('Lỗi lưu đơn hàng', 'error');
        } finally {
            App.showLoading(false);
        }
    },

    // ... (deleteSale) ...
    async deleteSale(id) {
        if (!confirm('Bạn có chắc muốn xóa đơn hàng này?')) return;

        const sale = this.sales.find(s => s.id === id);
        if (!sale) return;

        App.showLoading(true);

        try {
            await SheetsAPI.deleteRow(sale.sheetName, sale.rowIndex - 1);
            App.showToast('Đã xóa đơn hàng');

            const currentSelectedDate = new Date(document.getElementById('month-selector').value + '-01');
            await this.loadSales(currentSelectedDate);
        } catch (error) {
            console.error('Error deleting sale:', error);
            App.showToast('Lỗi xóa đơn hàng', 'error');
        } finally {
            App.showLoading(false);
        }
    },

    /**
     * Initialize event listeners
     */
    init() {
        // Search input
        document.getElementById('search-sale-product').addEventListener('input', (e) => {
            this.searchProducts(e.target.value);
        });

        // Clear cart button
        document.getElementById('btn-clear-cart').addEventListener('click', () => {
            this.clearCart();
        });

        // Checkout button
        document.getElementById('btn-checkout').addEventListener('click', () => {
            this.checkout();
        });

        // Add old sale button
        document.getElementById('btn-add-sale')?.addEventListener('click', () => {
            this.showAddSaleModal();
        });

        // Sale form submit
        document.getElementById('form-sale')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveSale();
        });

        // Sales history search
        document.getElementById('search-sales')?.addEventListener('input', (e) => {
            this.renderSalesHistory(e.target.value);
        });
    }
};
