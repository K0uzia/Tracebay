# Typographie

Reprise de la charte Kouzia (site, ERP), appliquée à tous les logiciels.

- Interdits partout (code, interface, PDF, e-mails, commentaires, doc, `package.json`, notes de version, messages de commit) : tiret cadratin (U+2014) et demi-cadratin (U+2013). Remplacer par `:`, `,`, `;`, des parenthèses, un point ou une nouvelle phrase. Le tiret simple `-` reste autorisé pour les mots composés et les options techniques.
- Contrôle : `grep -rnP "[\x{2013}\x{2014}]" --include='*.{js,html,css,json,md}' . --exclude-dir=node_modules` ne renvoie rien sur les fichiers touchés.
- Interface en français : espace insécable avant `:` `;` `!` `?` dans les textes affichés, guillemets « ».
