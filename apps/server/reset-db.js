#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const dbPath = path.join(__dirname, 'data', 'workspace.db');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('⚠️  ATTENTION: Cette commande va SUPPRIMER toutes les données de la base de données!');
console.log(`📂 Fichier: ${dbPath}\n`);

rl.question('Êtes-vous sûr de vouloir continuer? (oui/non): ', (answer) => {
  if (answer.toLowerCase() === 'oui' || answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'o' || answer.toLowerCase() === 'y') {
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
      console.log('✅ Base de données supprimée avec succès!');
      console.log('🔄 Elle sera recréée au prochain démarrage du serveur.');
    } else {
      console.log('ℹ️  Aucune base de données trouvée.');
    }
  } else {
    console.log('❌ Opération annulée.');
  }
  rl.close();
});
