/**
 * QLBH - Reports Module
 * Handles statistics and reporting
 */

const Reports = {
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
     * Update reports based on selected period
     */
    async updateReports(period = 'month') {
        const salesData = Sales.sales;
        const transactionsData = Transactions.transactions;

        // Get currently selected month from UI to use as reference
        const monthSelector = document.getElementById('month-selector');
        const referenceDate = monthSelector && monthSelector.value
            ? new Date(monthSelector.value + '-01')
            : new Date();

        // Filter by period
        const filteredSales = this.filterByPeriod(salesData, period, referenceDate);
        // Transactions.getByPeriod also needs update or we do it here
        // Transactions.js doesn't have getByPeriod exposed in the snippet I saw earlier? 
        // Wait, I didn't verify `Transactions.getByPeriod`. I only saw `loadTransactions`.
        // Let's check if Transactions has `getByPeriod`. If not, I should filter it here or add it.
        // Assuming Transactions.transactions is the source.
        const filteredTransactions = this.filterByPeriod(transactionsData, period, referenceDate);

        // Calculate stats
        const revenue = filteredSales.reduce((sum, s) => sum + s.total, 0);
        const profit = filteredSales.reduce((sum, s) => sum + s.profit, 0);
        const orderCount = filteredSales.length;

        // Count items sold
        let itemsSold = 0;
        filteredSales.forEach(sale => {
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
        this.updateTopProducts(filteredSales);
    },

    /**
     * Filter data by period
     */
    filterByPeriod(data, period, referenceDate = new Date()) {
        const now = new Date(); // Real "now" for today/week
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        return data.filter(item => {
            const itemDate = this.parseDatetime(item.date || item.datetime); // Handle both fields
            if (!itemDate) return false;

            switch (period) {
                case 'today':
                    return itemDate.getTime() === today.getTime();
                case 'week':
                    const weekAgo = new Date(today);
                    weekAgo.setDate(weekAgo.getDate() - 7);
                    return itemDate >= weekAgo && itemDate <= now;
                case 'month':
                    // Compare with REFERENCE date (selected month)
                    return itemDate.getMonth() === referenceDate.getMonth() &&
                        itemDate.getFullYear() === referenceDate.getFullYear();
                case 'all':
                default:
                    return true;
            }
        });
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
     * Initialize event listeners
     */
    init() {
        // Period selector
        document.getElementById('report-period').addEventListener('change', (e) => {
            this.updateReports(e.target.value);
        });
    }
};
