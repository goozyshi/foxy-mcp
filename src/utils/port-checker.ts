import net from 'net';

export async function isPortInUse(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();

    server.once('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        resolve(true);
      } else {
        resolve(false);
      }
    });

    server.once('listening', () => {
      server.close();
      resolve(false);
    });

    server.listen(port);
  });
}

export function getPortCleanupCommand(port: number): string {
  const platform = process.platform;

  if (platform === 'win32') {
    return `netstat -ano | findstr :${port}  # 查找PID，然后 taskkill /PID <PID> /F`;
  } else {
    return `lsof -ti:${port} | xargs kill -9`;
  }
}
