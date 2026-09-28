# Symbiose — application de gestion d'atelier

Serveur Node.js sans dépendance (Node 18+) : API REST, comptes à mot de passe, rôles vérifiés côté serveur, évaluations, photos. Données dans `data/` (data.json et img/).

## Lancer
    node server.js      # http://localhost:3000

## Comptes et droits
- **Administrateur** (créé au premier démarrage, identifiant `bonheur`) : seul à créer les chefs d'atelier ; peut aussi créer des employés/contrôleurs (dans un atelier existant) et la direction.
- **Chef d'atelier** : crée les comptes employés et contrôleurs de son atelier. Chaque atelier ne voit que ses propres données.
- Tout compte créé reçoit un mot de passe provisoire à remplacer à la première connexion ; l'administrateur ou le chef peut le réinitialiser.

## Sécurité et déploiement
Le mot de passe administrateur par défaut est dans `server.js` : sur l'hébergeur, définissez `ADMIN_USER` et `ADMIN_PASSWORD` (variables d'environnement) avant le premier démarrage, et ne publiez pas le code. HTTPS obligatoire. Disque persistant sur `data/` (ou `DATA_DIR`), `TZ=Africa/Douala`. Copiez `data/` régulièrement.

## Limites
Stockage JSON. Les photos sont servies par liens non devinables, sans connexion. Pas encore de machines ni de stock.
