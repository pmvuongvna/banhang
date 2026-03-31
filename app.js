/**
 * QLBH - Main Application
 * Core application logic and initialization
 */

const App = {
    currentTab: 'dashboard',
    user: null,
    isRegisterMode: false,

    /**
     * Initialize the application
     */
    async init() {
        console.log('Initializing QLBH...');

        // Initialize theme
        this.initTheme();

        // Initialize IndexedDB
        try {
            await DB.init();
            console.log('IndexedDB initialized');
        } catch (error) {
            console.warn('IndexedDB not available, will use API-only mode:', error);
        }

        // Initialize SheetsAPI (Worker mode)
        try {
            SheetsAPI.workerUrl = CONFIG.WORKER_URL;
            localStorage.setItem('qlbh_worker_url', CONFIG.WORKER_URL);
            await SheetsAPI.init();
            console.log('SheetsAPI initialized (Worker mode)');
        } catch (error) {
            console.error('Failed to initialize SheetsAPI:', error);
        }

        // Setup event listeners
        this.setupEventListeners();

        // Initialize modules
        Products.init();
        Sales.init();
        Transactions.init();
        Reports.init();
        Debt.init();

        // Auto-login if token is saved
        if (SheetsAPI.hasValidToken()) {
            console.log('Found saved token, auto-connecting...');
            await this.onSignIn();
        }
    },

    /**
     * Handle sign in
     */
    async onSignIn() {
        this.showLoading(true);

        try {
            // Verify connection to Worker API (with 5s timeout)
            const checkPromise = SheetsAPI.checkSpreadsheet();
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Timeout')), 5000)
            );

            let isConnected = false;
            try {
                isConnected = await Promise.race([checkPromise, timeoutPromise]);
            } catch (e) {
                console.warn('Connection check failed:', e);
            }

            if (isConnected) {
                // Get user info
                this.user = await SheetsAPI.getUserInfo();
                if (this.user) {
                    document.getElementById('user-avatar').src = this.user.picture || '';
                }

                // Load data and show app
                const storeName = await SheetsAPI.getStoreName();
                document.getElementById('store-name-display').textContent = storeName;
                await this.loadAllData();
                this.showScreen('app-screen');
            } else {
                // Connection failed, clear stale data and show login
                console.warn('Worker connection failed, showing login screen');
                SheetsAPI.signOut();
                this.showScreen('login-screen');
            }

        } catch (error) {
            console.error('Error during sign in:', error);
            this.showToast('Lỗi kết nối server', 'error');
            this.showScreen('login-screen');
        } finally {
            this.showLoading(false);
        }
    },

    /**
     * Handle setup form submission
     */
    async handleSetup(e) {
        e.preventDefault();

        const storeName = document.getElementById('store-name').value.trim();
        if (!storeName) {
            this.showToast('Vui lòng nhập tên cửa hàng', 'error');
            return;
        }

        this.showLoading(true);

        try {
            await SheetsAPI.createSpreadsheet(storeName);
            this.showToast('Đã tạo bảng dữ liệu thành công!', 'success');

            document.getElementById('store-name-display').textContent = storeName;
            await this.loadAllData();
            this.showScreen('app-screen');
        } catch (error) {
            console.error('Error creating spreadsheet:', error);
            this.showToast('Lỗi tạo bảng dữ liệu', 'error');
        } finally {
            this.showLoading(false);
        }
    },

    /**
     * Handle linking existing sheet
     */
    async handleLinkSheet(e) {
        e.preventDefault();

        const sheetId = document.getElementById('sheet-id').value.trim();
        if (!sheetId) {
            this.showToast('Vui lòng nhập Sheet ID', 'error');
            return;
        }

        this.showLoading(true);

        try {
            const result = await SheetsAPI.linkExistingSheet(sheetId);
            this.showToast('Đã liên kết bảng dữ liệu thành công!', 'success');

            document.getElementById('store-name-display').textContent = result.storeName;
            await this.loadAllData();
            this.showScreen('app-screen');
        } catch (error) {
            console.error('Error linking spreadsheet:', error);
            this.showToast(error.message || 'Lỗi liên kết bảng dữ liệu', 'error');
        } finally {
            this.showLoading(false);
        }
    },

    /**
     * Load all data from sheets (with IndexedDB caching)
     */
    async loadAllData(date = new Date()) {
        const monthSelector = document.getElementById('month-selector');
        // Set selector value if not set (format YYYY-MM)
        const monthStr = date.toISOString().slice(0, 7);
        if (monthSelector.value !== monthStr) {
            monthSelector.value = monthStr;
        }

        // Pull data from Sheets → IndexedDB (batch API)
        if (DB.isReady() && SheetsAPI.spreadsheetId) {
            await SyncEngine.pullAll(date);
            // Push any pending offline changes
            SyncEngine.pushChanges();
            // Initialize sync engine if not yet started
            if (!SyncEngine.syncInterval) {
                SyncEngine.init();
            }
        }

        // Load data into modules (reads from Sheets or local cache)
        await Promise.all([
            Products.loadProducts(), // Products are global, not monthly
            Sales.loadSales(date),
            Transactions.loadTransactions(date),
            Debt.loadDebts()
        ]);
        Reports.updateReports();

        // Load categories from Settings sheet & populate dropdowns
        await this.loadCategories();

        // Load Telegram config
        if (typeof TelegramNotify !== 'undefined') {
            await TelegramNotify.loadConfig();
        }

        // Initialize and update dashboard chart
        DashboardChart.init();
        DashboardChart.updateChart('month');
    },

    /**
     * Dynamic categories list (loaded from Settings sheet)
     */
    categories: [],

    /**
     * Load categories from Settings sheet
     */
    async loadCategories() {
        try {
            const data = await SheetsAPI.readData(`${CONFIG.SHEETS.SETTINGS}!A1:B20`);
            const catRow = data.find(row => row[0] === 'categories');
            if (catRow && catRow[1]) {
                this.categories = catRow[1].split(',').map(c => c.trim()).filter(Boolean);
            } else {
                // First time: use defaults and save to settings
                this.categories = [...CONFIG.CATEGORIES];
                await this.saveCategories();
            }
        } catch (error) {
            console.error('Error loading categories:', error);
            this.categories = [...CONFIG.CATEGORIES];
        }
        this.populateCategoryDropdowns();
    },

    /**
     * Save categories to Settings sheet
     */
    async saveCategories() {
        try {
            const data = await SheetsAPI.readData(`${CONFIG.SHEETS.SETTINGS}!A1:B20`);
            const catRowIndex = data.findIndex(row => row[0] === 'categories');
            const catValue = this.categories.join(',');

            if (catRowIndex >= 0) {
                // Update existing row
                await SheetsAPI.updateData(
                    `${CONFIG.SHEETS.SETTINGS}!B${catRowIndex + 1}`,
                    [[catValue]]
                );
            } else {
                // Append new row
                await SheetsAPI.appendData(CONFIG.SHEETS.SETTINGS, ['categories', catValue]);
            }
        } catch (error) {
            console.error('Error saving categories:', error);
            this.showToast('Lỗi lưu danh mục', 'error');
        }
    },

    /**
     * Populate ALL category dropdowns from dynamic list
     */
    populateCategoryDropdowns() {
        const cats = this.categories;

        // 1. Filter dropdown on products tab
        const filterEl = document.getElementById('filter-category');
        if (filterEl) {
            const currentVal = filterEl.value;
            filterEl.innerHTML = '<option value="all">📁 Tất cả danh mục</option>';
            cats.forEach(cat => {
                filterEl.innerHTML += `<option value="${cat}">${cat}</option>`;
            });
            // Add any categories from products not in list
            const extraCats = [...new Set(Products.products.map(p => p.category || 'Chung'))]
                .filter(c => !cats.includes(c));
            extraCats.forEach(cat => {
                filterEl.innerHTML += `<option value="${cat}">${cat}</option>`;
            });
            filterEl.value = currentVal || 'all';
        }

        // 2. Product modal dropdown
        const modalEl = document.getElementById('product-category');
        if (modalEl) {
            const currentVal = modalEl.value;
            modalEl.innerHTML = '';
            cats.forEach(cat => {
                modalEl.innerHTML += `<option value="${cat}">${cat}</option>`;
            });
            if (currentVal && cats.includes(currentVal)) {
                modalEl.value = currentVal;
            }
        }
    },

    // Alias for backward compatibility
    populateCategoryFilter() {
        this.populateCategoryDropdowns();
    },

    /**
     * Show category management modal
     */
    showCategoryManager() {
        this.renderCategoryList();
        document.getElementById('modal-categories').classList.add('active');
    },

    /**
     * Render category list in management modal
     */
    renderCategoryList() {
        const list = document.getElementById('category-list');
        if (!list) return;

        if (this.categories.length === 0) {
            list.innerHTML = '<p class="empty-state">Chưa có danh mục nào</p>';
            return;
        }

        list.innerHTML = this.categories.map((cat, index) => `
            <div class="category-item" data-index="${index}">
                <input type="text" class="category-name-input" value="${cat}" data-original="${cat}">
                <div class="category-item-actions">
                    <button class="action-btn edit" onclick="App.renameCategoryAt(${index})" title="Lưu tên mới">💾</button>
                    <button class="action-btn delete" onclick="App.deleteCategoryAt(${index})" title="Xóa">🗑️</button>
                </div>
            </div>
        `).join('');
    },

    /**
     * Add a new category
     */
    async addCategory() {
        const input = document.getElementById('new-category-name');
        const name = input.value.trim();

        if (!name) {
            this.showToast('Vui lòng nhập tên danh mục', 'error');
            return;
        }

        if (this.categories.includes(name)) {
            this.showToast('Danh mục đã tồn tại', 'error');
            return;
        }

        this.categories.push(name);
        await this.saveCategories();
        this.populateCategoryDropdowns();
        this.renderCategoryList();
        input.value = '';
        this.showToast(`Đã thêm danh mục "${name}"`);
    },

    /**
     * Rename category at index (from inline edit)
     */
    async renameCategoryAt(index) {
        const item = document.querySelector(`.category-item[data-index="${index}"]`);
        const input = item?.querySelector('.category-name-input');
        if (!input) return;

        const newName = input.value.trim();
        const oldName = input.dataset.original;

        if (!newName) {
            this.showToast('Tên danh mục không được trống', 'error');
            return;
        }

        if (newName === oldName) return; // No change

        if (this.categories.includes(newName)) {
            this.showToast('Tên danh mục đã tồn tại', 'error');
            return;
        }

        // Update category name in list
        this.categories[index] = newName;
        await this.saveCategories();

        // Update all products with the old category name
        const affectedProducts = Products.products.filter(p => p.category === oldName);
        for (const product of affectedProducts) {
            product.category = newName;
            await SheetsAPI.updateData(
                `${CONFIG.SHEETS.PRODUCTS}!H${product.rowIndex}`,
                [[newName]]
            );
        }

        this.populateCategoryDropdowns();
        this.renderCategoryList();
        Products.renderProducts();
        this.showToast(`Đã đổi tên "${oldName}" → "${newName}" (${affectedProducts.length} sản phẩm cập nhật)`);
    },

    /**
     * Delete category at index
     */
    async deleteCategoryAt(index) {
        const catName = this.categories[index];
        const affectedProducts = Products.products.filter(p => p.category === catName);

        const msg = affectedProducts.length > 0
            ? `Xóa danh mục "${catName}"? ${affectedProducts.length} sản phẩm sẽ chuyển về "Chung".`
            : `Xóa danh mục "${catName}"?`;

        if (!confirm(msg)) return;

        // Remove from list
        this.categories.splice(index, 1);
        await this.saveCategories();

        // Move affected products to "Chung"
        for (const product of affectedProducts) {
            product.category = 'Chung';
            await SheetsAPI.updateData(
                `${CONFIG.SHEETS.PRODUCTS}!H${product.rowIndex}`,
                [['Chung']]
            );
        }

        this.populateCategoryDropdowns();
        this.renderCategoryList();
        Products.renderProducts();
        this.showToast(`Đã xóa danh mục "${catName}"`);
    },

    /**
     * Sync data (refresh)
     */
    async syncData() {
        this.showLoading(true);
        try {
            const date = new Date(document.getElementById('month-selector').value + '-01');
            await this.loadAllData(date);
            this.showToast('Đã đồng bộ dữ liệu');
        } catch (error) {
            this.showToast('Lỗi đồng bộ', 'error');
        } finally {
            this.showLoading(false);
        }
    },

    /**
     * Toggle between login and register mode
     */
    toggleAuthMode() {
        this.isRegisterMode = !this.isRegisterMode;
        const storeGroup = document.getElementById('store-name-group');
        const title = document.getElementById('auth-title');
        const btnText = document.getElementById('auth-btn-text');
        const toggleText = document.getElementById('auth-toggle-text');
        const toggleLink = document.getElementById('auth-toggle-link');

        if (this.isRegisterMode) {
            storeGroup.style.display = 'block';
            title.textContent = '📝 Đăng ký';
            btnText.textContent = '📝 Đăng ký';
            toggleText.textContent = 'Đã có tài khoản?';
            toggleLink.textContent = 'Đăng nhập';
        } else {
            storeGroup.style.display = 'none';
            title.textContent = '🔑 Đăng nhập';
            btnText.textContent = '🔑 Đăng nhập';
            toggleText.textContent = 'Chưa có tài khoản?';
            toggleLink.textContent = 'Đăng ký';
        }
    },
    /**
     * Sign out
     */
    signOut() {
        if (confirm('Bạn có chắc muốn đăng xuất?')) {
            SheetsAPI.signOut();
            this.user = null;
            this.showScreen('login-screen');
            this.showToast('Đã đăng xuất');
        }
    },

    /**
     * Switch tabs
     */
    switchTab(tabName) {
        this.currentTab = tabName;

        // Update nav buttons
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabName);
        });

        // Update tab content
        document.querySelectorAll('.tab-content').forEach(tab => {
            tab.classList.toggle('active', tab.id === `tab-${tabName}`);
        });

        // Refresh reports when switching to reports tab
        if (tabName === 'reports') {
            Reports.updateReports();
        }
    },

    /**
     * Show screen
     */
    showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.toggle('active', screen.id === screenId);
        });
    },

    /**
     * Show/hide loading overlay
     */
    showLoading(show) {
        document.getElementById('loading').classList.toggle('show', show);
    },

    /**
     * Show toast notification
     */
    showToast(message, type = 'success') {
        const toast = document.getElementById('toast');
        const toastMessage = document.getElementById('toast-message');

        toastMessage.textContent = message;
        toast.className = `toast ${type} show`;

        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    },

    /**
     * Initialize theme
     */
    initTheme() {
        const savedTheme = localStorage.getItem(CONFIG.STORAGE_KEYS.THEME) || 'light';
        document.documentElement.setAttribute('data-theme', savedTheme);
        this.updateThemeButton(savedTheme);
    },

    /**
     * Toggle theme
     */
    toggleTheme() {
        const current = document.documentElement.getAttribute('data-theme');
        const newTheme = current === 'dark' ? 'light' : 'dark';

        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem(CONFIG.STORAGE_KEYS.THEME, newTheme);
        this.updateThemeButton(newTheme);
    },

    /**
     * Update theme button icon
     */
    updateThemeButton(theme) {
        const btn = document.getElementById('btn-theme');
        btn.textContent = theme === 'dark' ? '☀️' : '🌙';
        btn.title = theme === 'dark' ? 'Chế độ sáng' : 'Chế độ tối';
    },

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Auth form (login/register)
        document.getElementById('auth-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('auth-email').value.trim();
            const password = document.getElementById('auth-password').value;

            if (!email || !password) {
                this.showToast('Vui lòng nhập email và mật khẩu', 'error');
                return;
            }

            this.showLoading(true);
            try {
                let result;
                if (this.isRegisterMode) {
                    const storeName = document.getElementById('auth-store').value.trim() || 'Cửa hàng';
                    result = await SheetsAPI.register(email, password, storeName);
                    this.showToast('Đăng ký thành công!', 'success');
                } else {
                    result = await SheetsAPI.login(email, password);
                    this.showToast('Đăng nhập thành công!', 'success');
                }
                await this.onSignIn();
            } catch (error) {
                console.error('Auth error:', error);
                this.showToast(error.message || 'Lỗi đăng nhập', 'error');
            } finally {
                this.showLoading(false);
            }
        });

        // Logout button
        document.getElementById('btn-logout').addEventListener('click', () => {
            this.signOut();
        });

        // Theme toggle
        document.getElementById('btn-theme').addEventListener('click', () => {
            this.toggleTheme();
        });

        // Month selector
        const monthSelector = document.getElementById('month-selector');
        // Set default to current month
        monthSelector.value = new Date().toISOString().slice(0, 7);

        monthSelector.addEventListener('change', (e) => {
            if (e.target.value) {
                const date = new Date(e.target.value + '-01');
                this.loadAllData(date);
                // Sync per-tab month labels
                Sales.updateMonthLabel(date);
                Transactions.currentViewDate = new Date(date);
                Transactions.updateMonthLabel();
                Reports.updateMonthLabel(date);
            }
        });

        // Migrate button
        document.getElementById('btn-migrate')?.addEventListener('click', () => {
            DataMigration.migrate();
        });

        // Telegram config button
        document.getElementById('btn-telegram').addEventListener('click', () => {
            this.showTelegramConfig();
        });

        // Telegram test button
        document.getElementById('btn-telegram-test')?.addEventListener('click', () => {
            this.testTelegramConfig();
        });

        // Telegram save button
        document.getElementById('btn-telegram-save')?.addEventListener('click', () => {
            this.saveTelegramConfig();
        });

        // Sync button
        document.getElementById('btn-sync').addEventListener('click', () => {
            this.syncData();
        });

        // Navigation
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.switchTab(btn.dataset.tab);
            });
        });

        // Modal close buttons
        document.querySelectorAll('[data-close]').forEach(btn => {
            btn.addEventListener('click', () => {
                const modalId = btn.dataset.close;
                document.getElementById(modalId).classList.remove('active');
            });
        });

        // Close modal on backdrop click
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.classList.remove('active');
                }
            });
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                document.querySelectorAll('.modal.active').forEach(modal => {
                    modal.classList.remove('active');
                });
            }
        });

        // Export button
        document.getElementById('btn-export-report')?.addEventListener('click', () => {
            ExportReport.showExportDialog();
        });

        // Export form submit
        document.getElementById('form-export')?.addEventListener('submit', (e) => {
            e.preventDefault();
            const month = parseInt(document.getElementById('export-month').value);
            const year = parseInt(document.getElementById('export-year').value);
            const format = document.getElementById('export-format').value;

            if (format === 'csv') {
                ExportReport.exportMonthlyCSV(month, year);
            } else {
                ExportReport.exportMonthlyExcel(month, year);
            }

            document.getElementById('modal-export').classList.remove('active');
        });
    },

    /**
     * Show Telegram config modal
     */
    async showTelegramConfig() {
        // Populate the fields with current config
        document.getElementById('telegram-bot-token').value = TelegramNotify.botToken || '';
        document.getElementById('telegram-chat-id').value = TelegramNotify.chatId || '';
        document.getElementById('telegram-status').style.display = 'none';
        document.getElementById('modal-telegram').classList.add('active');
    },

    /**
     * Test Telegram configuration
     */
    async testTelegramConfig() {
        const token = document.getElementById('telegram-bot-token').value.trim();
        const chatId = document.getElementById('telegram-chat-id').value.trim();
        const statusEl = document.getElementById('telegram-status');

        if (!token || !chatId) {
            statusEl.textContent = '⚠️ Vui lòng nhập cả Bot Token và Chat ID';
            statusEl.className = 'telegram-status error';
            statusEl.style.display = 'block';
            return;
        }

        statusEl.textContent = '⏳ Đang gửi tin nhắn test...';
        statusEl.className = 'telegram-status loading';
        statusEl.style.display = 'block';

        const result = await TelegramNotify.testConnection(token, chatId);
        if (result.success) {
            statusEl.textContent = `✅ ${result.message || 'Gửi thành công! Kiểm tra Telegram.'}`;
            statusEl.className = 'telegram-status success';
        } else {
            statusEl.textContent = `❌ Lỗi: ${result.error}`;
            statusEl.className = 'telegram-status error';
        }
    },

    /**
     * Save Telegram configuration
     */
    async saveTelegramConfig() {
        const token = document.getElementById('telegram-bot-token').value.trim();
        const chatId = document.getElementById('telegram-chat-id').value.trim();
        const statusEl = document.getElementById('telegram-status');

        this.showLoading(true);
        try {
            await TelegramNotify.saveConfig(token, chatId);
            statusEl.textContent = token && chatId
                ? '✅ Đã lưu! Thông báo Telegram đã bật.'
                : '✅ Đã lưu! Thông báo Telegram đã tắt.';
            statusEl.className = 'telegram-status success';
            statusEl.style.display = 'block';
            this.showToast('Đã lưu cấu hình Telegram');
        } catch (error) {
            statusEl.textContent = '❌ Lỗi lưu cấu hình';
            statusEl.className = 'telegram-status error';
            statusEl.style.display = 'block';
            this.showToast('Lỗi lưu cấu hình Telegram', 'error');
        } finally {
            this.showLoading(false);
        }
    }
};

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});
