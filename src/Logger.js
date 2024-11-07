const LEVEL_ERROR = ['error'];
const LEVEL_WARN = ['warn', ...LEVEL_ERROR];
const LEVEL_INFO = ['info', ...LEVEL_WARN];
const LEVEL_VERBOSE = ['log', ...LEVEL_INFO];
const LEVEL_DEBUG = ['debug', ...LEVEL_VERBOSE];

const LEVELS = {
  errors: LEVEL_ERROR,
  warnings: LEVEL_WARN,
  info: LEVEL_INFO,
  verbose: LEVEL_VERBOSE,
  debug: LEVEL_DEBUG,
};

export default {
  console(type, args) {
    const ALLOWED_TYPES = LEVELS[process.env.APP_LOG_LEVEL] || [];
    if (ALLOWED_TYPES.includes(type)) {
      const time = (new Date()).toISOString();
      console[type](`[${time}]`, `[${type.toUpperCase()}]`, ...args);
    }
  },

  debug(...args) {
    this.console('debug', args);
  },

  log(...args) {
    this.console('log', args);
  },

  info(...args) {
    this.console('info', args);
  },

  warn(...args) {
    this.console('warn', args);
  },

  error(...args) {
    this.console('error', args);
  },
};