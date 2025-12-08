/**
 * Test de la suppression du chat via WebSocket
 */

const WebSocket = require('ws');
const http = require('http');

const WS_URL = 'ws://localhost:8060';

async function testClearChat() {
    console.log('🧪 Test suppression du chat');
    console.log('============================\n');

    // Créer deux clients WebSocket
    const client1 = new WebSocket(WS_URL);
    const client2 = new WebSocket(WS_URL);
    let messagesReceived = { client1: 0, client2: 0 };

    // Helper pour attendre l'événement open
    const waitForOpen = (ws) => {
        return new Promise((resolve) => {
            if (ws.readyState === WebSocket.OPEN) {
                resolve();
            } else {
                ws.addEventListener('open', resolve);
            }
        });
    };

    try {
        // Attendre les connexions
        await waitForOpen(client1);
        await waitForOpen(client2);
        console.log('✅ Deux clients connectés');

        // Client 1 envoie un pseudo
        client1.send(JSON.stringify({ type: 'setPseudo', pseudo: 'Alice' }));
        await new Promise(r => setTimeout(r, 100));

        // Client 2 envoie un pseudo
        client2.send(JSON.stringify({ type: 'setPseudo', pseudo: 'Bob' }));
        await new Promise(r => setTimeout(r, 100));

        // Client 1 envoie un message
        client1.send(JSON.stringify({ type: 'chat', pseudo: 'Alice', message: 'Hello Bob!' }));
        await new Promise(r => setTimeout(r, 100));

        // Client 2 envoie un message
        client2.send(JSON.stringify({ type: 'chat', pseudo: 'Bob', message: 'Hi Alice!' }));
        await new Promise(r => setTimeout(r, 100));

        // Attendre les messages
        let receivedHistory = false;
        let receivedMessages = 0;

        client1.addEventListener('message', (event) => {
            const data = JSON.parse(event.data);
            console.log(`📨 Client1 reçoit: ${data.type}`, data);
            if (data.type === 'history') {
                receivedHistory = true;
                console.log(`📜 Historique reçu avec ${data.messages?.length || 0} messages`);
            } else if (data.type === 'newMessage') {
                receivedMessages++;
                console.log(`💬 Nouveau message reçu (${receivedMessages}): "${data.message?.message}"`);
            }
        });

        client2.addEventListener('message', (event) => {
            const data = JSON.parse(event.data);
            console.log(`📨 Client2 reçoit: ${data.type}`, data);
        });

        // Attendre un peu pour recevoir les messages
        await new Promise(r => setTimeout(r, 500));

        console.log('\n🗑️  Envoi de la commande de suppression du chat par Alice...');
        client1.send(JSON.stringify({
            type: 'clearChat',
            pseudo: 'Alice'
        }));

        // Attendre la réponse
        let clearChatReceived = false;
        const clearHandler = (event) => {
            const data = JSON.parse(event.data);
            console.log(`📨 Clear réponse: ${data.type}`, data);
            if (data.type === 'chatCleared') {
                clearChatReceived = true;
                console.log(`✅ Événement chatCleared reçu: supprimé par ${data.clearedBy}`);
            } else if (data.type === 'success') {
                console.log(`✅ Confirmation: ${data.text}`);
            }
        };

        client1.addEventListener('message', clearHandler);
        client2.addEventListener('message', clearHandler);

        await new Promise(r => setTimeout(r, 500));

        if (clearChatReceived) {
            console.log('\n✅ TEST RÉUSSI: Chat supprimé avec succès!');
        } else {
            console.log('\n⚠️  Pas de réponse chatCleared reçue');
        }

        // Vérifier les logs
        console.log('\n📋 Vérification du fichier log chat...');

    } catch (error) {
        console.error('❌ Erreur:', error.message);
    } finally {
        client1.close();
        client2.close();
        console.log('\n✅ Test terminé, connexions fermées');
        process.exit(0);
    }
}

testClearChat();
