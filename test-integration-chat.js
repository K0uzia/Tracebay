#!/usr/bin/env node

/**
 * Test Intégration - Vérifier tous les changements
 * - Icône du pseudo
 * - Compteur utilisateurs aligné à droite
 * - Badge de notification qui se reset
 * - Logs qui s'actualisent
 */

const WebSocket = require('ws');
const fs = require('fs');

const WS_URL = 'ws://localhost:8060';
const CHAT_LOG = require('path').join(process.env.HOME, '.workspace/logs/chat/chat-' + new Date().toISOString().split('T')[0] + '.log');

console.log('🧪 Test d\'intégration - Chat Widget\n');

/**
 * Créer un client WebSocket
 */
function createClient(pseudo) {
    return new Promise((resolve, reject) => {
        try {
            const ws = new WebSocket(WS_URL);
            
            ws.on('open', () => {
                console.log(`  ✅ [${pseudo}] Connecté au serveur WebSocket`);
                
                // Envoyer le pseudo pour se "connecter"
                ws.send(JSON.stringify({
                    type: 'setPseudo',
                    pseudo: pseudo
                }));
                
                resolve(ws);
            });
            
            ws.on('error', (err) => {
                console.error(`  ❌ [${pseudo}] Erreur:`, err.message);
                reject(err);
            });
        } catch (err) {
            reject(err);
        }
    });
}

/**
 * Vérifier les logs
 */
function checkLogs() {
    try {
        if (!fs.existsSync(CHAT_LOG)) {
            console.log('  ⚠️  Fichier log non trouvé');
            return false;
        }
        
        const logs = fs.readFileSync(CHAT_LOG, 'utf-8');
        const hasUserEvents = logs.includes('USER_CONNECTED') && logs.includes('USER_DISCONNECTED');
        
        if (hasUserEvents) {
            console.log('  ✅ Logs contiennent les événements USER_CONNECTED/DISCONNECTED');
            return true;
        } else {
            console.log('  ⚠️  Logs ne contiennent pas les événements USER');
            return false;
        }
    } catch (err) {
        console.error('  ❌ Erreur lecture logs:', err.message);
        return false;
    }
}

/**
 * Lancer le test
 */
async function runTest() {
    let testsPassed = 0;
    let testsFailed = 0;
    
    try {
        console.log('1️⃣  Test: Création de deux clients WebSocket avec setPseudo');
        const alice = await createClient('Alice');
        await new Promise(resolve => setTimeout(resolve, 300));
        
        const bob = await createClient('Bob');
        await new Promise(resolve => setTimeout(resolve, 300));
        
        alice.close();
        bob.close();
        
        await new Promise(resolve => setTimeout(resolve, 500));
        
        console.log('\n2️⃣  Test: Vérification des logs');
        if (checkLogs()) {
            testsPassed++;
        } else {
            testsFailed++;
        }
        
        console.log('\n3️⃣  Vérifications UI attendues (à valider manuellement):');
        console.log('  ☐ Icône user-circle à gauche du pseudo');
        console.log('  ☐ Nombre d\'utilisateurs aligné à droite');
        console.log('  ☐ Badge de notification se réinitialise à l\'ouverture');
        console.log('  ☐ Aucune erreur Autofill visible');
        
        console.log('\n' + '='.repeat(50));
        console.log(`Résultats: ✅ ${testsPassed} | ❌ ${testsFailed}`);
        
        if (testsFailed === 0) {
            console.log('✨ Tous les tests passés !');
            process.exit(0);
        } else {
            process.exit(1);
        }
        
    } catch (err) {
        console.error('❌ Erreur test:', err.message);
        process.exit(1);
    }
}

// Lancer après 2 secondes
setTimeout(runTest, 2000);
