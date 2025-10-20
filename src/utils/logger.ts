const isDev = process.env.NODE_ENV === 'development';
const isCli = process.env.NODE_ENV === 'cli';

class SimpleLogger {
  debug(msg: string, meta?: any) {
    if (!isCli && isDev) {
      console.log(`🦊 [DEBUG] ${msg}`, meta || '');
    }
  }

  info(msg: string, meta?: any) {
    if (!isCli) {
      console.log(`🦊 [INFO] ${msg}`, meta || '');
    }
  }

  warn(msg: string, meta?: any) {
    console.warn(`🦊 [WARN] ${msg}`, meta || '');
  }

  async error(msg: string, meta?: any) {
    console.error(`🦊 [ERROR] ${msg}`, meta || '');

    if (isCli) {
      try {
        const fs = await import('fs');
        const os = await import('os');
        const path = await import('path');
        const logFile = path.join(os.tmpdir(), 'foxy-mcp-error.log');
        const logEntry = `${new Date().toISOString()} ${msg} ${JSON.stringify(meta)}\n`;
        fs.appendFileSync(logFile, logEntry);
      } catch {}
    }
  }
}

export const logger = new SimpleLogger();
