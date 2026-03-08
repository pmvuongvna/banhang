/**
 * QLBH - Chart Module
 * Handles dashboard charts using Chart.js
 */

const DashboardChart = {
    chart: null,
    profitChart: null,
    monthCompChart: null,
    weekdayChart: null,

    /**
     * Initialize the chart
     */
    init() {
        const ctx = document.getElementById('income-expense-chart');
        if (!ctx) return;

        // Chart period selector
        document.getElementById('chart-period')?.addEventListener('change', (e) => {
            this.updateChart(e.target.value);
        });
    },

    /**
     * Update all charts
     */
    updateChart(period = 'month') {
        this.updateIncomeExpenseChart(period);
        this.updateProfitRatioChart();
        this.updateMonthComparisonChart();
        this.updateWeekdayRevenueChart();
    },

    /**
     * Update income/expense chart (existing)
     */
    updateIncomeExpenseChart(period = 'month') {
        const ctx = document.getElementById('income-expense-chart');
        if (!ctx) return;

        const data = this.getChartData(period);

        // Destroy existing chart if any
        if (this.chart) {
            this.chart.destroy();
        }

        // Get theme colors
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        const textColor = isDark ? '#e2e8f0' : '#334155';
        const gridColor = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';

        this.chart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: data.labels,
                datasets: [
                    {
                        label: 'Thu',
                        data: data.income,
                        backgroundColor: 'rgba(34, 197, 94, 0.8)',
                        borderColor: 'rgba(34, 197, 94, 1)',
                        borderWidth: 1,
                        borderRadius: 4
                    },
                    {
                        label: 'Chi',
                        data: data.expense,
                        backgroundColor: 'rgba(239, 68, 68, 0.8)',
                        borderColor: 'rgba(239, 68, 68, 1)',
                        borderWidth: 1,
                        borderRadius: 4
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top',
                        labels: {
                            color: textColor,
                            usePointStyle: true,
                            padding: 15
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: function (context) {
                                return context.dataset.label + ': ' +
                                    new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(context.raw);
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: { color: textColor },
                        grid: { color: gridColor }
                    },
                    y: {
                        ticks: {
                            color: textColor,
                            callback: function (value) {
                                return (value / 1000000).toFixed(1) + 'M';
                            }
                        },
                        grid: { color: gridColor },
                        beginAtZero: true
                    }
                }
            }
        });
    },

    /**
     * Profit ratio donut chart
     */
    updateProfitRatioChart() {
        const ctx = document.getElementById('profit-ratio-chart');
        if (!ctx) return;

        if (this.profitChart) {
            this.profitChart.destroy();
        }

        const salesData = Sales.sales;
        const totalRevenue = salesData.reduce((sum, s) => sum + s.total, 0);
        const totalProfit = salesData.reduce((sum, s) => sum + s.profit, 0);
        const totalCost = totalRevenue - totalProfit;

        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        const textColor = isDark ? '#e2e8f0' : '#334155';

        this.profitChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Lợi nhuận', 'Giá vốn'],
                datasets: [{
                    data: [totalProfit, totalCost],
                    backgroundColor: [
                        'rgba(34, 197, 94, 0.8)',
                        'rgba(100, 116, 139, 0.5)'
                    ],
                    borderColor: [
                        'rgba(34, 197, 94, 1)',
                        'rgba(100, 116, 139, 0.7)'
                    ],
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            color: textColor,
                            usePointStyle: true,
                            padding: 12
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: function (context) {
                                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                const pct = total > 0 ? ((context.raw / total) * 100).toFixed(1) : 0;
                                const formatted = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(context.raw);
                                return `${context.label}: ${formatted} (${pct}%)`;
                            }
                        }
                    }
                },
                cutout: '60%'
            }
        });
    },

    /**
     * Month-over-month comparison chart
     */
    async updateMonthComparisonChart() {
        const ctx = document.getElementById('month-comparison-chart');
        if (!ctx) return;

        if (this.monthCompChart) {
            this.monthCompChart.destroy();
        }

        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        const textColor = isDark ? '#e2e8f0' : '#334155';
        const gridColor = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';

        // Current month data
        const currentSales = Sales.sales;
        const currentRevenue = currentSales.reduce((sum, s) => sum + s.total, 0);
        const currentProfit = currentSales.reduce((sum, s) => sum + s.profit, 0);
        const currentOrders = currentSales.length;

        // Load previous month data
        const monthSelector = document.getElementById('month-selector');
        const currentDate = monthSelector && monthSelector.value
            ? new Date(monthSelector.value + '-01')
            : new Date();
        const prevDate = new Date(currentDate);
        prevDate.setMonth(prevDate.getMonth() - 1);

        let prevRevenue = 0, prevProfit = 0, prevOrders = 0;
        try {
            const prevSheetName = SheetsAPI.getMonthSheetName(CONFIG.SHEETS.SALES, prevDate);
            const sheetIds = await SheetsAPI.getSheetIds();
            if (sheetIds[prevSheetName]) {
                const prevData = await SheetsAPI.readData(`${prevSheetName}!A2:F`);
                prevRevenue = prevData.reduce((sum, row) => sum + (parseFloat(row[3]) || 0), 0);
                prevProfit = prevData.reduce((sum, row) => sum + (parseFloat(row[4]) || 0), 0);
                prevOrders = prevData.length;
            }
        } catch (e) {
            console.log('No previous month data available');
        }

        const curMonth = currentDate.getMonth() + 1;
        const prevMonth = prevDate.getMonth() + 1;

        this.monthCompChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['Doanh thu', 'Lợi nhuận'],
                datasets: [
                    {
                        label: `Tháng ${prevMonth}`,
                        data: [prevRevenue, prevProfit],
                        backgroundColor: 'rgba(100, 116, 139, 0.6)',
                        borderColor: 'rgba(100, 116, 139, 1)',
                        borderWidth: 1,
                        borderRadius: 4
                    },
                    {
                        label: `Tháng ${curMonth}`,
                        data: [currentRevenue, currentProfit],
                        backgroundColor: 'rgba(99, 102, 241, 0.8)',
                        borderColor: 'rgba(99, 102, 241, 1)',
                        borderWidth: 1,
                        borderRadius: 4
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { color: textColor, usePointStyle: true, padding: 12 }
                    },
                    tooltip: {
                        callbacks: {
                            label: function (context) {
                                return context.dataset.label + ': ' +
                                    new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(context.raw);
                            }
                        }
                    }
                },
                scales: {
                    x: { ticks: { color: textColor }, grid: { display: false } },
                    y: {
                        ticks: {
                            color: textColor,
                            callback: (v) => (v / 1000000).toFixed(1) + 'M'
                        },
                        grid: { color: gridColor },
                        beginAtZero: true
                    }
                }
            }
        });
    },

    /**
     * Revenue by weekday chart
     */
    updateWeekdayRevenueChart() {
        const ctx = document.getElementById('weekday-revenue-chart');
        if (!ctx) return;

        if (this.weekdayChart) {
            this.weekdayChart.destroy();
        }

        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        const textColor = isDark ? '#e2e8f0' : '#334155';
        const gridColor = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';

        // Calculate revenue by weekday
        const weekdayTotals = [0, 0, 0, 0, 0, 0, 0]; // Mon-Sun
        const weekdayNames = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

        Sales.sales.forEach(sale => {
            // Parse Vietnamese datetime format: "d/m/yyyy, HH:mm:ss" or "d/m/yyyy HH:mm:ss"
            try {
                const dtStr = sale.datetime.replace(',', '').trim();
                const parts = dtStr.split(/[\s\/]+/);
                if (parts.length >= 3) {
                    const day = parseInt(parts[0]);
                    const month = parseInt(parts[1]) - 1;
                    const year = parseInt(parts[2]);
                    const parsed = new Date(year, month, day);
                    if (!isNaN(parsed.getTime())) {
                        let dayIndex = parsed.getDay() - 1; // js: 0=Sun, we want 0=Mon
                        if (dayIndex < 0) dayIndex = 6; // Sunday -> 6
                        weekdayTotals[dayIndex] += sale.total;
                    }
                }
            } catch (e) {
                // Skip unparseable dates
            }
        });

        // Generate gradient colors
        const maxVal = Math.max(...weekdayTotals, 1);
        const bgColors = weekdayTotals.map(v => {
            const intensity = Math.max(0.3, v / maxVal);
            return `rgba(99, 102, 241, ${intensity})`;
        });

        this.weekdayChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: weekdayNames,
                datasets: [{
                    label: 'Doanh thu',
                    data: weekdayTotals,
                    backgroundColor: bgColors,
                    borderColor: 'rgba(99, 102, 241, 1)',
                    borderWidth: 1,
                    borderRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function (context) {
                                return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(context.raw);
                            }
                        }
                    }
                },
                scales: {
                    x: { ticks: { color: textColor }, grid: { display: false } },
                    y: {
                        ticks: {
                            color: textColor,
                            callback: (v) => (v / 1000000).toFixed(1) + 'M'
                        },
                        grid: { color: gridColor },
                        beginAtZero: true
                    }
                }
            }
        });
    },

    /**
     * Get chart data based on period (for income/expense chart)
     */
    getChartData(period) {
        const transactions = Transactions.transactions;
        const labels = [];
        const incomeData = [];
        const expenseData = [];

        // Get currently selected month from UI to use as reference
        const monthSelector = document.getElementById('month-selector');
        const referenceDate = monthSelector && monthSelector.value
            ? new Date(monthSelector.value + '-01')
            : new Date();

        if (period === 'week') {
            // Last 7 days (Real Time)
            const now = new Date();
            for (let i = 6; i >= 0; i--) {
                const date = new Date();
                date.setDate(now.getDate() - i);
                const dateStr = date.toLocaleDateString('vi-VN');
                const dayName = date.toLocaleDateString('vi-VN', { weekday: 'short' });

                labels.push(dayName + ' ' + date.getDate());

                const dayTransactions = transactions.filter(t => t.date === dateStr);
                incomeData.push(dayTransactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0));
                expenseData.push(dayTransactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0));
            }
        } else if (period === 'month') {
            // Show all days of selected month
            const year = referenceDate.getFullYear();
            const month = referenceDate.getMonth();
            const daysInMonth = new Date(year, month + 1, 0).getDate();

            for (let day = 1; day <= daysInMonth; day++) {
                const date = new Date(year, month, day);
                const dateStr = date.toLocaleDateString('vi-VN');

                labels.push(day);

                const dayTransactions = transactions.filter(t => t.date === dateStr);
                incomeData.push(dayTransactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0));
                expenseData.push(dayTransactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0));
            }
        }

        return {
            labels,
            income: incomeData,
            expense: expenseData
        };
    }
};
