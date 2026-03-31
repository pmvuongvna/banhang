/**
 * QLBH - Import Module
 * Imports data from Google Sheets into D1 via Worker API
 * User only needs to provide Google Sheet ID (the sheet must be shared as "Anyone with the link")
 */

const SheetImport = {

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
                        <p style="margin-bottom:12px;">Nhập <strong>ID</strong> hoặc <strong>URL</strong> của Google Sheet cũ.</p>
                        <div class="form-group">
                            <label>Google Sheet ID hoặc URL</label>
                            <input type="text" id="import-sheet-id" 
                                placeholder="VD: 1BxiMVs0XRA5nFMdKvBdBZjgm...">
                        </div>
                        <details class="setup-help" style="margin-bottom:16px;">
                            <summary>📖 Cách lấy Sheet ID & chia sẻ</summary>
                            <ol>
                                <li>Mở Google Sheet cũ trên Google Drive</li>
                                <li>Bấm <strong>Share → General access → Anyone with the link → Viewer</strong></li>
                                <li>Copy URL từ thanh địa chỉ, VD:<br><code>https://docs.google.com/spreadsheets/d/<strong>SHEET_ID</strong>/edit</code></li>
                                <li>Dán URL hoặc SHEET_ID vào ô trên</li>
                            </ol>
                        </details>
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
     * Extract Sheet ID from URL or raw ID
     */
    extractSheetId(input) {
        input = input.trim();
        // If it's a full URL, extract the ID
        const match = input.match(/\/d\/([a-zA-Z0-9_-]+)/);
        if (match) return match[1];
        // Otherwise assume it's the raw ID
        return input;
    },

    /**
     * Start the import process
     */
    async startImport() {
        const rawInput = document.getElementById('import-sheet-id').value.trim();
        if (!rawInput) {
            App.showToast('Vui lòng nhập Sheet ID hoặc URL', 'error');
            return;
        }

        const sheetId = this.extractSheetId(rawInput);

        // Switch to progress view
        document.getElementById('import-step-1').style.display = 'none';
        document.getElementById('import-step-2').style.display = 'block';

        this.log('🔗 Đang gửi yêu cầu import...');
        this.log(`📋 Sheet ID: ${sheetId}`);
        this.setStatus('Đang đọc dữ liệu từ Google Sheet...');
        this.updateProgress(10);

        try {
            // Call Worker API to do the import server-side
            const result = await SheetsAPI._fetch('/api/import', 'POST', { sheetId });

            this.updateProgress(100);

            if (result.success) {
                this.log('');
                this.log('✅ ' + result.message);
                if (result.sheets) {
                    this.log(`📋 Sheets tìm thấy: ${result.sheets.join(', ')}`);
                }
                if (result.imported) {
                    const r = result.imported;
                    if (r.products) this.log(`   📦 ${r.products} sản phẩm`);
                    if (r.sales) this.log(`   🛒 ${r.sales} đơn hàng`);
                    if (r.transactions) this.log(`   💰 ${r.transactions} giao dịch thu/chi`);
                    if (r.debts) this.log(`   📋 ${r.debts} công nợ`);
                    if (r.errors && r.errors.length > 0) {
                        this.log(`   ⚠️ ${r.errors.length} lỗi`);
                    }
                }
                this.setStatus('Import hoàn tất!');

                App.showToast('Import thành công! Đang tải lại...', 'success');
                setTimeout(() => {
                    App.loadAllData();
                    this.closeModal();
                }, 2000);
            } else {
                throw new Error(result.error || 'Import thất bại');
            }

        } catch (error) {
            this.log('');
            this.log('❌ Lỗi: ' + error.message);
            this.setStatus('Import thất bại');
            App.showToast('Lỗi: ' + error.message, 'error');
        }
    },

    // ==========================================
    // UI Helpers
    // ==========================================

    log(message) {
        const logDiv = document.getElementById('import-log');
        if (logDiv) {
            logDiv.innerHTML += message + '<br>';
            logDiv.scrollTop = logDiv.scrollHeight;
        }
    },

    setStatus(text) {
        const el = document.getElementById('import-status');
        if (el) el.textContent = text;
    },

    updateProgress(percent) {
        const fill = document.getElementById('import-progress-fill');
        if (fill) fill.style.width = Math.min(100, percent) + '%';
    },

    // ==========================================
    // Sync Settings (Apps Script URL)
    // ==========================================

    async showSyncSettings() {
        const existing = document.getElementById('import-modal');
        if (existing) existing.remove();

        // Load current script_url from server
        let currentUrl = '';
        try {
            const res = await SheetsAPI._fetch('/api/me');
            currentUrl = res.data?.script_url || '';
        } catch (e) {}

        const modal = document.createElement('div');
        modal.id = 'import-modal';
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal">
                <div class="modal-header">
                    <h3>⚙️ Đồng bộ dữ liệu → Google Sheet</h3>
                    <button class="btn-close" onclick="SheetImport.closeModal()">✕</button>
                </div>
                <div class="modal-body">
                    <p style="margin-bottom:12px;">Nhập URL Apps Script để app tự động ghi dữ liệu vào Sheet mỗi khi có thao tác mới.</p>
                    <div class="form-group">
                        <label>URL Apps Script (Web app)</label>
                        <input type="url" id="sync-script-url" 
                            placeholder="https://script.google.com/macros/s/.../exec"
                            value="${currentUrl}">
                    </div>
                    <div style="display:flex; gap:8px;">
                        <button class="btn btn-primary" style="flex:1;" onclick="SheetImport.saveSyncSettings()">
                            💾 Lưu
                        </button>
                        <button class="btn btn-secondary" style="flex:1;" onclick="SheetImport.closeModal()">
                            Hủy
                        </button>
                    </div>
                    ${currentUrl ? '<p style="margin-top:12px; font-size:0.85rem; color:var(--accent-success);">✅ Đang đồng bộ tự động</p>' : '<p style="margin-top:12px; font-size:0.85rem; color:var(--text-secondary);">⚠️ Chưa cấu hình — dữ liệu chỉ lưu trong D1</p>'}
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    },

    async saveSyncSettings() {
        const url = document.getElementById('sync-script-url').value.trim();

        try {
            await SheetsAPI._fetch('/api/me', 'PUT', { script_url: url });
            App.showToast(url ? 'Đã lưu! Dữ liệu sẽ tự đồng bộ vào Sheet.' : 'Đã tắt đồng bộ Sheet.', 'success');
            this.closeModal();
        } catch (error) {
            App.showToast('Lỗi lưu: ' + error.message, 'error');
        }
    }
};
