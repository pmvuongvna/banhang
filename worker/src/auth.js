/**
 * QLBH Worker - Auth Module
 * Simple email + password authentication with JWT
 */

// Simple JWT implementation (no external deps needed in Workers)
const JWT_SECRET_KEY = 'qlbh-jwt-secret'; // Will use env var in production

/**
 * Hash password using Web Crypto API (available in Workers)
 */
async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return btoa(String.fromCharCode(...new Uint8Array(hash)));
}

/**
 * Create JWT token
 */
async function createJWT(payload, secret) {
    const header = { alg: 'HS256', typ: 'JWT' };

    const encodedHeader = btoa(JSON.stringify(header)).replace(/=/g, '');
    const encodedPayload = btoa(JSON.stringify({
        ...payload,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60) // 30 days
    })).replace(/=/g, '');

    const signatureInput = `${encodedHeader}.${encodedPayload}`;

    const key = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );

    const signature = await crypto.subtle.sign(
        'HMAC',
        key,
        new TextEncoder().encode(signatureInput)
    );

    const encodedSignature = btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/=/g, '');

    return `${encodedHeader}.${encodedPayload}.${encodedSignature}`;
}

/**
 * Verify JWT token
 */
async function verifyJWT(token, secret) {
    try {
        const parts = token.split('.');
        if (parts.length !== 3) return null;

        const [encodedHeader, encodedPayload, encodedSignature] = parts;
        const signatureInput = `${encodedHeader}.${encodedPayload}`;

        const key = await crypto.subtle.importKey(
            'raw',
            new TextEncoder().encode(secret),
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['verify']
        );

        // Pad base64 string
        const pad = (s) => s + '='.repeat((4 - s.length % 4) % 4);

        const signatureBuffer = Uint8Array.from(atob(pad(encodedSignature)), c => c.charCodeAt(0));

        const valid = await crypto.subtle.verify(
            'HMAC',
            key,
            signatureBuffer,
            new TextEncoder().encode(signatureInput)
        );

        if (!valid) return null;

        const payload = JSON.parse(atob(pad(encodedPayload)));

        // Check expiry
        if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
            return null;
        }

        return payload;
    } catch (e) {
        return null;
    }
}

/**
 * Auth middleware for Hono
 */
function authMiddleware(secret) {
    return async (c, next) => {
        const authHeader = c.req.header('Authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return c.json({ error: 'Unauthorized' }, 401);
        }

        const token = authHeader.slice(7);
        const payload = await verifyJWT(token, secret);

        if (!payload) {
            return c.json({ error: 'Token không hợp lệ hoặc đã hết hạn' }, 401);
        }

        c.set('userId', payload.userId);
        c.set('email', payload.email);
        await next();
    };
}

export { hashPassword, createJWT, verifyJWT, authMiddleware };
