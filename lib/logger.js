/**
 * DZ Logger — مستوى السجلات حسب البيئة
 * LOG_LEVEL: debug | info | warn | error (default: info)
 *
 * في التطوير: كل شيء يظهر
 * في الإنتاج: warn و error فقط (يقلل I/O overhead على Vercel)
 */

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 }
const ENV_LEVEL = (process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'warn' : 'info')).toLowerCase()
const MIN_LEVEL = LEVELS[ENV_LEVEL] ?? LEVELS.info

function _log(level, ...args) {
  if (LEVELS[level] < MIN_LEVEL) return
  const ts = new Date().toISOString().slice(11, 19)
  switch (level) {
    case 'debug': console.debug(`[${ts}]`, ...args); break
    case 'info':  console.log(`[${ts}]`, ...args);   break
    case 'warn':  console.warn(`[${ts}]`, ...args);  break
    case 'error': console.error(`[${ts}]`, ...args); break
  }
}

export const logger = {
  debug: (...a) => _log('debug', ...a),
  info:  (...a) => _log('info',  ...a),
  warn:  (...a) => _log('warn',  ...a),
  error: (...a) => _log('error', ...a),
  /**
   * تسجيل خطأ catch block مع context
   * @param {string} ctx  - اسم الدالة أو الـ module
   * @param {Error|unknown} err
   */
  catchWarn: (ctx, err) => _log('warn', `[${ctx}] caught:`, err?.message || String(err)),
  catchError: (ctx, err) => _log('error', `[${ctx}] ERROR:`, err?.message || String(err), err?.stack?.split('\n')[1] || ''),
}

export default logger
