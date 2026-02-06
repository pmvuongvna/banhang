/**
 * QLBH - Export Module
 * Handles exporting reports to CSV/Excel format
 */

const ExportReport = {
    /**
     * Export monthly report to CSV
     */
    exportMonthlyCSV(month, year) {
        const data = this.generateMonthlyReport(month, year);
        const csv = this.convertToCSV(data);
        this.downloadCSV(csv, `Bao_cao_thang_${month}_${year}.csv`);
    },

    /**
     * Generate monthly report data
     */
    generateMonthlyReport(month, year) {
        const sales = Sales.sales.filter(s => {
            const date = Sales.parseVietnameseDateTime(s.datetime);
            return date.getMonth() === month - 1 && date.getFullYear() === year;
        });

        const transactions = Transactions.transactions.filter(t => {
            const parts = t.date.split('/');
            if (parts.length !== 3) return false;
            const tMonth = parseInt(parts[1]);
            const tYear = parseInt(parts[2]);
            return tMonth === month && tYear === year;
        });

        // Group by date
        const dailyData = {};
        const daysInMonth = new Date(year, month, 0).getDate();

        // Initialize all days
        for (let day = 1; day <= daysInMonth; day++) {
            const dateKey = `${day}/${month}/${year}`;
            dailyData[dateKey] = {
                date: dateKey,
                revenue: 0,
                expense: 0,
                profit: 0,
                description: `Doanh thu ngày ${day}/${month}/${year}`
            };
        }

        // Add sales revenue
        sales.forEach(s => {
            const date = Sales.parseVietnameseDateTime(s.datetime);
            const dateKey = `${date.getDate()}/${month}/${year}`;
            if (dailyData[dateKey]) {
                dailyData[dateKey].revenue += s.total;
                dailyData[dateKey].profit += s.profit;
            }
        });

        // Add expenses
        transactions.filter(t => t.type === 'expense').forEach(t => {
            if (dailyData[t.date]) {
                dailyData[t.date].expense += t.amount;
                dailyData[t.date].profit -= t.amount;
            }
        });

        // Convert to array and calculate totals
        const rows = Object.values(dailyData);
        const totals = {
            date: 'Tổng cộng',
            revenue: rows.reduce((sum, r) => sum + r.revenue, 0),
            expense: rows.reduce((sum, r) => sum + r.expense, 0),
            profit: rows.reduce((sum, r) => sum + r.profit, 0),
            description: ''
        };

        return { rows, totals, month, year };
    },

    /**
     * Convert report data to CSV format
     */
    convertToCSV(data) {
        const { rows, totals, month, year } = data;

        // Header
        let csv = '\uFEFF'; // UTF-8 BOM for Excel compatibility
        csv += `SỔ CHI TIẾT DOANH THU CHI PHÍ\n`;
        csv += `Tháng ${month} năm ${year}\n`;
        csv += `\n`;

        // Column headers
        csv += `Số hiệu,Ngày tháng,Diễn giải,Doanh thu,Chi phí,Lợi nhuận\n`;

        // Data rows
        rows.forEach((row, index) => {
            // Only include rows with activity
            if (row.revenue > 0 || row.expense > 0) {
                csv += `${index + 1},`;
                csv += `${row.date},`;
                csv += `"${row.description}",`;
                csv += `${row.revenue},`;
                csv += `${row.expense},`;
                csv += `${row.profit}\n`;
            }
        });

        // Totals row
        csv += `\n`;
        csv += `,"${totals.date}","",`;
        csv += `${totals.revenue},`;
        csv += `${totals.expense},`;
        csv += `${totals.profit}\n`;

        return csv;
    },

    /**
     * Download CSV file
     */
    downloadCSV(csvContent, filename) {
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');

        if (navigator.msSaveBlob) { // IE 10+
            navigator.msSaveBlob(blob, filename);
        } else {
            link.href = URL.createObjectURL(blob);
            link.download = filename;
            link.style.display = 'none';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }

        App.showToast(`Đã xuất báo cáo: ${filename}`, 'success');
    },

    /**
     * Export to Excel format (using CSV with .xls extension)
     */
    exportMonthlyExcel(month, year) {
        const data = this.generateMonthlyReport(month, year);
        const csv = this.convertToCSV(data);

        // Use .xls extension for Excel compatibility
        const blob = new Blob([csv], { type: 'application/vnd.ms-excel;charset=utf-8;' });
        const link = document.createElement('a');
        const filename = `Bao_cao_thang_${month}_${year}.xls`;

        if (navigator.msSaveBlob) {
            navigator.msSaveBlob(blob, filename);
        } else {
            link.href = URL.createObjectURL(blob);
            link.download = filename;
            link.style.display = 'none';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }

        App.showToast(`Đã xuất báo cáo Excel: ${filename}`, 'success');
    },

    /**
     * Show export dialog
     */
    showExportDialog() {
        const now = new Date();
        const currentMonth = now.getMonth() + 1;
        const currentYear = now.getFullYear();

        document.getElementById('export-month').value = currentMonth;
        document.getElementById('export-year').value = currentYear;
        document.getElementById('modal-export').classList.add('active');
    }
};
