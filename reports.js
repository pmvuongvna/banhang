/**
 * QLBH - Reports Module
 * Handles statistics and reporting
 */

const Reports = {
    currentViewDate: new Date(),

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
     * Update reports — shows stats for the currently loaded month data
     */
    async updateReports() {
        const salesData = Sales.sales;

        // Calculate stats from loaded data (already filtered by month via loadSales)
        const revenue = salesData.reduce((sum, s) => sum + s.total, 0);
        const profit = salesData.reduce((sum, s) => sum + s.profit, 0);
        const orderCount = salesData.length;

        // Count items sold
        let itemsSold = 0;
        salesData.forEach(sale => {
            const matches = sale.details.match(/x(\d+)/g);
            if (matches) {
                matches.forEach(m => {
                    itemsSold += parseInt(m.slice(1));
                });
            }
        });

        // Update UI
        document.getElementById('report-revenue').textContent = Products.formatCurrency(revenue);
        document.getElementById('report-profit').textContent = Products.formatCurrency(profit);
        document.getElementById('report-orders').textContent = orderCount;
        document.getElementById('report-items').textContent = itemsSold;

        // Update top products
        this.updateTopProducts(salesData);
    },

    /**
     * Update top selling products
     */
    updateTopProducts(salesData) {
        const productSales = {};

        // Count sales per product
        salesData.forEach(sale => {
            const items = sale.details.split(', ');
            items.forEach(item => {
                // Updated regex to handle price notation like "Product @10000 x2"
                const match = item.match(/(.+?)(?:\s*@\d+)?\s*x(\d+)/);
                if (match) {
                    const name = match[1].trim();
                    const qty = parseInt(match[2]);
                    productSales[name] = (productSales[name] || 0) + qty;
                }
            });
        });

        // Sort and get top 5
        const sorted = Object.entries(productSales)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);

        const container = document.getElementById('top-products-list');

        if (sorted.length === 0) {
            container.innerHTML = '<p class="empty-state">Chưa có dữ liệu</p>';
            return;
        }

        container.innerHTML = sorted.map((item, index) => {
            const [name, sold] = item;
            const product = Products.products.find(p => p.name === name);

            return `
                <div class="top-product-item">
                    <div class="top-product-rank">${index + 1}</div>
                    <div class="top-product-info">
                        <div class="top-product-name">${Products.escapeHtml(name)}</div>
                        <div class="top-product-code">${product ? product.code : ''}</div>
                    </div>
                    <div class="top-product-sold">${sold} đã bán</div>
                </div>
            `;
        }).join('');
    },

    /**
     * Update the month label display
     */
    updateMonthLabel(date) {
        if (date) this.currentViewDate = new Date(date);
        const label = document.getElementById('reports-month-label');
        if (label) {
            const m = this.currentViewDate.getMonth() + 1;
            const y = this.currentViewDate.getFullYear();
            label.textContent = `Tháng ${String(m).padStart(2, '0')}/${y}`;
        }
    },

    /**
     * Navigate to previous month
     */
    async prevMonth() {
        this.currentViewDate.setMonth(this.currentViewDate.getMonth() - 1);
        this.updateMonthLabel();
        // Sync global selector
        const monthStr = this.currentViewDate.toISOString().slice(0, 7);
        document.getElementById('month-selector').value = monthStr;
        App.showLoading(true);
        try {
            await Sales.loadSales(this.currentViewDate);
            await Transactions.loadTransactions(this.currentViewDate);
            Sales.updateMonthLabel(this.currentViewDate);
            Transactions.currentViewDate = new Date(this.currentViewDate);
            Transactions.updateMonthLabel();
            this.updateReports();
        } finally {
            App.showLoading(false);
        }
    },

    /**
     * Navigate to next month
     */
    async nextMonth() {
        this.currentViewDate.setMonth(this.currentViewDate.getMonth() + 1);
        this.updateMonthLabel();
        // Sync global selector
        const monthStr = this.currentViewDate.toISOString().slice(0, 7);
        document.getElementById('month-selector').value = monthStr;
        App.showLoading(true);
        try {
            await Sales.loadSales(this.currentViewDate);
            await Transactions.loadTransactions(this.currentViewDate);
            Sales.updateMonthLabel(this.currentViewDate);
            Transactions.currentViewDate = new Date(this.currentViewDate);
            Transactions.updateMonthLabel();
            this.updateReports();
        } finally {
            App.showLoading(false);
        }
    },

    /**
     * Initialize event listeners
     */
    init() {
        // Initialize month label
        this.updateMonthLabel();
    }
};
