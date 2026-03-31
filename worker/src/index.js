/**
 * QLBH Worker - Main API
 * Cloudflare Worker with D1 database
 */
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { hashPassword, createJWT, authMiddleware } from './auth.js';

const app = new Hono();
const JWT_SECRET = 'qlbh-jwt-secret-2026'; // In production, use env var

// CORS for frontend
app.use('*', cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
}));

// ==========================================
// Auth Routes
// ==========================================

app.post('/auth/register', async (c) => {
    const { email, password, storeName } = await c.req.json();

    if (!email || !password) {
        return c.json({ error: 'Email và mật khẩu là bắt buộc' }, 400);
    }
    if (password.length < 6) {
        return c.json({ error: 'Mật khẩu phải có ít nhất 6 ký tự' }, 400);
    }

    const db = c.env.DB;

    // Check if email exists
    const existing = await db.prepare('SELECT id FROM users WHERE email = ?').bind(email.toLowerCase()).first();
    if (existing) {
        return c.json({ error: 'Email đã được đăng ký' }, 409);
    }

    const passwordHash = await hashPassword(password);
    const result = await db.prepare(
        'INSERT INTO users (email, password_hash, store_name) VALUES (?, ?, ?)'
    ).bind(email.toLowerCase(), passwordHash, storeName || 'Cửa hàng').run();

    const userId = result.meta.last_row_id;

    // Create default settings
    await db.prepare(
        'INSERT INTO settings (user_id, key, value) VALUES (?, ?, ?)'
    ).bind(userId, 'store_name', storeName || 'Cửa hàng').run();

    // Create JWT
    const token = await createJWT({ userId, email: email.toLowerCase() }, JWT_SECRET);

    return c.json({ token, userId, storeName: storeName || 'Cửa hàng' });
});

app.post('/auth/login', async (c) => {
    const { email, password } = await c.req.json();

    if (!email || !password) {
        return c.json({ error: 'Email và mật khẩu là bắt buộc' }, 400);
    }

    const db = c.env.DB;
    const user = await db.prepare(
        'SELECT id, email, password_hash, store_name FROM users WHERE email = ?'
    ).bind(email.toLowerCase()).first();

    if (!user) {
        return c.json({ error: 'Email hoặc mật khẩu không đúng' }, 401);
    }

    const passwordHash = await hashPassword(password);
    if (passwordHash !== user.password_hash) {
        return c.json({ error: 'Email hoặc mật khẩu không đúng' }, 401);
    }

    const token = await createJWT({ userId: user.id, email: user.email }, JWT_SECRET);

    return c.json({ token, userId: user.id, storeName: user.store_name });
});

// ==========================================
// Protected Routes (require auth)
// ==========================================
const api = new Hono();
api.use('*', authMiddleware(JWT_SECRET));

// --- Products ---

api.get('/products', async (c) => {
    const userId = c.get('userId');
    const db = c.env.DB;
    const { results } = await db.prepare(
        'SELECT * FROM products WHERE user_id = ? ORDER BY name'
    ).bind(userId).all();
    return c.json({ data: results });
});

api.post('/products', async (c) => {
    const userId = c.get('userId');
    const db = c.env.DB;
    const { code, name, cost, price, stock, category, created_at } = await c.req.json();

    const profit = (price || 0) - (cost || 0);
    const result = await db.prepare(
        'INSERT INTO products (user_id, code, name, cost, price, profit, stock, category, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(userId, code, name, cost || 0, price || 0, profit, stock || 0, category || 'Chung', created_at || new Date().toISOString()).run();

    return c.json({ success: true, id: result.meta.last_row_id });
});

api.put('/products/:id', async (c) => {
    const userId = c.get('userId');
    const db = c.env.DB;
    const id = c.req.param('id');
    const updates = await c.req.json();

    // Build dynamic UPDATE query
    const fields = [];
    const values = [];
    for (const [key, value] of Object.entries(updates)) {
        if (['code', 'name', 'cost', 'price', 'profit', 'stock', 'category'].includes(key)) {
            fields.push(`${key} = ?`);
            values.push(value);
        }
    }

    if (fields.length === 0) return c.json({ error: 'No fields to update' }, 400);

    // Auto-calculate profit if cost or price changed
    if (updates.cost !== undefined || updates.price !== undefined) {
        const current = await db.prepare('SELECT cost, price FROM products WHERE id = ? AND user_id = ?').bind(id, userId).first();
        if (current) {
            const newCost = updates.cost !== undefined ? updates.cost : current.cost;
            const newPrice = updates.price !== undefined ? updates.price : current.price;
            fields.push('profit = ?');
            values.push(newPrice - newCost);
        }
    }

    values.push(id, userId);
    await db.prepare(
        `UPDATE products SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`
    ).bind(...values).run();

    return c.json({ success: true });
});

api.delete('/products/:id', async (c) => {
    const userId = c.get('userId');
    const db = c.env.DB;
    const id = c.req.param('id');
    await db.prepare('DELETE FROM products WHERE id = ? AND user_id = ?').bind(id, userId).run();
    return c.json({ success: true });
});

// --- Sales ---

api.get('/sales', async (c) => {
    const userId = c.get('userId');
    const db = c.env.DB;
    const month = c.req.query('month');
    const year = c.req.query('year');

    let query = 'SELECT * FROM sales WHERE user_id = ?';
    const params = [userId];

    if (month && year) {
        // Filter by month pattern in datetime (dd/mm/yyyy or yyyy-mm-dd, etc.)
        const monthPadded = month.padStart(2, '0');
        query += ` AND (datetime LIKE ? OR datetime LIKE ?)`;
        params.push(`%/${monthPadded}/${year}%`); // dd/mm/yyyy format
        params.push(`${year}-${monthPadded}-%`);  // ISO format
    }

    query += ' ORDER BY id DESC';
    const { results } = await db.prepare(query).bind(...params).all();
    return c.json({ data: results });
});

api.post('/sales', async (c) => {
    const userId = c.get('userId');
    const db = c.env.DB;
    const { sale_id, datetime, details, total, profit, note } = await c.req.json();

    await db.prepare(
        'INSERT INTO sales (user_id, sale_id, datetime, details, total, profit, note) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(userId, sale_id, datetime, details, total || 0, profit || 0, note || '').run();

    return c.json({ success: true });
});

api.delete('/sales/:id', async (c) => {
    const userId = c.get('userId');
    const db = c.env.DB;
    const id = c.req.param('id');
    await db.prepare('DELETE FROM sales WHERE id = ? AND user_id = ?').bind(id, userId).run();
    return c.json({ success: true });
});

// --- Transactions ---

api.get('/transactions', async (c) => {
    const userId = c.get('userId');
    const db = c.env.DB;
    const month = c.req.query('month');
    const year = c.req.query('year');

    let query = 'SELECT * FROM transactions WHERE user_id = ?';
    const params = [userId];

    if (month && year) {
        const monthPadded = month.padStart(2, '0');
        query += ` AND (date LIKE ? OR date LIKE ?)`;
        params.push(`%/${monthPadded}/${year}%`);
        params.push(`${year}-${monthPadded}-%`);
    }

    query += ' ORDER BY id DESC';
    const { results } = await db.prepare(query).bind(...params).all();
    return c.json({ data: results });
});

api.post('/transactions', async (c) => {
    const userId = c.get('userId');
    const db = c.env.DB;
    const { tx_id, date, type, description, amount, note } = await c.req.json();

    await db.prepare(
        'INSERT INTO transactions (user_id, tx_id, date, type, description, amount, note) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(userId, tx_id, date, type, description || '', amount || 0, note || '').run();

    return c.json({ success: true });
});

api.put('/transactions/:id', async (c) => {
    const userId = c.get('userId');
    const db = c.env.DB;
    const id = c.req.param('id');
    const { type, description, amount, note } = await c.req.json();

    await db.prepare(
        'UPDATE transactions SET type = ?, description = ?, amount = ?, note = ? WHERE id = ? AND user_id = ?'
    ).bind(type, description, amount, note || '', id, userId).run();

    return c.json({ success: true });
});

api.delete('/transactions/:id', async (c) => {
    const userId = c.get('userId');
    const db = c.env.DB;
    const id = c.req.param('id');
    await db.prepare('DELETE FROM transactions WHERE id = ? AND user_id = ?').bind(id, userId).run();
    return c.json({ success: true });
});

// --- Debts ---

api.get('/debts', async (c) => {
    const userId = c.get('userId');
    const db = c.env.DB;
    const { results } = await db.prepare(
        'SELECT * FROM debts WHERE user_id = ? ORDER BY id DESC'
    ).bind(userId).all();
    return c.json({ data: results });
});

api.post('/debts', async (c) => {
    const userId = c.get('userId');
    const db = c.env.DB;
    const { debt_id, sale_id, customer_name, phone, total, paid, remaining, status, created_at, updated_at } = await c.req.json();

    await db.prepare(
        'INSERT INTO debts (user_id, debt_id, sale_id, customer_name, phone, total, paid, remaining, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(userId, debt_id, sale_id || '', customer_name || '', phone || '', total || 0, paid || 0, remaining || 0, status || 'Còn nợ', created_at || '', updated_at || '').run();

    return c.json({ success: true });
});

api.put('/debts/:id/pay', async (c) => {
    const userId = c.get('userId');
    const db = c.env.DB;
    const id = c.req.param('id');
    const { amount } = await c.req.json();

    const debt = await db.prepare('SELECT * FROM debts WHERE id = ? AND user_id = ?').bind(id, userId).first();
    if (!debt) return c.json({ error: 'Không tìm thấy công nợ' }, 404);

    const newPaid = debt.paid + amount;
    const newRemaining = Math.max(0, debt.total - newPaid);
    const newStatus = newRemaining <= 0 ? 'Đã trả' : 'Còn nợ';
    const now = new Date().toLocaleString('vi-VN');

    await db.prepare(
        'UPDATE debts SET paid = ?, remaining = ?, status = ?, updated_at = ? WHERE id = ? AND user_id = ?'
    ).bind(newPaid, newRemaining, newStatus, now, id, userId).run();

    return c.json({ success: true, paid: newPaid, remaining: newRemaining, status: newStatus });
});

api.delete('/debts/:id', async (c) => {
    const userId = c.get('userId');
    const db = c.env.DB;
    const id = c.req.param('id');
    await db.prepare('DELETE FROM debts WHERE id = ? AND user_id = ?').bind(id, userId).run();
    return c.json({ success: true });
});

// --- Settings ---

api.get('/settings', async (c) => {
    const userId = c.get('userId');
    const db = c.env.DB;
    const { results } = await db.prepare('SELECT key, value FROM settings WHERE user_id = ?').bind(userId).all();
    return c.json({ data: results });
});

api.put('/settings', async (c) => {
    const userId = c.get('userId');
    const db = c.env.DB;
    const { key, value } = await c.req.json();

    await db.prepare(
        'INSERT INTO settings (user_id, key, value) VALUES (?, ?, ?) ON CONFLICT(user_id, key) DO UPDATE SET value = ?'
    ).bind(userId, key, value, value).run();

    return c.json({ success: true });
});

// --- User profile ---

api.get('/me', async (c) => {
    const userId = c.get('userId');
    const db = c.env.DB;
    const user = await db.prepare('SELECT id, email, store_name FROM users WHERE id = ?').bind(userId).first();
    return c.json({ data: user });
});

api.put('/me', async (c) => {
    const userId = c.get('userId');
    const db = c.env.DB;
    const { store_name } = await c.req.json();

    if (store_name) {
        await db.prepare('UPDATE users SET store_name = ? WHERE id = ?').bind(store_name, userId).run();
        await db.prepare(
            'INSERT INTO settings (user_id, key, value) VALUES (?, ?, ?) ON CONFLICT(user_id, key) DO UPDATE SET value = ?'
        ).bind(userId, 'store_name', store_name, store_name).run();
    }

    return c.json({ success: true });
});

// --- Import from Google Sheet ---

api.post('/import', async (c) => {
    const userId = c.get('userId');
    const db = c.env.DB;
    const { sheetId } = await c.req.json();

    if (!sheetId) {
        return c.json({ error: 'Sheet ID là bắt buộc' }, 400);
    }

    const results = { products: 0, sales: 0, transactions: 0, debts: 0, errors: [] };

    try {
        // 1. Get list of all sheet tabs
        const sheetNames = await getSheetNames(sheetId);
        if (!sheetNames || sheetNames.length === 0) {
            return c.json({ error: 'Không thể đọc Sheet. Hãy chắc chắn Sheet được chia sẻ "Anyone with the link".' }, 400);
        }

        // 2. Import Products
        if (sheetNames.includes('Products')) {
            const rows = await fetchSheetData(sheetId, 'Products');
            for (const row of rows) {
                try {
                    const profit = (parseFloat(row[3]) || 0) - (parseFloat(row[2]) || 0);
                    await db.prepare(
                        'INSERT INTO products (user_id, code, name, cost, price, profit, stock, created_at, category) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
                    ).bind(userId, row[0] || '', row[1] || '', parseFloat(row[2]) || 0, parseFloat(row[3]) || 0, profit, parseInt(row[5]) || 0, row[6] || '', row[7] || 'Chung').run();
                    results.products++;
                } catch (e) {
                    results.errors.push(`Product ${row[1]}: ${e.message}`);
                }
            }
        }

        // 3. Import Sales (all Sales_MM_YYYY sheets)
        const salesSheets = sheetNames.filter(n => n.startsWith('Sales'));
        for (const name of salesSheets) {
            const rows = await fetchSheetData(sheetId, name);
            for (const row of rows) {
                try {
                    await db.prepare(
                        'INSERT INTO sales (user_id, sale_id, datetime, details, total, profit, note) VALUES (?, ?, ?, ?, ?, ?, ?)'
                    ).bind(userId, row[0] || '', row[1] || '', row[2] || '', parseFloat(row[3]) || 0, parseFloat(row[4]) || 0, row[5] || '').run();
                    results.sales++;
                } catch (e) {
                    results.errors.push(`Sale ${row[0]}: ${e.message}`);
                }
            }
        }

        // 4. Import Transactions (all Transactions_MM_YYYY sheets)
        const txSheets = sheetNames.filter(n => n.startsWith('Transactions'));
        for (const name of txSheets) {
            const rows = await fetchSheetData(sheetId, name);
            for (const row of rows) {
                try {
                    let type = (row[2] || '').toLowerCase();
                    if (type === 'thu' || type === 'income') type = 'income';
                    else type = 'expense';

                    await db.prepare(
                        'INSERT INTO transactions (user_id, tx_id, date, type, description, amount, note) VALUES (?, ?, ?, ?, ?, ?, ?)'
                    ).bind(userId, row[0] || '', row[1] || '', type, row[3] || '', parseFloat(row[4]) || 0, row[5] || '').run();
                    results.transactions++;
                } catch (e) {
                    results.errors.push(`TX ${row[0]}: ${e.message}`);
                }
            }
        }

        // 5. Import Debts
        if (sheetNames.includes('Debts')) {
            const rows = await fetchSheetData(sheetId, 'Debts');
            for (const row of rows) {
                try {
                    await db.prepare(
                        'INSERT INTO debts (user_id, debt_id, sale_id, customer_name, phone, total, paid, remaining, created_at, updated_at, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
                    ).bind(userId, row[0] || '', row[1] || '', row[2] || '', row[3] || '', parseFloat(row[4]) || 0, parseFloat(row[5]) || 0, parseFloat(row[6]) || 0, row[7] || '', row[8] || '', row[9] || 'Còn nợ').run();
                    results.debts++;
                } catch (e) {
                    results.errors.push(`Debt ${row[0]}: ${e.message}`);
                }
            }
        }

        return c.json({
            success: true,
            sheets: sheetNames,
            imported: results,
            message: `Import thành công: ${results.products} SP, ${results.sales} đơn, ${results.transactions} thu/chi, ${results.debts} nợ`
        });

    } catch (error) {
        return c.json({ error: 'Lỗi import: ' + error.message, details: results }, 500);
    }
});

// Mount protected API routes
app.route('/api', api);

// Root / landing
app.get('/', (c) => c.json({
    name: 'QLBH API',
    version: '1.0',
    status: 'running',
    endpoints: ['/auth/register', '/auth/login', '/api/*', '/ping']
}));

// Health check
app.get('/ping', (c) => c.json({ status: 'ok', time: new Date().toISOString() }));

// ==========================================
// Helper: Fetch Google Sheet data (public)
// ==========================================

/**
 * Get all sheet tab names from a public Google Sheet
 */
async function getSheetNames(sheetId) {
    try {
        // Use the gviz endpoint to get sheet metadata
        const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&sheet=Products&tq=SELECT%20*%20LIMIT%200`;
        const response = await fetch(url, { redirect: 'follow' });
        const text = await response.text();

        // Alternative: try to parse the HTML of the spreadsheet
        const htmlUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/edit`;
        const htmlResponse = await fetch(htmlUrl, { redirect: 'follow' });
        const html = await htmlResponse.text();

        // Extract sheet names from the HTML
        const sheetNames = [];
        const regex = /\\"name\\":\\"([^"\\]+)\\"/g;
        let match;
        while ((match = regex.exec(html)) !== null) {
            if (!sheetNames.includes(match[1])) {
                sheetNames.push(match[1]);
            }
        }

        // Fallback: try common sheet names
        if (sheetNames.length === 0) {
            const commonNames = ['Products', 'Debts', 'Settings'];
            // Add likely month sheets for current and recent months
            const now = new Date();
            for (let i = 0; i < 6; i++) {
                const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                const mm = String(d.getMonth() + 1).padStart(2, '0');
                const yyyy = d.getFullYear();
                commonNames.push(`Sales_${mm}_${yyyy}`);
                commonNames.push(`Transactions_${mm}_${yyyy}`);
            }

            for (const name of commonNames) {
                try {
                    const testUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(name)}&tq=SELECT%20*%20LIMIT%201`;
                    const testRes = await fetch(testUrl, { redirect: 'follow' });
                    const testText = await testRes.text();
                    if (testRes.ok && !testText.includes('Invalid')) {
                        sheetNames.push(name);
                    }
                } catch (_) {}
            }
        }

        return sheetNames;
    } catch (e) {
        console.error('getSheetNames error:', e);
        return [];
    }
}

/**
 * Fetch data rows from a specific sheet tab
 */
async function fetchSheetData(sheetId, sheetName) {
    try {
        const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(sheetName)}`;
        const response = await fetch(url, { redirect: 'follow' });
        const text = await response.text();

        // Response is JSONP: google.visualization.Query.setResponse({...})
        const jsonMatch = text.match(/google\.visualization\.Query\.setResponse\((.+)\);?\s*$/);
        if (!jsonMatch) {
            console.error('Failed to parse gviz response for', sheetName);
            return [];
        }

        const data = JSON.parse(jsonMatch[1]);
        const table = data.table;
        if (!table || !table.rows) return [];

        // Skip header row (first row is headers in gviz)
        const rows = [];
        for (const row of table.rows) {
            const cells = row.c.map(cell => {
                if (!cell) return '';
                if (cell.f) return cell.f; // formatted value
                if (cell.v !== null && cell.v !== undefined) return String(cell.v);
                return '';
            });
            // Skip empty rows
            if (cells.some(c => c !== '')) {
                rows.push(cells);
            }
        }

        return rows;
    } catch (e) {
        console.error('fetchSheetData error:', sheetName, e);
        return [];
    }
}

export default app;
