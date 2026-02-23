/**
 * Buffer circulaire des derniers logs serveur (stdout/stderr + Pino/Fastify) pour la page de monitoring.
 * Historique de 250 lignes maximum.
 */

import { Writable } from 'stream';

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

/** Niveaux Pino : 10=trace, 20=debug, 30=info, 40=warn, 50=error, 60=fatal */
const PINO_LEVEL_NAMES: Record<number, string> = {
  10: 'trace',
  20: 'debug',
  30: 'info',
  40: 'warn',
  50: 'error',
  60: 'fatal'
};

function addLine(level: 'stdout' | 'stderr', text: string, time?: string): void {
  const ts = time || new Date().toISOString();
  const lines = text.split(/\r?\n/).filter((s) => s.trim() !== '');
  for (const line of lines) {
    buffer.push({ time: ts, level, text: stripAnsi(line) });
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
 * Crée un stream Writable que Pino peut utiliser (addStream).
 * Chaque ligne JSON Pino est formatée et ajoutée au buffer (logs API, requêtes HTTP, etc.).
 */
export function createPinoBufferStream(): Writable {
  return new Writable({
    write(chunk: Buffer | string, _encoding: string, callback: (err?: Error) => void) {
      try {
        const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
        const lines = text.split(/\r?\n/).filter((s) => s.trim() !== '');
        for (const raw of lines) {
          try {
            const obj = JSON.parse(raw) as { level?: number; time?: number; msg?: string; [k: string]: unknown };
            const levelNum = typeof obj.level === 'number' ? obj.level : 30;
            const level: 'stdout' | 'stderr' = levelNum >= 50 ? 'stderr' : 'stdout';
            const time = typeof obj.time === 'number' ? new Date(obj.time).toISOString() : new Date().toISOString();
            const levelName = PINO_LEVEL_NAMES[levelNum] || 'info';
            const msg = typeof obj.msg === 'string' ? obj.msg : '';
            const rest: string[] = [];
            for (const [k, v] of Object.entries(obj)) {
              if (k === 'level' || k === 'time' || k === 'msg') continue;
              if (v !== undefined && v !== null) rest.push(`${k}=${JSON.stringify(v)}`);
            }
            const extra = rest.length ? ' ' + rest.join(' ') : '';
            const line = `[${levelName.toUpperCase()}] ${msg}${extra}`.trim();
            buffer.push({ time, level, text: line });
            if (buffer.length > MAX_LINES) buffer.shift();
          } catch {
            buffer.push({ time: new Date().toISOString(), level: 'stdout', text: raw });
            if (buffer.length > MAX_LINES) buffer.shift();
          }
        }
      } catch {
        // ignore
      }
      callback();
    }
  });
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
