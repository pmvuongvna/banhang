/**
 * QLBH - Configuration
 * Google API Configuration
 * 
 * HƯỚNG DẪN CẤU HÌNH:
 * 1. Truy cập https://console.cloud.google.com/
 * 2. Tạo Project mới hoặc chọn Project có sẵn
 * 3. Bật API: Google Sheets API và Google Drive API
 * 4. Tạo OAuth 2.0 Client ID (Web application)
 * 5. Thêm Authorized JavaScript origins: http://localhost (hoặc domain của bạn)
 * 6. Copy Client ID vào bên dưới
 */

const CONFIG = {
    // Google OAuth Client ID - THAY THẾ BẰNG CLIENT ID CỦA BẠN
    CLIENT_ID: '1034425407114-ubp7o0bo1qocj5853htf5egd7ag7t7k9.apps.googleusercontent.com',

    // API Key (optional, nhưng recommended)
    API_KEY: 'AIzaSyAhWhOW0Tr_kEICnsrkpcT8t39vHQilVI8',

    // Scopes cần thiết
    SCOPES: [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive.file'
    ].join(' '),

    // Discovery docs
    DISCOVERY_DOCS: [
        'https://sheets.googleapis.com/$discovery/rest?version=v4',
        'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'
    ],

    // Sheet names
    SHEETS: {
        PRODUCTS: 'Products',
        SALES: 'Sales',
        TRANSACTIONS: 'Transactions',
        SETTINGS: 'Settings'
    },

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
Object.freeze(CONFIG.STORAGE_KEYS);
