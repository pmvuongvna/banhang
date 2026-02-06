/**
 * QLBH - Export Module
 * Handles exporting reports to Excel format matching baocao.xlsx template
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
        console.log('Generating report for month:', month, 'year:', year);
        console.log('Total sales:', Sales.sales.length);

        const sales = Sales.sales.filter(s => {
            const date = Sales.parseVietnameseDateTime(s.datetime);
            const match = date.getMonth() === month - 1 && date.getFullYear() === year;
            if (match) {
                console.log('Matched sale:', s.id, s.datetime, s.total);
            }
            return match;
        });

        console.log('Filtered sales:', sales.length);

        // Group by date
        const dailyData = {};

        // Add sales revenue
        sales.forEach(s => {
            const date = Sales.parseVietnameseDateTime(s.datetime);
            const dateKey = `${date.getDate()}/${month}/${year}`;

            if (!dailyData[dateKey]) {
                dailyData[dateKey] = {
                    date: dateKey,
                    day: date.getDate(),
                    revenue: 0,
                    description: `Doanh thu ngày ${date.getDate()}/${month}/${year}`
                };
            }

            dailyData[dateKey].revenue += s.total;
        });

        // Convert to array and sort by day
        const rows = Object.values(dailyData).sort((a, b) => a.day - b.day);
        const totalRevenue = rows.reduce((sum, r) => sum + r.revenue, 0);

        console.log('Total revenue:', totalRevenue);
        console.log('Rows:', rows.length);

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

        // Data rows
        rows.forEach((row, index) => {
            csv += `${index + 1},`;
            csv += `${row.date},`;
            csv += `"${row.description}",`;
            csv += `${row.revenue}\n`;
        });

        // Totals row
        csv += `\n`;
        csv += `,"Tổng cộng","",${totalRevenue}\n`;

        return csv;
    },

    /**
     * Export to Excel format with formatting matching baocao.xlsx template
     */
    exportMonthlyExcel(month, year) {
        const data = this.generateMonthlyReport(month, year);
        const { rows, totalRevenue } = data;

        if (!window.XLSX) {
            App.showToast('Lỗi: Thư viện XLSX chưa load', 'error');
            return;
        }

        // Create workbook
        const wb = XLSX.utils.book_new();
        const ws_data = [];

        // Row 1-3: Header
        ws_data.push(['HỘ, CÁ NHÂN KINH DOANH:......', '', '', '', 'Mẫu số S2c-HKD']);
        ws_data.push(['Mã số thuế:........................................', '', '', '', '(Kèm theo Thông tư']);
        ws_data.push(['Địa chỉ:............................................', '', '', '', 'số 152/2025/TT-BTC']);
        ws_data.push(['', '', '', '', 'ngày 31 tháng 12 năm']);
        ws_data.push(['', '', '', '', '2025 của Bộ trưởng']);
        ws_data.push([]); // Row 6: Empty

        // Row 7-9: Title
        ws_data.push(['', 'SỔ CHI TIẾT DOANH THU, CHI PHÍ']);
        ws_data.push(['', `Địa điểm kinh doanh:................................`]);
        ws_data.push(['', `Kỳ kế khai:................................................`]);
        ws_data.push([]); // Row 10: Empty

        // Row 11: "Đơn vị tính:"
        ws_data.push(['', '', '', '', 'Đơn vị tính:']);

        // Row 12-13: Table header
        ws_data.push(['', 'Chứng từ', '', 'Diễn giải', 'Số tiền']);
        ws_data.push(['Số hiệu', 'Ngày, tháng', '', '', '']);

        // Data rows
        rows.forEach((row, index) => {
            ws_data.push([
                index + 1,           // Số hiệu
                row.date,            // Ngày tháng
                '',                  // Empty
                row.description,     // Diễn giải
                row.revenue          // Số tiền
            ]);
        });

        // Add empty rows if needed (minimum 5 data rows)
        while (ws_data.length < 18) {
            ws_data.push(['', '', '', '', '']);
        }

        // Total row
        ws_data.push(['', 'Tổng cộng', '', '', totalRevenue]);
        ws_data.push([]); // Empty

        // Footer
        ws_data.push(['', '', 'Ngày ... tháng ... năm ...']);
        ws_data.push(['', '', 'NGƯỜI ĐẠI DIỆN HỘ KINH DOANH/']);
        ws_data.push(['', '', 'CÁ NHÂN KINH DOANH']);
        ws_data.push(['', '', '(Ký, họ tên, đóng dấu)']);

        // Create worksheet
        const ws = XLSX.utils.aoa_to_sheet(ws_data);

        // Set column widths
        ws['!cols'] = [
            { wch: 10 },  // A: Số hiệu
            { wch: 15 },  // B: Ngày tháng / Chứng từ
            { wch: 5 },   // C: Empty
            { wch: 40 },  // D: Diễn giải
            { wch: 15 }   // E: Số tiền
        ];

        // Merge cells
        const merges = [];

        // Header (rows 1-5)
        merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: 3 } }); // Row 1 left
        merges.push({ s: { r: 1, c: 0 }, e: { r: 1, c: 3 } }); // Row 2 left
        merges.push({ s: { r: 2, c: 0 }, e: { r: 2, c: 3 } }); // Row 3 left

        // Title (rows 7-9)
        merges.push({ s: { r: 6, c: 1 }, e: { r: 6, c: 4 } }); // Title
        merges.push({ s: { r: 7, c: 1 }, e: { r: 7, c: 4 } }); // Địa điểm
        merges.push({ s: { r: 8, c: 1 }, e: { r: 8, c: 4 } }); // Kỳ kế khai

        // Table header (row 12)
        merges.push({ s: { r: 11, c: 1 }, e: { r: 11, c: 2 } }); // "Chứng từ"

        ws['!merges'] = merges;

        // Format numbers
        const startDataRow = 13;
        const endDataRow = startDataRow + rows.length;
        for (let r = startDataRow; r <= endDataRow; r++) {
            const cell = ws[XLSX.utils.encode_cell({ r, c: 4 })];
            if (cell && typeof cell.v === 'number') {
                cell.z = '#,##0';
            }
        }

        // Add worksheet to workbook
        XLSX.utils.book_append_sheet(wb, ws, `Tháng ${month}-${year}`);

        // Write and download
        try {
            const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
            const blob = new Blob([wbout], {
                type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            });

            const filename = `Bao_cao_thang_${month}_${year}.xlsx`;
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            App.showToast(`Đã xuất báo cáo: ${filename}`, 'success');
        } catch (error) {
            console.error('Export error:', error);
            App.showToast('Lỗi xuất file: ' + error.message, 'error');
        }
    },

    /**
     * Download file helper
     */
    downloadFile(content, filename, mimeType) {
        const blob = new Blob([content], { type: mimeType });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
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
