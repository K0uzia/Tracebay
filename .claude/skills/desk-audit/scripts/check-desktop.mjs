#!/usr/bin/env node
/**
 * Audit statique de sécurité d'une application Electron ou Tauri (heuristique, sans dépendance).
 * Usage : node check-desktop.mjs [racine] (défaut : dossier courant). Sortie 1 si au moins une erreur.
 * Un résultat « ! » demande une vérification humaine ; un « ✗ » est une configuration à corriger.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.argv[2] || '.');
const IGNORE = /(^|\/)(node_modules|\.git|dist|out|release|build|target|coverage|vendor|\.claude|demo|claude skills web)(\/|$)/;
const errors = [];
const warnings = [];
const err = (f, line, msg) => errors.push(`${f}${line ? `:${line}` : ''}: ${msg}`);
const warn = (f, line, msg) => warnings.push(`${f}${line ? `:${line}` : ''}: ${msg}`);

const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const p = path.join(dir, e.name);
  const r = path.relative(ROOT, p);
  if (IGNORE.test(r)) return [];
  return e.isDirectory() ? walk(p) : [p];
});
const files = walk(ROOT);
const rel = (f) => path.relative(ROOT, f);
const read = (f) => { try { return fs.statSync(f).size < 3 * 1024 * 1024 ? fs.readFileSync(f, 'utf8') : ''; } catch { return ''; } };
const lineOf = (text, idx) => text.slice(0, idx).split('\n').length;
const each = (text, re, cb) => { for (const m of text.matchAll(re)) cb(m, lineOf(text, m.index)); };

const code = files.filter((f) => /\.(?:[cm]?js|ts|tsx|jsx)$/.test(f) && !/\.min\.js$/.test(f));
const html = files.filter((f) => f.endsWith('.html'));
const isElectron = code.some((f) => /require\(['"]electron['"]\)|from ['"]electron['"]/.test(read(f)));
const tauriConf = files.find((f) => /(^|\/)tauri\.conf\.json5?$/.test(rel(f)));

// ---------- Electron ----------
if (isElectron) {
  let sawWindow = false;
  let sawNavGuard = false;
  let sawOpenHandler = false;
  let sawPermHandler = false;
  let sawSingleLock = false;

  for (const f of code) {
    const t = read(f);
    const r = rel(f);
    if (/new\s+BrowserWindow\s*\(/.test(t)) sawWindow = true;
    if (/will-navigate/.test(t)) sawNavGuard = true;
    if (/setWindowOpenHandler/.test(t)) sawOpenHandler = true;
    if (/setPermissionRequestHandler/.test(t)) sawPermHandler = true;
    if (/requestSingleInstanceLock/.test(t)) sawSingleLock = true;

    each(t, /nodeIntegration\s*:\s*true/g, (_, l) => err(r, l, 'nodeIntegration: true'));
    each(t, /nodeIntegrationInSubFrames\s*:\s*true/g, (_, l) => err(r, l, 'nodeIntegrationInSubFrames: true'));
    each(t, /contextIsolation\s*:\s*false/g, (_, l) => err(r, l, 'contextIsolation: false'));
    each(t, /webSecurity\s*:\s*false/g, (_, l) => err(r, l, 'webSecurity: false'));
    each(t, /allowRunningInsecureContent\s*:\s*true/g, (_, l) => err(r, l, 'allowRunningInsecureContent: true'));
    each(t, /enableRemoteModule\s*:\s*true|@electron\/remote/g, (_, l) => err(r, l, 'module remote utilisé'));
    each(t, /sandbox\s*:\s*false/g, (_, l) => err(r, l, 'sandbox: false'));
    each(t, /webviewTag\s*:\s*true/g, (_, l) => warn(r, l, 'webviewTag: true, à justifier'));
    each(t, /experimentalFeatures\s*:\s*true/g, (_, l) => warn(r, l, 'experimentalFeatures: true'));
    each(t, /\.loadURL\(\s*['"`]https?:\/\/(?!localhost|127\.0\.0\.1)/g, (_, l) => err(r, l, 'loadURL vers une URL distante'));
    each(t, /\.loadURL\(\s*(?!['"`])/g, (_, l) => warn(r, l, 'loadURL avec une valeur calculée : vérifier qu\'elle reste locale'));
    each(t, /shell\.openExternal\(/g, (m, l) => {
      const ctx = t.slice(Math.max(0, m.index - 400), m.index);
      if (!/https?:|protocol|startsWith|allow|URL\(/.test(ctx)) warn(r, l, 'shell.openExternal sans filtre visible du protocole ou de l\'hôte');
    });
    each(t, /ipcMain\.on\(\s*['"`]([^'"`]+)/g, (m, l) => warn(r, l, `ipcMain.on('${m[1]}') : préférer ipcMain.handle et valider les arguments`));
    each(t, /\beval\s*\(|new\s+Function\s*\(/g, (_, l) => err(r, l, 'eval ou new Function'));
    each(t, /(?:innerHTML|outerHTML)\s*[+]?=\s*`[^`]*\$\{/g, (_, l) => warn(r, l, 'innerHTML avec interpolation : échapper la donnée ou utiliser textContent'));
    each(t, /insertAdjacentHTML\([^)]*\$\{/g, (_, l) => warn(r, l, 'insertAdjacentHTML avec interpolation'));
    each(t, /localStorage\.setItem\(\s*['"`][^'"`]*(?:token|jwt|password|secret)/gi, (_, l) => warn(r, l, 'jeton ou secret dans localStorage : utiliser safeStorage / trousseau'));
    each(t, /\bexecS?y?n?c?\s*\(\s*`[^`]*\$\{|shell\s*:\s*true/g, (_, l) => warn(r, l, 'commande shell construite par interpolation : vérifier qu\'aucune entrée utilisateur ne l\'atteint'));
    each(t, /(?:rejectUnauthorized\s*:\s*false|NODE_TLS_REJECT_UNAUTHORIZED)/g, (_, l) => err(r, l, 'vérification TLS désactivée'));
    each(t, /certificate-error/g, (_, l) => warn(r, l, 'gestionnaire certificate-error : ne jamais accepter un certificat invalide en production'));

    if (/contextBridge/.test(t)) {
      each(t, /exposeInMainWorld\([^)]*\b(?:ipcRenderer|require|process|fs|child_process|shell)\b\s*[,)}]/g, (_, l) => err(r, l, 'preload expose un objet Node/Electron brut'));
      each(t, /ipcRenderer\.(?:send|invoke|on)\(\s*(?!['"`])/g, (_, l) => warn(r, l, 'preload : canal IPC calculé, préférer une liste blanche de canaux'));
    }
  }
  const mainJs = code.map(rel).filter((r) => /new\s+BrowserWindow\s*\(/.test(read(path.join(ROOT, r))));
  if (sawWindow && !sawNavGuard) warn(mainJs[0], 0, 'aucun garde will-navigate');
  if (sawWindow && !sawOpenHandler) warn(mainJs[0], 0, 'aucun setWindowOpenHandler');
  if (sawWindow && !sawPermHandler) warn(mainJs[0], 0, 'aucun setPermissionRequestHandler (permissions accordées par défaut)');
  if (sawWindow && !sawSingleLock) warn(mainJs[0], 0, 'pas de requestSingleInstanceLock (deux instances sur la même base)');

  const hasFuses = files.some((f) => /fuses/i.test(read(f)) && /(forge\.config|electron-builder|afterPack|package\.json)/.test(rel(f)));
  if (!hasFuses) warn('', 0, 'fuses Electron non configurés (@electron/fuses)');

  for (const f of html) {
    const t = read(f);
    const isDocument = /<!doctype html|<html[\s>]/i.test(t);
    if (isDocument && !/<meta[^>]+http-equiv=["']Content-Security-Policy/i.test(t)) {
      const injected = code.some((c) => /Content-Security-Policy/.test(read(c)));
      if (!injected) err(rel(f), 0, 'aucune CSP (meta ou en-tête via session.webRequest)');
    } else {
      const csp = (t.match(/http-equiv=["']Content-Security-Policy["'][^>]*content=["']([^"']+)/i) || [])[1] || '';
      if (/script-src[^;]*'unsafe-eval'/.test(csp)) err(rel(f), 0, "CSP : script-src 'unsafe-eval'");
      if (/script-src[^;]*'unsafe-inline'/.test(csp)) warn(rel(f), 0, "CSP : script-src 'unsafe-inline'");
      if (/(?:default|script)-src[^;]*\s\*/.test(csp)) err(rel(f), 0, 'CSP : source * dans default-src/script-src');
    }
    each(t, /<script[^>]+src=["']https?:\/\//gi, (_, l) => err(rel(f), l, 'script distant dans l\'interface'));
    each(t, /<link[^>]+href=["']https?:\/\/(?!localhost)/gi, (_, l) => warn(rel(f), l, 'ressource distante (police, CSS) : l\'app doit fonctionner hors ligne'));
  }
}

// ---------- Tauri ----------
if (tauriConf) {
  const r = rel(tauriConf);
  let conf = {};
  try { conf = JSON.parse(read(tauriConf).replace(/^\s*\/\/.*$/gm, '')); } catch { err(r, 0, 'tauri.conf.json illisible'); }
  const sec = conf.app?.security || conf.tauri?.security || {};
  if (sec.csp == null) err(r, 0, 'CSP nulle (app.security.csp)');
  else if (/'unsafe-eval'/.test(JSON.stringify(sec.csp))) err(r, 0, "CSP : 'unsafe-eval'");
  if (sec.dangerousDisableAssetCspModification) err(r, 0, 'dangerousDisableAssetCspModification');
  if (sec.dangerousRemoteDomainIpcAccess || conf.app?.security?.dangerousUseHttpScheme) err(r, 0, 'option dangerous* activée');
  (conf.app?.windows || []).forEach((w) => { if (w.devtools === true) warn(r, 0, `fenêtre ${w.label || ''} : devtools forcés`); });
  if (conf.tauri?.allowlist?.all === true) err(r, 0, 'Tauri 1 : allowlist.all = true');

  files.filter((f) => /src-tauri\/capabilities\/.*\.json$/.test(rel(f))).forEach((f) => {
    const t = read(f);
    const cr = rel(f);
    each(t, /"(?:fs|shell|http|process):default"|"[a-z-]+:allow-all"|"fs:allow-[a-z-]+-recursive"/g, (m, l) => warn(cr, l, `permission large ${m[0]} : vérifier la portée`));
    each(t, /"shell:allow-execute"|"shell:allow-spawn"/g, (m, l) => warn(cr, l, `${m[0]} : liste blanche de commandes obligatoire`));
    if (/"path"\s*:\s*"\*\*"/.test(t) || /"\$HOME\/\*\*"/.test(t)) err(cr, 0, 'portée fs sur tout le disque ou tout $HOME');
    if (/"windows"\s*:\s*\[\s*"\*"\s*\]/.test(t)) warn(cr, 0, 'capacité appliquée à toutes les fenêtres');
  });
  files.filter((f) => /src-tauri\/src\/.*\.rs$/.test(rel(f))).forEach((f) => {
    const t = read(f);
    each(t, /Command::new\([^)]*\)/g, (_, l) => warn(rel(f), l, 'std::process::Command : vérifier que l\'entrée n\'est pas contrôlée par le renderer'));
    each(t, /#\[tauri::command\][\s\S]{0,300}?\.unwrap\(\)/g, (_, l) => warn(rel(f), l, 'unwrap() dans une commande Tauri'));
  });
}

if (!isElectron && !tauriConf) {
  console.log('Ni Electron ni Tauri détecté.');
  process.exit(2);
}

warnings.forEach((w) => console.log(`  ! ${w}`));
errors.forEach((e) => console.log(`  ✗ ${e}`));
console.log(`${isElectron ? 'Electron' : ''}${isElectron && tauriConf ? ' + ' : ''}${tauriConf ? 'Tauri' : ''} : ${errors.length} erreur(s), ${warnings.length} avertissement(s) sur ${code.length + html.length} fichier(s).`);
process.exit(errors.length ? 1 : 0);
