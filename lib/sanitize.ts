/**
 * HTML sanitization utilities to prevent XSS.
 */

/**
 * Escape HTML special characters to prevent XSS injection.
 * Use this when inserting user-provided text into HTML templates.
 */
export function escapeHtml(str: string): string {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * Sanitize HTML content — allow safe tags for blog/article rendering
 * while stripping dangerous elements (script, iframe, event handlers, etc.)
 */
export function sanitizeHtml(html: string): string {
    if (!html) return '';

    // Remove script tags and their content
    let clean = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');

    // Remove iframe, object, embed, form tags
    clean = clean.replace(/<(iframe|object|embed|form|input|textarea|button)\b[^>]*>.*?<\/\1>/gi, '');
    clean = clean.replace(/<(iframe|object|embed|form|input|textarea|button)\b[^>]*\/?>/gi, '');

    // Remove event handlers (onclick, onload, onerror, etc.)
    clean = clean.replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');

    // Remove javascript: and data: URLs in href/src attributes
    clean = clean.replace(/\s+(href|src|action)\s*=\s*["']?\s*javascript:/gi, ' $1="');
    clean = clean.replace(/\s+(href|src|action)\s*=\s*["']?\s*data:/gi, ' $1="');

    // Remove style attributes that could contain expressions
    clean = clean.replace(/\s+style\s*=\s*["'][^"']*expression\s*\([^"']*["']/gi, '');

    return clean;
}

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
    if (!email || typeof email !== 'string') return false;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email.trim());
}

/**
 * Validate Ghana phone number format.
 * Accepts: 0XXXXXXXXX (10 digits), +233XXXXXXXXX or 233XXXXXXXXX (12 digits)
 */
export function isValidGhanaPhone(phone: string): boolean {
    if (!phone || typeof phone !== 'string') return false;
    const cleaned = phone.replace(/\D/g, '');
    return (
        (cleaned.length === 10 && cleaned.startsWith('0')) ||
        (cleaned.length === 12 && cleaned.startsWith('233'))
    );
}

/**
 * Normalize a Ghana phone number to 0XXXXXXXXX format.
 * Handles +233/233 prefix and strips spaces/dashes.
 */
export function normalizeGhanaPhone(phone: string): string {
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 12 && cleaned.startsWith('233')) {
        return '0' + cleaned.slice(3);
    }
    return cleaned;
}

/**
 * Sanitize a string for safe use in logs (mask PII)
 */
export function maskEmail(email: string): string {
    if (!email) return '***';
    const [local, domain] = email.split('@');
    if (!domain) return '***';
    return local.slice(0, 2) + '***@' + domain;
}

/**
 * Make free text safe to place inside a PostgREST-style filter string such as
 * `name.ilike.%term%`. Commas, brackets and dots separate conditions there, and
 * % and _ are wildcards, so they are replaced with spaces.
 */
export function filterTerm(value: unknown, maxLength = 80): string {
  return String(value ?? '')
    .replace(/[,()%_\\.*:"']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}
