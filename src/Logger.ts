type LogMethod = 'error' | 'warn' | 'info' | 'log' | 'debug';
const LEVELS: Record<string, LogMethod[]> = {
  errors: ['error'],
  warnings: ['warn', 'error'],
  info: ['info', 'warn', 'error'],
  verbose: ['log', 'info', 'warn', 'error'],
  debug: ['debug', 'log', 'info', 'warn', 'error'],
};

function log(type: LogMethod, ...args: unknown[]): void {
  if (LEVELS[process.env.APP_LOG_LEVEL || 'info']?.includes(type)) {
    console[type](`[${new Date().toISOString()}][${type.toUpperCase()}]`, ...args);
  }
}

export default {
  error: (...args: unknown[]) => log('error', ...args),
  warn: (...args: unknown[]) => log('warn', ...args),
  info: (...args: unknown[]) => log('info', ...args),
  log: (...args: unknown[]) => log('log', ...args),
  debug: (...args: unknown[]) => log('debug', ...args),
};
