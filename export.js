/**
 * QLBH - Export Module
 * Handles exporting reports to Excel format with formatting using SheetJS
 */

const ExportReport = {
    /**
     * Export monthly report to CSV (simple format)
     */
    exportMonthlyCSV(month, year) {
        const data = this.generateMonthlyReport(month, year);
        const csv = this.convertToCSV(data);
        this.downloadFile(csv, `Bao_cao_thang_${month}_${year}.csv`, 'text/csv;charset=utf-8;');
    },

    /**
     * Generate monthly report data
     */
    generateMonthlyReport(month, year) {
        const sales = Sales.sales.filter(s => {
            const date = Sales.parseVietnameseDateTime(s.datetime);
            return date.getMonth() === month - 1 && date.getFullYear() === year;
        });

        // Group by date
        const dailyData = {};
        const daysInMonth = new Date(year, month, 0).getDate();

        // Initialize all days
        for (let day = 1; day <= daysInMonth; day++) {
            const dateKey = `${day}/${month}/${year}`;
            dailyData[dateKey] = {
                date: dateKey,
                day: day,
                revenue: 0,
                description: `Doanh thu ngày ${day}/${month}/${year}`
            };
        }

        // Add sales revenue
        sales.forEach(s => {
            const date = Sales.parseVietnameseDateTime(s.datetime);
            const dateKey = `${date.getDate()}/${month}/${year}`;
            if (dailyData[dateKey]) {
                dailyData[dateKey].revenue += s.total;
            }
        });

        // Convert to array and calculate total revenue
        const rows = Object.values(dailyData);
        const totalRevenue = rows.reduce((sum, r) => sum + r.revenue, 0);

        return { rows, totalRevenue, month, year };
    },

    /**
     * Convert report data to CSV format
     */
    convertToCSV(data) {
        const { rows, totalRevenue, month, year } = data;

        // Header with UTF-8 BOM for Excel compatibility
        let csv = '\uFEFF';
        csv += `SỔ CHI TIẾT DOANH THU CHI PHÍ\n`;
        csv += `Tháng ${month} năm ${year}\n`;
        csv += `\n`;

        // Column headers
        csv += `Số hiệu,Ngày tháng,Diễn giải,Số tiền\n`;

        // Data rows - only include days with revenue
        let rowNumber = 1;
        rows.forEach((row) => {
            if (row.revenue > 0) {
                csv += `${rowNumber},`;
                csv += `${row.date},`;
                csv += `"${row.description}",`;
                csv += `${row.revenue}\n`;
                rowNumber++;
            }
        });

        // Totals row
        csv += `\n`;
        csv += `,"Tổng cộng","",${totalRevenue}\n`;

        return csv;
    },

    /**
     * Export to Excel format with formatting using SheetJS
     */
    exportMonthlyExcel(month, year) {
        const data = this.generateMonthlyReport(month, year);
        const { rows, totalRevenue } = data;

        // Create workbook
        const wb = XLSX.utils.book_new();

        // Prepare data array
        const excelData = [];

        // Title row
        excelData.push([`SỔ CHI TIẾT DOANH THU CHI PHÍ`]);
        excelData.push([`Tháng ${month} năm ${year}`]);
        excelData.push([]); // Empty row

        // Header row
        excelData.push(['Số hiệu', 'Ngày tháng', 'Diễn giải', 'Số tiền']);

        // Data rows - only include days with revenue
        let rowNumber = 1;
        rows.forEach((row) => {
            if (row.revenue > 0) {
                excelData.push([
                    rowNumber,
                    row.date,
                    row.description,
                    row.revenue
                ]);
                rowNumber++;
            }
        });

        // Empty row before total
        excelData.push([]);

        // Total row
        excelData.push(['', 'Tổng cộng', '', totalRevenue]);

        // Create worksheet
        const ws = XLSX.utils.aoa_to_sheet(excelData);

        // Set column widths
        ws['!cols'] = [
            { wch: 10 },  // Số hiệu
            { wch: 15 },  // Ngày tháng
            { wch: 40 },  // Diễn giải
            { wch: 15 }   // Số tiền
        ];

        // Merge cells for title
        ws['!merges'] = [
            { s: { r: 0, c: 0 }, e: { r: 0, c: 3 } }, // Title row
            { s: { r: 1, c: 0 }, e: { r: 1, c: 3 } }  // Subtitle row
        ];

        // Apply styles (note: styles require xlsx-style or pro version)
        // For basic version, we'll set number format for currency column
        const range = XLSX.utils.decode_range(ws['!ref']);

        // Format currency cells (column D, starting from row 5)
        for (let row = 4; row <= range.e.r; row++) {
            const cellAddress = XLSX.utils.encode_cell({ r: row, c: 3 });
            if (ws[cellAddress] && typeof ws[cellAddress].v === 'number') {
                ws[cellAddress].z = '#,##0'; // Number format
            }
        }

        // Add worksheet to workbook
        XLSX.utils.book_append_sheet(wb, ws, `Tháng ${month}`);

        // Generate Excel file
        const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

        // Download
        const filename = `Bao_cao_thang_${month}_${year}.xlsx`;
        const link = document.createElement('a');

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
     * Download file helper
     */
    downloadFile(content, filename, mimeType) {
        const blob = new Blob([content], { type: mimeType });
        const link = document.createElement('a');

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

        App.showToast(`Đã xuất báo cáo: ${filename}`, 'success');
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
