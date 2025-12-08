#!/usr/bin/env node

/**
 * Test WebSocket - Vérifier le système un-utilisateur-par-poste
 */

const WebSocket = require('ws');

const WS_URL = 'ws://localhost:8060';

/**
 * Créer un client WebSocket avec un pseudo
 */
function createClient(pseudo) {
    return new Promise((resolve, reject) => {
        try {
            const ws = new WebSocket(WS_URL);
            
            ws.on('open', () => {
                console.log(`✅ [${pseudo}] Connecté au serveur`);
                
                // Envoyer le pseudo au serveur pour se "connecter"
                ws.send(JSON.stringify({
                    type: 'setPseudo',
                    pseudo: pseudo
                }));
                
                resolve(ws);
            });
            
            ws.on('message', (data) => {
                try {
                    const msg = JSON.parse(data);
                    
                    if (msg.type === 'userCount') {
                        console.log(`👥 [${pseudo}] ${msg.count} utilisateur(s) connecté(s): ${msg.users.join(', ')}`);
                    } else if (msg.type === 'history') {
                        console.log(`📚 [${pseudo}] Historique reçu: ${msg.messages?.length || 0} messages`);
                    }
                } catch (err) {
                    console.log(`📨 [${pseudo}] Données reçues:`, data.toString().substring(0, 100));
                }
            });
            
            ws.on('error', (err) => {
                console.error(`❌ [${pseudo}] Erreur:`, err.message);
                reject(err);
            });
        } catch (err) {
            reject(err);
        }
    });
}

/**
 * Lancer le test
 */
async function runTest() {
    console.log('🧪 Démarrage du test WebSocket...\n');
    
    try {
        // Créer deux clients
        console.log('1️⃣  Création du client Alice...');
        const alice = await createClient('Alice');
        
        await new Promise(resolve => setTimeout(resolve, 500));
        
        console.log('\n2️⃣  Création du client Bob...');
        const bob = await createClient('Bob');
        
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Alice envoie un message
        console.log('\n3️⃣  Alice envoie un message...');
        alice.send(JSON.stringify({
            type: 'chat',
            pseudo: 'Alice',
            message: 'Coucou Bob!'
        }));
        
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Bob envoie un message
        console.log('\n4️⃣  Bob envoie un message...');
        bob.send(JSON.stringify({
            type: 'chat',
            pseudo: 'Bob',
            message: 'Salut Alice!'
        }));
        
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Alice se déconnecte et se reconnecter avec un nouveau pseudo
        console.log('\n5️⃣  Alice se déconnecte...');
        alice.close();
        
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        console.log('\n6️⃣  Alice se reconnecte avec pseudo "AliceV2"...');
        const aliceV2 = await createClient('AliceV2');
        
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        console.log('\n7️⃣  Test terminé - Fermeture des connexions...');
        aliceV2.close();
        bob.close();
        
        await new Promise(resolve => setTimeout(resolve, 500));
        console.log('\n✅ Test terminé avec succès\n');
        process.exit(0);
        
    } catch (err) {
        console.error('❌ Erreur:', err.message);
        process.exit(1);
    }
}

// Lancer le test après 2 secondes (le temps que le serveur démarre)
setTimeout(runTest, 2000);
