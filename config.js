/**
 * QLBH - Configuration
 * App Configuration (Apps Script mode - no Google API keys needed)
 */

const CONFIG = {
    // Sheet names
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

// Freeze config to prevent accidental modification
Object.freeze(CONFIG);
Object.freeze(CONFIG.SHEETS);
Object.freeze(CONFIG.CATEGORIES);
Object.freeze(CONFIG.STORAGE_KEYS);
