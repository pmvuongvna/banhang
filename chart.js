/**
 * QLBH - Chart Module
 * Handles dashboard charts using Chart.js
 */

const DashboardChart = {
    chart: null,

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
     * Update chart with data
     */
    updateChart(period = 'month') {
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
     * Get chart data based on period
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

                labels.push(dayName + ' ' + date.getDate()); // e.g. "Mon 12"

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
                // Be careful constructing date for matching Transactions dateStr
                // Transactions store date as locale date string (d/m/yyyy usually or dd/mm/yyyy depending on locale)
                // App logic stores it as `vi-VN` locale string implicitly via `Date.toLocaleDateString('vi-VN')`
                // Let's match how transactions are stored.

                const date = new Date(year, month, day);
                const dateStr = date.toLocaleDateString('vi-VN'); // Should match storage format

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
