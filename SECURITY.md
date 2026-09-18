# Politique de sécurité

## Versions prises en charge

| Version | Maintenance |
| ------- | ----------- |
| 3.3.x (`main`) | Oui |
| Versions antérieures | Non |

## Signalement

Les vulnérabilités ne doivent **pas** faire l’objet d’une issue publique.

Utiliser un [rapport privé GitHub](https://github.com/K0uzia/workspace/security/advisories/new).

Fournir :

- la version du client (pied de page ou `package.json`) ;
- le système d’exploitation et le mode d’exécution (Electron ou démo) ;
- la description, l’impact et les étapes de reproduction ;
- un correctif ou un élément de preuve, uniquement dans le canal privé.

## Délais

Accusé de réception visé sous **7 jours**. Traitement ou statut visé sous **90 jours**, selon la gravité.

## Périmètre

Dans le périmètre : isolation Electron, fuite de JWT, injection renderer / IPC, accès API non autorisé, secrets dans le dépôt ou la CI.

Hors périmètre : déni de service sur une instance privée, anomalies locales non reproductibles, demandes fonctionnelles.

## Secrets

En cas de fuite, signaler selon la procédure ci-dessus et **révoquer** immédiatement le secret. Ne pas le recommiter.
