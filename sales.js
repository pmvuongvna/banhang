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
    async loadSales() {
        try {
            const data = await SheetsAPI.readData(`${CONFIG.SHEETS.SALES}!A2:F`);
            this.sales = data.map((row, index) => ({
                rowIndex: index + 2,
                id: row[0] || '',
                datetime: row[1] || '',
                details: row[2] || '',
                total: parseFloat(row[3]) || 0,
                profit: parseFloat(row[4]) || 0,
                note: row[5] || ''
            }));
            this.updateDashboardStats();
            return this.sales;
        } catch (error) {
            console.error('Error loading sales:', error);
            return [];
        }
    },

    /**
     * Search products for sale
     */
    searchProducts(query) {
        const results = Products.search(query);
        const container = document.getElementById('product-search-results');

        if (!query) {
            container.innerHTML = '<p class="empty-state">Nhập mã hoặc tên sản phẩm để tìm kiếm</p>';
            return;
        }

        if (results.length === 0) {
            container.innerHTML = '<p class="empty-state">Không tìm thấy sản phẩm</p>';
            return;
        }

        container.innerHTML = results.map(p => `
            <div class="search-result-item" onclick="Sales.addToCart('${p.code}')">
                <div class="product-info">
                    <div class="product-name">${Products.escapeHtml(p.name)}</div>
                    <div class="product-code">${p.code} | Tồn: ${p.stock}</div>
                </div>
                <div class="product-price">${Products.formatCurrency(p.price)}</div>
            </div>
        `).join('');
    },

    /**
     * Add product to cart
     */
    addToCart(code) {
        const product = Products.getProduct(code);
        if (!product) return;

        if (product.stock <= 0) {
            App.showToast('Sản phẩm đã hết hàng', 'error');
            return;
        }

        const existingItem = this.cart.find(item => item.code === code);

        if (existingItem) {
            if (existingItem.quantity >= product.stock) {
                App.showToast('Không đủ hàng trong kho', 'error');
                return;
            }
            existingItem.quantity++;
        } else {
            this.cart.push({
                code: product.code,
                name: product.name,
                price: product.price,
                originalPrice: product.price, // Giữ giá gốc để tính lãi
                cost: product.cost,
                quantity: 1,
                maxStock: product.stock
            });
        }

        this.renderCart();
        App.showToast(`Đã thêm ${product.name}`, 'success');
    },

    /**
     * Update cart item quantity
     */
    updateQuantity(code, delta) {
        const item = this.cart.find(i => i.code === code);
        if (!item) return;

        const newQty = item.quantity + delta;

        if (newQty <= 0) {
            this.removeFromCart(code);
            return;
        }

        if (newQty > item.maxStock) {
            App.showToast('Không đủ hàng trong kho', 'error');
            return;
        }

        item.quantity = newQty;
        this.renderCart();
    },

    /**
     * Update cart item price (for custom pricing)
     */
    updatePrice(code, newPrice) {
        const item = this.cart.find(i => i.code === code);
        if (!item) return;

        const price = parseFloat(newPrice) || 0;
        if (price < 0) {
            App.showToast('Giá không hợp lệ', 'error');
            return;
        }

        item.price = price;
        this.renderCart();
    },

    /**
     * Remove item from cart
     */
    removeFromCart(code) {
        this.cart = this.cart.filter(item => item.code !== code);
        this.renderCart();
    },

    /**
     * Clear cart
     */
    clearCart() {
        if (this.cart.length === 0) return;
        if (confirm('Xóa tất cả sản phẩm trong giỏ hàng?')) {
            this.cart = [];
            this.renderCart();
        }
    },

    /**
     * Render cart
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

        container.innerHTML = this.cart.map(item => {
            const itemTotal = item.price * item.quantity;
            const itemProfit = (item.price - item.cost) * item.quantity;
            total += itemTotal;
            profit += itemProfit;

            const priceChanged = item.price !== item.originalPrice;

            return `
                <div class="cart-item">
                    <div class="cart-item-info">
                        <div class="cart-item-name">${Products.escapeHtml(item.name)}</div>
                        <div class="cart-item-price-edit">
                            <input type="number" 
                                   class="price-input ${priceChanged ? 'price-changed' : ''}" 
                                   value="${item.price}" 
                                   onchange="Sales.updatePrice('${item.code}', this.value)"
                                   onclick="this.select()"
                                   title="Click để sửa giá">
                            ${priceChanged ? '<span class="price-original">' + Products.formatCurrency(item.originalPrice) + '</span>' : ''}
                        </div>
                    </div>
                    <div class="cart-item-qty">
                        <button onclick="Sales.updateQuantity('${item.code}', -1)">−</button>
                        <span>${item.quantity}</span>
                        <button onclick="Sales.updateQuantity('${item.code}', 1)">+</button>
                    </div>
                    <div class="cart-item-total">${Products.formatCurrency(itemTotal)}</div>
                    <button class="cart-item-remove" onclick="Sales.removeFromCart('${item.code}')">✕</button>
                </div>
            `;
        }).join('');

        totalEl.textContent = Products.formatCurrency(total);
        profitEl.textContent = Products.formatCurrency(profit);
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
                // Show custom price if changed
                const priceNote = item.price !== item.originalPrice ? ` @${item.price}` : '';
                details.push(`${item.name}${priceNote} x${item.quantity}`);
            }

            // Generate sale ID
            const saleId = 'DH' + Date.now().toString().slice(-8);
            const datetime = new Date().toLocaleString('vi-VN');

            // Get note from input
            const note = document.getElementById('cart-note').value.trim();

            // Save sale to sheet
            await SheetsAPI.appendData(CONFIG.SHEETS.SALES, [
                saleId,
                datetime,
                details.join(', '),
                total,
                profit,
                note
            ]);

            // Update stock for each product
            for (const item of this.cart) {
                await Products.updateStock(item.code, -item.quantity);
            }

            // Add transaction (income) - show product names
            const productNames = this.cart.map(item => item.name).join(', ');
            await Transactions.addTransaction('income', productNames, total, `Đơn: ${saleId}`);

            // Clear cart, note and reload data
            this.cart = [];
            this.renderCart();
            document.getElementById('cart-note').value = ''; // Clear note
            await Products.loadProducts();
            await this.loadSales();

            App.showToast(`Thanh toán thành công! Tổng: ${Products.formatCurrency(total)}`, 'success');

        } catch (error) {
            console.error('Error during checkout:', error);
            App.showToast('Lỗi thanh toán', 'error');
        } finally {
            App.showLoading(false);
        }
    },

    /**
     * Parse Vietnamese datetime string to Date object
     * Format can be: "12:33:22 4/2/2026" or "4/2/2026, 12:33:22" etc
     */
    parseDatetime(datetimeStr) {
        if (!datetimeStr) return null;

        // Try to extract date part (d/m/yyyy format)
        const dateMatch = datetimeStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
        if (dateMatch) {
            const day = parseInt(dateMatch[1]);
            const month = parseInt(dateMatch[2]) - 1; // 0-indexed
            const year = parseInt(dateMatch[3]);
            return new Date(year, month, day);
        }

        return null;
    },

    /**
     * Check if datetime is today
     */
    isToday(datetimeStr) {
        const saleDate = this.parseDatetime(datetimeStr);
        if (!saleDate) return false;

        const today = new Date();
        return saleDate.getDate() === today.getDate() &&
            saleDate.getMonth() === today.getMonth() &&
            saleDate.getFullYear() === today.getFullYear();
    },

    /**
     * Update dashboard stats
     */
    updateDashboardStats() {
        // Filter sales for today using improved date parsing
        const todaySales = this.sales.filter(s => this.isToday(s.datetime));

        const todayRevenue = todaySales.reduce((sum, s) => sum + s.total, 0);
        const todayProfit = todaySales.reduce((sum, s) => sum + s.profit, 0);
        const todayOrders = todaySales.length;

        document.getElementById('stat-revenue').textContent = Products.formatCurrency(todayRevenue);
        document.getElementById('stat-profit').textContent = Products.formatCurrency(todayProfit);
        document.getElementById('stat-orders').textContent = todayOrders;

        // Recent sales
        const recentSalesList = document.getElementById('recent-sales-list');
        const recentSales = [...this.sales].reverse().slice(0, 5);

        if (recentSales.length === 0) {
            recentSalesList.innerHTML = '<p class="empty-state">Chưa có đơn hàng nào</p>';
        } else {
            recentSalesList.innerHTML = recentSales.map(s => `
                <div class="list-item">
                    <div>
                        <div class="item-title">${s.id}</div>
                        <div class="item-subtitle">${s.datetime}</div>
                    </div>
                    <div class="item-value">${Products.formatCurrency(s.total)}</div>
                </div>
            `).join('');
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
    }
};
