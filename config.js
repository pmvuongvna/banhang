/**
 * QLBH - Configuration
 */

const CONFIG = {
    // Worker API URL — set after deployment
    WORKER_URL: 'https://qlbh-worker.pmvuong-na.workers.dev',

    // Sheet names (kept for compatibility with data mapping)
    SHEETS: {
        PRODUCTS: 'Products',
        SALES: 'Sales',
        TRANSACTIONS: 'Transactions',
        DEBTS: 'Debts',
        SETTINGS: 'Settings'
    },

    // Default product categories
    CATEGORIES: ['Chung', 'Thực phẩm', 'Đồ uống', 'Điện tử', 'Gia dụng', 'Khác'],

    // Local storage keys
    STORAGE_KEYS: {
        SPREADSHEET_ID: 'qlbh_spreadsheet_id',
        STORE_NAME: 'qlbh_store_name',
        THEME: 'qlbh_theme'
    }
};

// Freeze config
Object.freeze(CONFIG);
Object.freeze(CONFIG.SHEETS);
Object.freeze(CONFIG.CATEGORIES);
Object.freeze(CONFIG.STORAGE_KEYS);
