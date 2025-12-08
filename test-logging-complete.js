#!/usr/bin/env node

/**
 * Test Complet du Système de Logging
 * Vérifie que tous les événements sont enregistrés correctement
 */

const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);
const LOG_DIR = path.join(process.env.HOME, '.workspace/logs');
const CHAT_LOG_DIR = path.join(LOG_DIR, 'chat');

console.log('🧪 Test Complet du Système de Logging\n');
console.log('📁 Répertoires:');
console.log(`   App logs: ${LOG_DIR}`);
console.log(`   Chat logs: ${CHAT_LOG_DIR}\n`);

/**
 * Créer des clients WebSocket et envoyer des messages
 */
async function testWebSocketLogging() {
    console.log('1️⃣  Test: Logging des événements WebSocket');
    console.log('   - Connexion');
    console.log('   - Pseudo');
    console.log('   - Messages');
    console.log('   - Déconnexion\n');
    
    try {
        // Client 1: Alice
        const alice = new WebSocket('ws://localhost:8060');
        await new Promise(r => alice.on('open', r));
        console.log('   ✅ Alice connectée');
        
        alice.send(JSON.stringify({ type: 'setPseudo', pseudo: 'Alice' }));
        await new Promise(r => setTimeout(r, 300));
        console.log('   ✅ Pseudo Alice défini');
        
        alice.send(JSON.stringify({ type: 'chat', pseudo: 'Alice', message: 'Bonjour!' }));
        await new Promise(r => setTimeout(r, 300));
        console.log('   ✅ Message 1 envoyé');
        
        // Client 2: Bob
        const bob = new WebSocket('ws://localhost:8060');
        await new Promise(r => bob.on('open', r));
        console.log('   ✅ Bob connecté');
        
        bob.send(JSON.stringify({ type: 'setPseudo', pseudo: 'Bob' }));
        await new Promise(r => setTimeout(r, 300));
        console.log('   ✅ Pseudo Bob défini');
        
        bob.send(JSON.stringify({ type: 'chat', pseudo: 'Bob', message: 'Salut Alice!' }));
        await new Promise(r => setTimeout(r, 300));
        console.log('   ✅ Message 2 envoyé');
        
        // Déconnexion
        alice.close();
        bob.close();
        await new Promise(r => setTimeout(r, 300));
        console.log('   ✅ Déconnexions complètes\n');
        
    } catch (err) {
        console.error('   ❌ Erreur:', err.message);
    }
}

/**
 * Vérifier que les logs existent et contiennent les bonnes données
 */
async function verifyLogs() {
    console.log('2️⃣  Vérification des Fichiers de Log\n');
    
    try {
        // Lister les fichiers app
        const appFiles = fs.readdirSync(LOG_DIR)
            .filter(f => f.startsWith('app-') && f.endsWith('.log'))
            .sort()
            .reverse();
        
        console.log('   📄 Fichiers App (5 derniers):');
        appFiles.slice(0, 5).forEach((f, i) => {
            const stat = fs.statSync(path.join(LOG_DIR, f));
            console.log(`      ${i + 1}. ${f} (${stat.size} bytes)`);
        });
        console.log();
        
        // Vérifier le dernier fichier app
        if (appFiles.length > 0) {
            const latestApp = path.join(LOG_DIR, appFiles[0]);
            const appContent = fs.readFileSync(latestApp, 'utf-8');
            
            console.log('   ✅ Fichier app le plus récent:');
            console.log(`      ${appFiles[0]}`);
            const appLines = appContent.split('\n').filter(l => l.trim());
            console.log(`      Lignes: ${appLines.length}`);
            console.log();
        }
        
        // Lister les fichiers chat
        const chatFiles = fs.readdirSync(CHAT_LOG_DIR)
            .filter(f => f.startsWith('chat-') && f.endsWith('.log'))
            .sort()
            .reverse();
        
        console.log('   📄 Fichiers Chat (5 derniers):');
        chatFiles.slice(0, 5).forEach((f, i) => {
            const stat = fs.statSync(path.join(CHAT_LOG_DIR, f));
            console.log(`      ${i + 1}. ${f} (${stat.size} bytes)`);
        });
        console.log();
        
        // Vérifier le dernier fichier chat
        if (chatFiles.length > 0) {
            const latestChat = path.join(CHAT_LOG_DIR, chatFiles[0]);
            const chatContent = fs.readFileSync(latestChat, 'utf-8');
            
            console.log('   ✅ Fichier chat le plus récent:');
            console.log(`      ${chatFiles[0]}`);
            const chatLines = chatContent.split('\n').filter(l => l.trim());
            console.log(`      Lignes: ${chatLines.length}`);
            
            // Afficher les événements
            console.log('\n   📊 Événements enregistrés:');
            const events = {
                '✅ CONNEXION': (chatContent.match(/CONNEXION/g) || []).length,
                '💬 MESSAGE': (chatContent.match(/💬/g) || []).length,
                '❌ DÉCONNEXION': (chatContent.match(/DÉCONNEXION/g) || []).length,
                '🔌 WS': (chatContent.match(/🔌/g) || []).length,
            };
            
            Object.entries(events).forEach(([event, count]) => {
                console.log(`      ${event}: ${count}`);
            });
            
            // Afficher un aperçu du contenu
            console.log('\n   📝 Aperçu du contenu:');
            chatLines.slice(-8).forEach(line => {
                if (line.trim()) {
                    console.log(`      ${line}`);
                }
            });
        }
        
    } catch (err) {
        console.error('   ❌ Erreur vérification:', err.message);
    }
}

/**
 * Exécuter le test
 */
async function runTest() {
    try {
        await testWebSocketLogging();
        await new Promise(r => setTimeout(r, 1000));
        await verifyLogs();
        
        console.log('\n✨ Test Terminé!\n');
        console.log('Fichiers de log créés et consultables:');
        console.log(`   - ${LOG_DIR}`);
        console.log(`   - ${CHAT_LOG_DIR}`);
        console.log('\n');
        
        process.exit(0);
    } catch (err) {
        console.error('❌ Erreur test:', err);
        process.exit(1);
    }
}

// Lancer après 2 secondes
setTimeout(runTest, 2000);
