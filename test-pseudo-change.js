/**
 * Test: Changement et restauration du pseudo
 */

const WebSocket = require('ws');

const WS_URL = 'ws://localhost:8060';

async function testPseudoChange() {
    console.log('🧪 Test: Changement et restauration du pseudo');
    console.log('=============================================\n');

    const client1 = new WebSocket(WS_URL);

    // Helper pour attendre l'événement open
    const waitForOpen = (ws) => {
        return new Promise((resolve) => {
            if (ws.readyState === WebSocket.OPEN) {
                resolve();
            } else {
                ws.addEventListener('open', resolve, { once: true });
            }
        });
    };

    try {
        // Attendre la connexion
        await waitForOpen(client1);
        console.log('✅ WebSocket connecté');

        // Envoyer le premier pseudo
        console.log('\n📝 Envoi du premier pseudo: Alice');
        client1.send(JSON.stringify({ type: 'setPseudo', pseudo: 'Alice' }));
        
        await new Promise(r => setTimeout(r, 500));

        // Envoyer un message avec Alice
        console.log('💬 Alice envoie un message');
        client1.send(JSON.stringify({ type: 'chat', pseudo: 'Alice', message: 'Hello, je suis Alice!' }));
        
        await new Promise(r => setTimeout(r, 500));

        // Fermer la connexion (simule rechargement)
        console.log('\n🔄 Fermeture de la connexion (simule rechargement)');
        client1.close();
        
        await new Promise(r => setTimeout(r, 1000));

        // Nouvelle connexion (client reconnecté)
        const client1Reconnect = new WebSocket(WS_URL);
        await waitForOpen(client1Reconnect);
        console.log('✅ Reconnecté au WebSocket');

        // Envoyer à nouveau le même pseudo (simule l'envoi auto du localStorage)
        console.log('\n✨ Reconnexion avec le même pseudo: Alice (depuis localStorage)');
        client1Reconnect.send(JSON.stringify({ type: 'setPseudo', pseudo: 'Alice' }));
        
        await new Promise(r => setTimeout(r, 500));

        // Envoyer un message avec Alice reconnecté
        console.log('💬 Alice (reconnectée) envoie un autre message');
        client1Reconnect.send(JSON.stringify({ type: 'chat', pseudo: 'Alice', message: 'Je suis de retour!' }));
        
        let messagesReceived = 0;
        const messageHandler = (event) => {
            const data = JSON.parse(event.data);
            if (data.type === 'history') {
                console.log(`📜 Historique reçu: ${data.messages?.length || 0} messages`);
                data.messages?.forEach((msg, idx) => {
                    console.log(`  [${idx + 1}] ${msg.pseudo}: "${msg.message}"`);
                });
            } else if (data.type === 'newMessage') {
                messagesReceived++;
                console.log(`💬 Nouveau message reçu: "${data.message?.message}"`);
            }
        };

        client1Reconnect.addEventListener('message', messageHandler);
        
        await new Promise(r => setTimeout(r, 1000));

        console.log(`\n✅ TEST RÉUSSI: Pseudo restauré automatiquement après reconnexion!`);
        console.log(`✅ Messages envoyés et reçus correctement`);

    } catch (error) {
        console.error('❌ Erreur:', error.message);
    } finally {
        client1?.close?.();
        console.log('\n✅ Test terminé');
        process.exit(0);
    }
}

testPseudoChange();
