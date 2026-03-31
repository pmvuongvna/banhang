/**
 * QLBH - Import Module
 * Imports data from Google Sheets (via Apps Script) into D1 (via Worker API)
 */

const SheetImport = {
    scriptUrl: null,
    progress: { total: 0, done: 0, errors: [] },

    /**
     * Show the import modal
     */
    showModal() {
        const existing = document.getElementById('import-modal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'import-modal';
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal import-modal-content">
                <div class="modal-header">
                    <h3>📥 Import dữ liệu từ Google Sheet</h3>
                    <button class="btn-close" onclick="SheetImport.closeModal()">✕</button>
                </div>
                <div class="modal-body">
                    <div id="import-step-1">
                        <p>Nhập URL Apps Script của Sheet cũ để lấy dữ liệu.</p>
                        <div class="form-group">
                            <label>URL Apps Script</label>
                            <input type="url" id="import-script-url" 
                                placeholder="https://script.google.com/macros/s/.../exec"
                                value="${localStorage.getItem('qlbh_script_url') || ''}">
                        </div>
                        <div class="import-options">
                            <label class="checkbox-label">
                                <input type="checkbox" id="import-products" checked> Sản phẩm
                            </label>
                            <label class="checkbox-label">
                                <input type="checkbox" id="import-sales" checked> Đơn hàng
                            </label>
                            <label class="checkbox-label">
                                <input type="checkbox" id="import-transactions" checked> Thu chi
                            </label>
                            <label class="checkbox-label">
                                <input type="checkbox" id="import-debts" checked> Công nợ
                            </label>
                        </div>
                        <button class="btn btn-primary btn-full" onclick="SheetImport.startImport()">
                            📥 Bắt đầu Import
                        </button>
                    </div>
                    <div id="import-step-2" style="display:none;">
                        <div class="import-progress">
                            <div class="progress-bar">
                                <div class="progress-fill" id="import-progress-fill" style="width:0%"></div>
                            </div>
                            <p id="import-status">Đang kết nối...</p>
                            <div id="import-log" class="import-log"></div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    },

    closeModal() {
        const modal = document.getElementById('import-modal');
        if (modal) modal.remove();
    },

    /**
     * Start the import process
     */
    async startImport() {
        const url = document.getElementById('import-script-url').value.trim();
        if (!url) {
            App.showToast('Vui lòng nhập URL Apps Script', 'error');
            return;
        }

        this.scriptUrl = url;
        localStorage.setItem('qlbh_script_url', url);

        // Switch to progress view
        document.getElementById('import-step-1').style.display = 'none';
        document.getElementById('import-step-2').style.display = 'block';

        this.progress = { total: 0, done: 0, errors: [] };

        try {
            // Test connection first
            this.log('🔗 Đang kết nối Apps Script...');
            const ping = await this.fetchSheet('ping');
            if (!ping || ping.status !== 'ok') {
                throw new Error('Không thể kết nối Apps Script. Kiểm tra lại URL.');
            }
            this.log('✅ Kết nối thành công!');

            const importProducts = document.getElementById('import-products').checked;
            const importSales = document.getElementById('import-sales').checked;
            const importTransactions = document.getElementById('import-transactions').checked;
            const importDebts = document.getElementById('import-debts').checked;

            // Import Products
            if (importProducts) {
                await this.importProducts();
            }

            // Import Sales (current + last 3 months)
            if (importSales) {
                await this.importSales();
            }

            // Import Transactions
            if (importTransactions) {
                await this.importTransactions();
            }

            // Import Debts
            if (importDebts) {
                await this.importDebts();
            }

            // Done!
            this.updateProgress(100);
            this.log(`\n🎉 Import hoàn tất! ${this.progress.done} records imported.`);
            if (this.progress.errors.length > 0) {
                this.log(`⚠️ ${this.progress.errors.length} lỗi xảy ra.`);
            }

            // Reload data
            App.showToast('Import thành công! Đang tải lại dữ liệu...', 'success');
            setTimeout(() => {
                App.loadAllData();
                this.closeModal();
            }, 2000);

        } catch (error) {
            this.log(`❌ Lỗi: ${error.message}`);
            App.showToast('Lỗi import: ' + error.message, 'error');
        }
    },

    /**
     * Import Products
     */
    async importProducts() {
        this.log('\n📦 Đang import Sản phẩm...');
        this.setStatus('Đang đọc sản phẩm từ Sheet...');

        const result = await this.fetchSheet('read', { range: 'Products!A2:H' });
        const rows = result?.data || [];

        if (rows.length === 0) {
            this.log('   Không có sản phẩm nào.');
            return;
        }

        this.log(`   Tìm thấy ${rows.length} sản phẩm`);
        this.setStatus(`Đang import ${rows.length} sản phẩm...`);

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            try {
                await SheetsAPI._fetch('/api/products', 'POST', {
                    code: row[0] || '',
                    name: row[1] || '',
                    cost: parseFloat(row[2]) || 0,
                    price: parseFloat(row[3]) || 0,
                    stock: parseInt(row[5]) || 0,
                    created_at: row[6] || new Date().toISOString(),
                    category: row[7] || 'Chung'
                });
                this.progress.done++;
            } catch (e) {
                this.progress.errors.push(`Product ${row[1]}: ${e.message}`);
            }
            this.updateProgress(((i + 1) / rows.length) * 25); // 0-25%
        }

        this.log(`   ✅ Import ${rows.length} sản phẩm`);
    },

    /**
     * Import Sales (check multiple month sheets)
     */
    async importSales() {
        this.log('\n🛒 Đang import Đơn hàng...');
        this.setStatus('Đang tìm sheet đơn hàng...');

        // Get all sheet names to find Sales_MM_YYYY sheets
        const sheetIds = await this.fetchSheet('getSheetIds');
        const salesSheets = Object.keys(sheetIds?.sheetIds || {}).filter(
            name => name.startsWith('Sales')
        );

        if (salesSheets.length === 0) {
            this.log('   Không tìm thấy sheet đơn hàng.');
            return;
        }

        this.log(`   Tìm thấy ${salesSheets.length} sheet: ${salesSheets.join(', ')}`);
        let totalSales = 0;

        for (const sheetName of salesSheets) {
            this.setStatus(`Đang đọc ${sheetName}...`);
            const result = await this.fetchSheet('read', { range: `${sheetName}!A2:F` });
            const rows = result?.data || [];

            if (rows.length === 0) continue;

            this.log(`   📋 ${sheetName}: ${rows.length} đơn`);

            for (const row of rows) {
                try {
                    await SheetsAPI._fetch('/api/sales', 'POST', {
                        sale_id: row[0] || '',
                        datetime: row[1] || '',
                        details: row[2] || '',
                        total: parseFloat(row[3]) || 0,
                        profit: parseFloat(row[4]) || 0,
                        note: row[5] || ''
                    });
                    this.progress.done++;
                    totalSales++;
                } catch (e) {
                    this.progress.errors.push(`Sale ${row[0]}: ${e.message}`);
                }
            }
            this.updateProgress(25 + (salesSheets.indexOf(sheetName) + 1) / salesSheets.length * 25); // 25-50%
        }

        this.log(`   ✅ Import ${totalSales} đơn hàng`);
    },

    /**
     * Import Transactions
     */
    async importTransactions() {
        this.log('\n💰 Đang import Thu chi...');
        this.setStatus('Đang tìm sheet thu chi...');

        const sheetIds = await this.fetchSheet('getSheetIds');
        const txSheets = Object.keys(sheetIds?.sheetIds || {}).filter(
            name => name.startsWith('Transactions')
        );

        if (txSheets.length === 0) {
            this.log('   Không tìm thấy sheet thu chi.');
            return;
        }

        this.log(`   Tìm thấy ${txSheets.length} sheet: ${txSheets.join(', ')}`);
        let totalTx = 0;

        for (const sheetName of txSheets) {
            this.setStatus(`Đang đọc ${sheetName}...`);
            const result = await this.fetchSheet('read', { range: `${sheetName}!A2:F` });
            const rows = result?.data || [];

            if (rows.length === 0) continue;

            this.log(`   📋 ${sheetName}: ${rows.length} giao dịch`);

            for (const row of rows) {
                try {
                    // Map Vietnamese type to English
                    let type = (row[2] || '').toLowerCase();
                    if (type === 'thu' || type === 'income') type = 'income';
                    else type = 'expense';

                    await SheetsAPI._fetch('/api/transactions', 'POST', {
                        tx_id: row[0] || '',
                        date: row[1] || '',
                        type: type,
                        description: row[3] || '',
                        amount: parseFloat(row[4]) || 0,
                        note: row[5] || ''
                    });
                    this.progress.done++;
                    totalTx++;
                } catch (e) {
                    this.progress.errors.push(`TX ${row[0]}: ${e.message}`);
                }
            }
            this.updateProgress(50 + (txSheets.indexOf(sheetName) + 1) / txSheets.length * 25); // 50-75%
        }

        this.log(`   ✅ Import ${totalTx} giao dịch`);
    },

    /**
     * Import Debts
     */
    async importDebts() {
        this.log('\n📋 Đang import Công nợ...');
        this.setStatus('Đang đọc công nợ...');

        const result = await this.fetchSheet('read', { range: 'Debts!A2:J' });
        const rows = result?.data || [];

        if (rows.length === 0) {
            this.log('   Không có công nợ nào.');
            return;
        }

        this.log(`   Tìm thấy ${rows.length} công nợ`);

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            try {
                await SheetsAPI._fetch('/api/debts', 'POST', {
                    debt_id: row[0] || '',
                    sale_id: row[1] || '',
                    customer_name: row[2] || '',
                    phone: row[3] || '',
                    total: parseFloat(row[4]) || 0,
                    paid: parseFloat(row[5]) || 0,
                    remaining: parseFloat(row[6]) || 0,
                    created_at: row[7] || '',
                    updated_at: row[8] || '',
                    status: row[9] || 'Còn nợ'
                });
                this.progress.done++;
            } catch (e) {
                this.progress.errors.push(`Debt ${row[0]}: ${e.message}`);
            }
            this.updateProgress(75 + ((i + 1) / rows.length) * 25); // 75-100%
        }

        this.log(`   ✅ Import ${rows.length} công nợ`);
    },

    // ==========================================
    // Helpers
    // ==========================================

    /**
     * Fetch data from Apps Script
     */
    async fetchSheet(action, params = {}) {
        const url = new URL(this.scriptUrl);
        url.searchParams.set('action', action);
        for (const [key, value] of Object.entries(params)) {
            url.searchParams.set(key, value);
        }

        const response = await fetch(url.toString(), {
            method: 'GET',
            redirect: 'follow'
        });

        return await response.json();
    },

    log(message) {
        const logDiv = document.getElementById('import-log');
        if (logDiv) {
            logDiv.innerHTML += message + '<br>';
            logDiv.scrollTop = logDiv.scrollHeight;
        }
        console.log('[Import]', message);
    },

    setStatus(text) {
        const el = document.getElementById('import-status');
        if (el) el.textContent = text;
    },

    updateProgress(percent) {
        const fill = document.getElementById('import-progress-fill');
        if (fill) fill.style.width = Math.min(100, percent) + '%';
    }
};
