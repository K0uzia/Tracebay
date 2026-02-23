/**
 * Buffer circulaire des derniers logs serveur (stdout/stderr) pour la page de monitoring.
 * Historique de 250 lignes maximum.
 */

const MAX_LINES = 250;

export interface ServerLogLine {
  time: string;
  level: 'stdout' | 'stderr';
  text: string;
}

const buffer: ServerLogLine[] = [];
let initialized = false;

/** Supprime les codes ANSI (couleurs) pour affichage dans le navigateur */
function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, '');
}

function addLine(level: 'stdout' | 'stderr', text: string): void {
  const time = new Date().toISOString();
  const lines = text.split(/\r?\n/).filter((s) => s.trim() !== '');
  for (const line of lines) {
    buffer.push({ time, level, text: stripAnsi(line) });
    if (buffer.length > MAX_LINES) buffer.shift();
  }
}

/**
 * Retourne les dernières lignes (jusqu'à 250).
 */
export function getServerLogs(): ServerLogLine[] {
  return [...buffer];
}

/**
 * Initialise la capture de stdout/stderr. À appeler une seule fois au démarrage.
 */
export function initServerLogBuffer(): void {
  if (initialized) return;
  initialized = true;

  const origStdoutWrite = process.stdout.write.bind(process.stdout);
  const origStderrWrite = process.stderr.write.bind(process.stderr);

  (process.stdout as NodeJS.WriteStream).write = function (
    chunk: any,
    encodingOrCallback?: BufferEncoding | ((err?: Error) => void),
    callback?: (err?: Error) => void
  ): boolean {
    const enc = typeof encodingOrCallback === 'function' ? undefined : encodingOrCallback;
    const cb = typeof encodingOrCallback === 'function' ? encodingOrCallback : callback;
    try {
      const text = typeof chunk === 'string' ? chunk : (chunk as Buffer).toString('utf8');
      addLine('stdout', text);
    } catch {
      // ignore
    }
    return origStdoutWrite(chunk as any, enc as any, cb as any);
  };

  (process.stderr as NodeJS.WriteStream).write = function (
    chunk: any,
    encodingOrCallback?: BufferEncoding | ((err?: Error) => void),
    callback?: (err?: Error) => void
  ): boolean {
    const enc = typeof encodingOrCallback === 'function' ? undefined : encodingOrCallback;
    const cb = typeof encodingOrCallback === 'function' ? encodingOrCallback : callback;
    try {
      const text = typeof chunk === 'string' ? chunk : (chunk as Buffer).toString('utf8');
      addLine('stderr', text);
    } catch {
      // ignore
    }
    return origStderrWrite(chunk as any, enc as any, cb as any);
  };
}
