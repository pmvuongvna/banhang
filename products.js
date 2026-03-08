/**
 * QLBH - Products Module
 * Handles product management
 */

const Products = {
    products: [],
    editingProductRow: null,

    /**
     * Load all products from sheet
     */
    async loadProducts() {
        try {
            const data = await SheetsAPI.readData(`${CONFIG.SHEETS.PRODUCTS}!A2:H`);
            this.products = data.map((row, index) => ({
                rowIndex: index + 2, // +2 because of 0-index and header row
                code: row[0] || '',
                name: row[1] || '',
                cost: parseFloat(row[2]) || 0,
                price: parseFloat(row[3]) || 0,
                profit: parseFloat(row[4]) || 0,
                stock: parseInt(row[5]) || 0,
                createdAt: row[6] || '',
                category: row[7] || 'Chung'
            }));
            this.renderProducts();
            this.updateStats();
            return this.products;
        } catch (error) {
            console.error('Error loading products:', error);
            App.showToast('Lỗi tải sản phẩm', 'error');
            return [];
        }
    },

    /**
     * Render products table
     */
    renderProducts(filter = '', categoryFilter = '') {
        const tbody = document.getElementById('products-tbody');
        let filtered = filter
            ? this.products.filter(p =>
                p.name.toLowerCase().includes(filter.toLowerCase()) ||
                p.code.toLowerCase().includes(filter.toLowerCase())
            )
            : this.products;

        // Apply category filter
        if (categoryFilter && categoryFilter !== 'all') {
            filtered = filtered.filter(p => p.category === categoryFilter);
        }

        if (filtered.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" class="empty-state">
                        ${filter || categoryFilter ? 'Không tìm thấy sản phẩm' : 'Chưa có sản phẩm nào. Thêm sản phẩm đầu tiên!'}
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = filtered.map(p => `
            <tr data-row="${p.rowIndex}">
                <td><strong>${this.escapeHtml(p.code)}</strong></td>
                <td>${this.escapeHtml(p.name)}</td>
                <td><span class="category-badge">${this.escapeHtml(p.category)}</span></td>
                <td>${this.formatCurrency(p.cost)}</td>
                <td>${this.formatCurrency(p.price)}</td>
                <td style="color: var(--accent-success)">${this.formatCurrency(p.profit)}</td>
                <td>
                    <span class="${p.stock <= 5 ? 'low-stock' : ''}">${p.stock}</span>
                </td>
                <td>
                    <div class="action-btns">
                        <button class="action-btn" onclick="Products.duplicateProduct('${p.code}')" title="Nhân đôi">📋</button>
                        <button class="action-btn edit" onclick="Products.editProduct('${p.code}')" title="Sửa">✏️</button>
                        <button class="action-btn delete" onclick="Products.deleteProduct('${p.code}')" title="Xóa">🗑️</button>
                    </div>
                </td>
            </tr>
        `).join('');
    },

    /**
     * Show add product modal
     */
    showAddModal() {
        this.editingProductRow = null;
        document.getElementById('modal-product-title').textContent = 'Thêm sản phẩm';
        document.getElementById('form-product').reset();
        document.getElementById('product-code').value = this.generateCode();
        document.getElementById('product-profit-display').value = '';
        document.getElementById('modal-product').classList.add('active');
    },

    /**
     * Edit product
     */
    editProduct(code) {
        const product = this.products.find(p => p.code === code);
        if (!product) return;

        this.editingProductRow = product.rowIndex;
        document.getElementById('modal-product-title').textContent = 'Sửa sản phẩm';
        document.getElementById('product-code').value = product.code;
        document.getElementById('product-name').value = product.name;
        document.getElementById('product-cost').value = product.cost;
        document.getElementById('product-price').value = product.price;
        document.getElementById('product-stock').value = product.stock;
        document.getElementById('product-category').value = product.category || 'Chung';
        document.getElementById('product-profit-display').value = this.formatCurrency(product.profit);
        document.getElementById('modal-product').classList.add('active');
    },

    /**
     * Save product (add or update)
     */
    async saveProduct() {
        const code = document.getElementById('product-code').value.trim();
        const name = document.getElementById('product-name').value.trim();
        const cost = parseFloat(document.getElementById('product-cost').value) || 0;
        const price = parseFloat(document.getElementById('product-price').value) || 0;
        const stock = parseInt(document.getElementById('product-stock').value) || 0;
        const category = document.getElementById('product-category').value || 'Chung';
        const profit = price - cost;

        if (!code || !name) {
            App.showToast('Vui lòng nhập đầy đủ thông tin', 'error');
            return;
        }

        // Check duplicate code (only for new products)
        if (!this.editingProductRow && this.products.some(p => p.code === code)) {
            App.showToast('Mã sản phẩm đã tồn tại', 'error');
            return;
        }

        App.showLoading(true);

        try {
            const values = [code, name, cost, price, profit, stock, new Date().toLocaleDateString('vi-VN'), category];

            if (this.editingProductRow) {
                // Update existing product
                await SheetsAPI.updateData(
                    `${CONFIG.SHEETS.PRODUCTS}!A${this.editingProductRow}:H${this.editingProductRow}`,
                    [values]
                );
                App.showToast('Đã cập nhật sản phẩm');
            } else {
                // Add new product
                await SheetsAPI.appendData(CONFIG.SHEETS.PRODUCTS, values);
                App.showToast('Đã thêm sản phẩm mới');
            }

            this.closeModal();
            await this.loadProducts();
        } catch (error) {
            console.error('Error saving product:', error);
            App.showToast('Lỗi lưu sản phẩm', 'error');
        } finally {
            App.showLoading(false);
        }
    },

    /**
     * Duplicate product
     */
    async duplicateProduct(code) {
        const product = this.products.find(p => p.code === code);
        if (!product) return;

        // Generate new code
        const newCode = this.generateCode();

        App.showLoading(true);

        try {
            const values = [
                newCode,
                product.name + ' (Copy)',
                product.cost,
                product.price,
                product.profit,
                product.stock,
                new Date().toLocaleDateString('vi-VN'),
                product.category || 'Chung'
            ];

            await SheetsAPI.appendData(CONFIG.SHEETS.PRODUCTS, values);
            App.showToast(`Đã nhân đôi sản phẩm: ${newCode}`);
            await this.loadProducts();
        } catch (error) {
            console.error('Error duplicating product:', error);
            App.showToast('Lỗi nhân đôi sản phẩm', 'error');
        } finally {
            App.showLoading(false);
        }
    },

    /**
     * Delete product
     */
    async deleteProduct(code) {
        if (!confirm(`Bạn có chắc muốn xóa sản phẩm "${code}"?`)) return;

        const product = this.products.find(p => p.code === code);
        if (!product) return;

        App.showLoading(true);

        try {
            await SheetsAPI.deleteRow(CONFIG.SHEETS.PRODUCTS, product.rowIndex - 1);
            App.showToast('Đã xóa sản phẩm');
            await this.loadProducts();
        } catch (error) {
            console.error('Error deleting product:', error);
            App.showToast('Lỗi xóa sản phẩm', 'error');
        } finally {
            App.showLoading(false);
        }
    },

    /**
     * Update product stock
     */
    async updateStock(code, quantity) {
        const product = this.products.find(p => p.code === code);
        if (!product) return;

        const newStock = product.stock + quantity;
        if (newStock < 0) {
            App.showToast('Không đủ hàng trong kho', 'error');
            return false;
        }

        try {
            await SheetsAPI.updateData(
                `${CONFIG.SHEETS.PRODUCTS}!F${product.rowIndex}`,
                [[newStock]]
            );
            product.stock = newStock;
            return true;
        } catch (error) {
            console.error('Error updating stock:', error);
            return false;
        }
    },

    /**
     * Get product by code
     */
    getProduct(code) {
        return this.products.find(p => p.code === code);
    },

    /**
     * Search products
     */
    search(query) {
        if (!query) return this.products;
        query = query.toLowerCase();
        return this.products.filter(p =>
            p.name.toLowerCase().includes(query) ||
            p.code.toLowerCase().includes(query)
        );
    },

    /**
     * Generate product code
     */
    generateCode() {
        const prefix = 'SP';
        const maxNum = this.products.reduce((max, p) => {
            const match = p.code.match(/^SP(\d+)$/);
            return match ? Math.max(max, parseInt(match[1])) : max;
        }, 0);
        return `${prefix}${String(maxNum + 1).padStart(3, '0')}`;
    },

    /**
     * Close modal
     */
    closeModal() {
        document.getElementById('modal-product').classList.remove('active');
        this.editingProductRow = null;
    },

    /**
     * Update product stats
     */
    updateStats() {
        document.getElementById('stat-products').textContent = this.products.length;

        // Low stock warning
        const lowStock = this.products.filter(p => p.stock <= 5 && p.stock > 0);
        const outOfStock = this.products.filter(p => p.stock === 0);

        const lowStockList = document.getElementById('low-stock-list');
        if (lowStock.length === 0 && outOfStock.length === 0) {
            lowStockList.innerHTML = '<p class="empty-state">Tất cả sản phẩm còn đủ hàng</p>';
        } else {
            lowStockList.innerHTML = [...outOfStock, ...lowStock].slice(0, 5).map(p => `
                <div class="list-item ${p.stock === 0 ? 'out-of-stock' : 'low-stock'}">
                    <span class="item-name">${this.escapeHtml(p.name)}</span>
                    <span class="item-value">${p.stock === 0 ? 'Hết hàng' : `Còn ${p.stock}`}</span>
                </div>
            `).join('');
        }
    },

    /**
     * Format currency
     */
    formatCurrency(amount) {
        return new Intl.NumberFormat('vi-VN', {
            style: 'currency',
            currency: 'VND'
        }).format(amount);
    },

    /**
     * Escape HTML
     */
    escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    },

    /**
     * Initialize event listeners
     */
    init() {
        // Add product button
        document.getElementById('btn-add-product').addEventListener('click', () => {
            this.showAddModal();
        });

        // Search
        document.getElementById('search-products').addEventListener('input', (e) => {
            const catFilter = document.getElementById('filter-category');
            this.renderProducts(e.target.value, catFilter ? catFilter.value : '');
        });

        // Category filter
        const catFilterEl = document.getElementById('filter-category');
        if (catFilterEl) {
            catFilterEl.addEventListener('change', (e) => {
                const searchVal = document.getElementById('search-products').value;
                this.renderProducts(searchVal, e.target.value);
            });
        }

        // Form submit
        document.getElementById('form-product').addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveProduct();
        });

        // Calculate profit on price change
        const costInput = document.getElementById('product-cost');
        const priceInput = document.getElementById('product-price');
        const profitDisplay = document.getElementById('product-profit-display');

        const updateProfit = () => {
            const cost = parseFloat(costInput.value) || 0;
            const price = parseFloat(priceInput.value) || 0;
            profitDisplay.value = this.formatCurrency(price - cost);
        };

        costInput.addEventListener('input', updateProfit);
        priceInput.addEventListener('input', updateProfit);
    }
};
