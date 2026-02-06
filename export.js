/**
 * QLBH - Export Module
 * Handles exporting reports to Excel format matching baocao.xlsx template with styling
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
     * Helper: Parse date safely handling multiple formats
     */
    parseDateSafe(str) {
        if (!str) return null;
        try {
            // Remove time part (split by comma or space if time follows)
            // Expect formats: "d/m/y", "d/m/y, time", "d-m-y", "y-m-d"
            let datePart = str.split(',')[0].trim();
            // If space exists, might be "d/m/y HH:mm"
            if (datePart.includes(' ') && datePart.includes(':')) {
                datePart = datePart.split(' ')[0].trim();
            }

            // Split by / or -
            const parts = datePart.split(/[\/\-]/);

            if (parts.length === 3) {
                const p0 = parseInt(parts[0]);
                const p1 = parseInt(parts[1]);
                const p2 = parseInt(parts[2]);

                // Detect YYYY-MM-DD vs DD-MM-YYYY
                if (p0 > 1000) {
                    // YYYY-MM-DD
                    return new Date(p0, p1 - 1, p2);
                } else {
                    // DD-MM-YYYY
                    return new Date(p2, p1 - 1, p0);
                }
            }

            // Fallback to standard Date parse
            const d = new Date(str);
            return isNaN(d.getTime()) ? null : d;
        } catch (e) {
            console.warn('Date parse error:', str, e);
            return null;
        }
    },

    /**
     * Generate monthly report data
     */
    generateMonthlyReport(month, year) {
        console.log('Generating report for month:', month, 'year:', year);

        // Filter sales by month/year
        const sales = Sales.sales.filter(s => {
            const date = this.parseDateSafe(s.datetime);
            if (!date) {
                console.warn('Invalid date:', s.datetime);
                return false;
            }

            const match = date.getMonth() === month - 1 && date.getFullYear() === year;
            if (match) {
                console.log('Found sale:', s.datetime, s.total);
            }
            return match;
        });

        if (sales.length === 0) {
            const msg = `Không tìm thấy dữ liệu cho Tháng ${month}/${year}. Vui lòng kiểm tra lại ngày tháng.`;
            try { App.showToast(msg, 'warning'); } catch (e) { }
            console.warn(msg);
        }

        // Group by date
        const dailyData = {};

        // Add sales revenue
        sales.forEach(s => {
            const date = this.parseDateSafe(s.datetime);
            if (!date) return;

            const dateKey = `${date.getDate()}/${month}/${year}`;

            if (!dailyData[dateKey]) {
                dailyData[dateKey] = {
                    date: dateKey,
                    day: date.getDate(),
                    revenue: 0,
                    description: 'Doanh thu bán hàng'
                };
            }

            dailyData[dateKey].revenue += s.total;
        });

        // Convert to array and sort by day
        const rows = Object.values(dailyData).sort((a, b) => a.day - b.day);
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

        // Define styles
        const borderStyle = {
            top: { style: "thin" },
            bottom: { style: "thin" },
            left: { style: "thin" },
            right: { style: "thin" }
        };

        const fontBase = { name: "Times New Roman", sz: 12 };
        const fontBold = { name: "Times New Roman", sz: 12, bold: true };
        const fontTitle = { name: "Times New Roman", sz: 14, bold: true };

        const styleCenter = {
            font: fontBase,
            alignment: { vertical: "center", horizontal: "center", wrapText: true }
        };

        const styleLeft = {
            font: fontBase,
            alignment: { vertical: "center", horizontal: "left", wrapText: true }
        };

        const styleBoldCenter = {
            font: fontBold,
            alignment: { vertical: "center", horizontal: "center", wrapText: true }
        };

        const styleHeader = {
            font: fontBold,
            alignment: { vertical: "center", horizontal: "center", wrapText: true },
            border: borderStyle
        };

        const styleCellCenter = {
            font: fontBase,
            alignment: { vertical: "center", horizontal: "center", wrapText: true },
            border: borderStyle
        };

        const styleCellLeft = {
            font: fontBase,
            alignment: { vertical: "center", horizontal: "left", wrapText: true },
            border: borderStyle
        };

        const styleCurrency = {
            font: fontBase,
            alignment: { vertical: "center", horizontal: "right" },
            border: borderStyle,
            numFmt: "#,##0"
        };

        const styleCurrencyBold = {
            font: fontBold,
            alignment: { vertical: "center", horizontal: "right" },
            border: borderStyle,
            numFmt: "#,##0"
        };

        // Create workbook
        const wb = XLSX.utils.book_new();
        const ws_data = [];

        // Helper to add row with specific style
        // Note: We'll construct the AOA first, then apply styles to the sheet cells

        // Row 1-6: Header Info
        // Left side
        ws_data.push(['HỘ, CÁ NHÂN KINH DOANH:......', '', '', '', 'Mẫu số S2c-HKD']);
        ws_data.push(['Mã số thuế:........................................', '', '', '', '(Kèm theo Thông tư']);
        ws_data.push(['Địa chỉ:............................................', '', '', '', 'số 152/2025/TT-BTC']);
        ws_data.push(['', '', '', '', 'ngày 31 tháng 12 năm']);
        ws_data.push(['', '', '', '', '2025 của Bộ trưởng']);
        ws_data.push(['', '', '', '', '']); // Empty

        // Row 7-9: Title
        ws_data.push(['', 'SỔ CHI TIẾT DOANH THU, CHI PHÍ', '', '', '']);
        ws_data.push(['', `Địa điểm kinh doanh:................................`, '', '', '']);
        ws_data.push(['', `Kỳ kế khai:................................................`, '', '', '']);

        // Row 10: Empty
        ws_data.push(['', '', '', '', '']);

        // Row 11: "Đơn vị tính:"
        ws_data.push(['', '', '', '', 'Đơn vị tính: Đồng']);

        // Row 12-13: Table Header
        ws_data.push(['', 'Chứng từ', '', 'Diễn giải', 'Số tiền']);
        ws_data.push(['Số hiệu', 'Ngày, tháng', '', '', '']);

        const headerStartRow = 11; // 0-indexed (Row 12)

        // Data Rows
        let rowIndex = 0;
        rows.forEach((row, i) => {
            ws_data.push([
                i + 1,           // Số hiệu
                row.date,        // Ngày tháng
                '',              // Empty (merged)
                row.description, // Diễn giải
                row.revenue      // Số tiền
            ]);
            rowIndex++;
        });

        // Min rows padding
        const minRows = 8;
        for (let i = rowIndex; i < minRows; i++) {
            ws_data.push(['', '', '', '', '']);
            rowIndex++;
        }

        // Totals Row
        const totalRowIdx = ws_data.length;
        ws_data.push(['', 'Tổng cộng', '', '', totalRevenue]);

        // Footer
        ws_data.push(['', '', '', '', '']); // Empty
        const day = new Date().getDate();
        const m = new Date().getMonth() + 1;
        const y = new Date().getFullYear();
        ws_data.push(['', '', '', `Ngày ${day} tháng ${m} năm ${y}`, '']);
        ws_data.push(['', '', '', 'NGƯỜI ĐẠI DIỆN HỘ KINH DOANH/', '']);
        ws_data.push(['', '', '', 'CÁ NHÂN KINH DOANH', '']);
        ws_data.push(['', '', '', '(Ký, họ tên, đóng dấu)', '']);

        // Create worksheet
        const ws = XLSX.utils.aoa_to_sheet(ws_data);

        // Column Widths
        ws['!cols'] = [
            { wch: 10 },  // A: Số hiệu
            { wch: 15 },  // B: Ngày tháng
            { wch: 2 },   // C: Empty (merged)
            { wch: 45 },  // D: Diễn giải
            { wch: 20 }   // E: Số tiền
        ];

        // Merges
        ws['!merges'] = [
            // Header Info Left
            { s: { r: 0, c: 0 }, e: { r: 0, c: 3 } },
            { s: { r: 1, c: 0 }, e: { r: 1, c: 3 } },
            { s: { r: 2, c: 0 }, e: { r: 2, c: 3 } },

            // Title Center
            { s: { r: 6, c: 1 }, e: { r: 6, c: 4 } },
            { s: { r: 7, c: 1 }, e: { r: 7, c: 4 } },
            { s: { r: 8, c: 1 }, e: { r: 8, c: 4 } },

            // Table Header "Chứng từ"
            { s: { r: 11, c: 1 }, e: { r: 11, c: 2 } }, // Row 12, B-C

            // Table Header "Số hiệu" (merge vertical)
            { s: { r: 11, c: 0 }, e: { r: 12, c: 0 } }, // Row 12-13, A

            // Table Header "Diễn giải" (merge vertical)
            { s: { r: 11, c: 3 }, e: { r: 12, c: 3 } }, // Row 12-13, D

            // Table Header "Số tiền" (merge vertical)
            { s: { r: 11, c: 4 }, e: { r: 12, c: 4 } }, // Row 12-13, E

            // Footer Signature
            { s: { r: totalRowIdx + 2, c: 3 }, e: { r: totalRowIdx + 2, c: 4 } },
            { s: { r: totalRowIdx + 3, c: 3 }, e: { r: totalRowIdx + 3, c: 4 } },
            { s: { r: totalRowIdx + 4, c: 3 }, e: { r: totalRowIdx + 4, c: 4 } },
            { s: { r: totalRowIdx + 5, c: 3 }, e: { r: totalRowIdx + 5, c: 4 } }
        ];

        // Apply Styles
        for (let r = 0; r < ws_data.length; r++) {
            for (let c = 0; c < 5; c++) {
                const cellRef = XLSX.utils.encode_cell({ r, c });
                if (!ws[cellRef]) ws[cellRef] = { v: '', t: 's' }; // Ensure cell exists

                const cell = ws[cellRef];

                // Header Info (Rows 1-5)
                if (r < 5) {
                    if (c === 4) { // Right side
                        cell.s = { font: { ...fontBase, italic: true }, alignment: { horizontal: "center" } };
                    } else if (c === 0) { // Left side
                        cell.s = { font: fontBold, alignment: { horizontal: "left" } };
                    }
                }

                // Title (Rows 7-9)
                if (r >= 6 && r <= 8) {
                    if (c === 1) cell.s = { font: fontTitle, alignment: { horizontal: "center" } };
                }

                // Table Header (Rows 12-13)
                if (r >= 11 && r <= 12) {
                    cell.s = styleHeader;
                }

                // Data Rows
                if (r >= 13 && r < totalRowIdx) {
                    if (c === 0) cell.s = styleCellCenter; // Số hiệu
                    if (c === 1) cell.s = styleCellCenter; // Ngày tháng
                    if (c === 2) cell.s = styleCellCenter; // Empty (merged into B actually, but just in case)
                    if (c === 3) cell.s = styleCellLeft;   // Diễn giải
                    if (c === 4) cell.s = styleCurrency;   // Số tiền

                    // Specific fix for merged column B-C in data rows? 
                    // No, data "Ngày, tháng" is single column B in template structure 
                    // but header "Chứng từ" spans B-C.
                    // Actually, "Chứng từ" header spans B-C headers: "Ngày, tháng" is under B?
                    // Let's re-read template image logic.
                    // Row 12: "Chứng từ" (B-C), "Diễn giải" (D), "Số tiền" (E)
                    // Row 13: "Số hiệu" (A), "Ngày, tháng" (B), "Số hiệu" (C)? No C is empty in header row 13.
                    // Wait, usually "Chứng từ" -> B: Số hiệu, C: Ngày tháng?
                    // Ah, template image shows: 
                    // A: Số hiệu (spans 12-13?)
                    // B-C: Chứng từ (Row 12). Under it: B: Số hiệu? No A is Số hiệu.
                    // Wait, let's look at image again (simulated):
                    // Layout:
                    // Col A: Số hiệu
                    // Col B: Ngày, tháng (Under "Chứng từ")
                    // Col C: (Empty? Or "Chứng từ" spans B-C?)
                    // If "Chứng từ" spans B-C, then Row 13 should have headers for B and C.
                    // But in my code I put "Ngày, tháng" in B. What is C?
                    // Maybe "Chứng từ" is just Col B? But header merge suggests span.
                    // Let's assume Col B is "Ngày, tháng" and C is irrelevant or merged.
                    // I'll stick to simple table: A, B, C(empty/merged), D, E.
                    // I will merge B-C for data rows to keep it consistent? No, just keep B.
                }

                // Total Row
                if (r === totalRowIdx) {
                    cell.s = styleBoldCenter;
                    cell.s.border = borderStyle;
                    if (c === 1) cell.v = "Tổng cộng";
                    if (c === 4) cell.s = styleCurrencyBold;
                }

                // Footer
                if (r > totalRowIdx) {
                    if (c === 3) cell.s = styleCenter;
                    if (r === totalRowIdx + 2) cell.s = { ...styleCenter, font: { ...fontBase, italic: true } }; // Ngày...
                    if (r === totalRowIdx + 3) cell.s = { ...styleCenter, font: fontBold }; // NGƯỜI ĐẠI DIỆN...
                }
            }
        }

        // Add worksheet to workbook
        XLSX.utils.book_append_sheet(wb, ws, `Tháng ${month}-${year}`);

        // Write and download
        try {
            const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
            const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

            const filename = `Bao_cao_thang_${month}_${year}.xlsx`;
            this.downloadFile(blob, filename, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        } catch (error) {
            console.error('Export error:', error);
            App.showToast('Lỗi xuất file: ' + error.message, 'error');
        }
    },

    /**
     * Download file helper
     */
    downloadFile(blob, filename, mimeType) {
        if (!(blob instanceof Blob)) {
            blob = new Blob([blob], { type: mimeType });
        }
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
