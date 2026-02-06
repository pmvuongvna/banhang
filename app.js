/**
 * QLBH - Main Application
 * Core application logic and initialization
 */

const App = {
    currentTab: 'dashboard',
    user: null,

    /**
     * Initialize the application
     */
    async init() {
        console.log('Initializing QLBH...');

        // Initialize theme
        this.initTheme();

        // Initialize Google API
        try {
            await SheetsAPI.init();
            console.log('Google API initialized');
        } catch (error) {
            console.error('Failed to initialize Google API:', error);
            this.showToast('Lỗi khởi tạo Google API', 'error');
        }

        // Initialize OAuth token client
        SheetsAPI.initTokenClient(async (response) => {
            await this.onSignIn();
        });

        // Setup event listeners
        this.setupEventListeners();

        // Initialize modules
        Products.init();
        Sales.init();
        Transactions.init();
        Reports.init();

        // Check for existing valid token and auto-sign in
        if (SheetsAPI.hasValidToken()) {
            console.log('Found valid saved token, auto-signing in...');
            await this.onSignIn();
        }
    },

    /**
     * Handle sign in
     */
    async onSignIn() {
        this.showLoading(true);

        try {
            // Get user info
            this.user = await SheetsAPI.getUserInfo();
            if (this.user) {
                document.getElementById('user-avatar').src = this.user.picture || '';
            }

            // Check if spreadsheet exists
            const hasSpreadsheet = await SheetsAPI.checkSpreadsheet();

            if (hasSpreadsheet) {
                // Load data and show app
                await this.loadAllData();
                this.showScreen('app-screen');

                const storeName = await SheetsAPI.getStoreName();
                document.getElementById('store-name-display').textContent = storeName;
            } else {
                // Show setup screen
                this.showScreen('setup-screen');
            }

        } catch (error) {
            console.error('Error during sign in:', error);
            this.showToast('Lỗi đăng nhập', 'error');
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
     * Load all data from sheets
     */
    async loadAllData() {
        await Promise.all([
            Products.loadProducts(),
            Sales.loadSales(),
            Transactions.loadTransactions()
        ]);
        Reports.updateReports('month');

        // Initialize and update dashboard chart
        DashboardChart.init();
        DashboardChart.updateChart('month');
    },

    /**
     * Sync data (refresh)
     */
    async syncData() {
        this.showLoading(true);
        try {
            await this.loadAllData();
            this.showToast('Đã đồng bộ dữ liệu');
        } catch (error) {
            this.showToast('Lỗi đồng bộ', 'error');
        } finally {
            this.showLoading(false);
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
            const period = document.getElementById('report-period').value;
            Reports.updateReports(period);
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
        // Login button
        document.getElementById('btn-login').addEventListener('click', () => {
            SheetsAPI.signIn();
        });

        // Setup form
        document.getElementById('setup-form').addEventListener('submit', (e) => {
            this.handleSetup(e);
        });

        // Link existing sheet form
        document.getElementById('link-form').addEventListener('submit', (e) => {
            this.handleLinkSheet(e);
        });

        // Logout button
        document.getElementById('btn-logout').addEventListener('click', () => {
            this.signOut();
        });

        // Theme toggle
        document.getElementById('btn-theme').addEventListener('click', () => {
            this.toggleTheme();
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
    }
};

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});
