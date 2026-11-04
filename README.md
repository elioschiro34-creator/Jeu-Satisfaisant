# Douceurs 🍮

Un site de petits jeux très satisfaisants, style ASMR. Tout en HTML, CSS et JavaScript, sans installation. Les sons sont générés directement par le navigateur : aucun fichier audio à télécharger.

## Jouer

Double-clique sur `index.html` : le jeu s'ouvre dans ton navigateur. Monte le son 🎧.

## Les 21 mini-jeux

| Jeu | Ce qu'on fait |
| --- | --- |
| 🧈 Tartine | Prendre du beurre au couteau et le tartiner sur une tartine grillée (aussi confiture et miel) |
| 🧊 Beurre froid | Trancher un bloc de beurre froid qui craque, ou faire des copeaux |
| 🧼 Savon à découper | Trancher un savon pastel et l'émietter en petits cubes |
| 🎨 Peinture épaisse | Étaler et mélanger de grosses noix de peinture au couteau |
| 🎂 Glaçage | Verser du glaçage sur un gâteau qui tourne, le lisser, puis décorer |
| 🌈 Pouring | Verser des couleurs en anneaux, incliner la toile pour marbrer |
| 🫧 Papier bulle | Éclater toutes les bulles |
| 🟣 Pop-it | Enfoncer les bulles en silicone, puis le retourner |
| 🫠 Slime | Tirer, écraser et taper un slime brillant |
| 🏖️ Sable cinétique | Couper un bloc de sable à couches colorées |
| ⏳ Sable coloré | Verser du sable de couleur dans un bocal |
| 📱 Film à peler | Décoller le film protecteur d'objets tout neufs |
| 🍮 Crème brûlée | Faire craquer la croûte de caramel, la refaire au chalumeau |
| 🪨 Jardin zen | Ratisser le sable, déplacer les galets, ajouter mousse et lanterne |
| 🍫 Chocolat | Déballer une tablette et la casser carré par carré |
| 🧽 Karcher | Nettoyer au jet haute pression des dalles, une terrasse, une voiture, un nain de jardin |
| 🧶 Tufting | Tufter un tapis, le tondre, puis le retourner |
| 🍯 Miel | Faire couler du miel, du caramel ou du sirop en filet sur des crêpes ou une tartine |
| 🧊 Glace pilée | Fissurer puis écraser des glaçons au pilon, ajouter du sirop |
| 🎀 Perles | Pousser et trier des milliers de perles par couleur |
| 🧱 Dominos | Tracer un chemin de dominos et les faire tomber |

Sur l'écran d'accueil : touche les lettres du titre pour les faire sauter, éclate les bulles du fond, ou appuie sur 🎲 **Au hasard**.

Tout marche à la souris et au doigt. Sur téléphone, le jeu vibre aussi (réglable dans ⚙️).

## L'installer sur ton téléphone

**Étape 1 : mettre le jeu sur GitHub** (une seule fois, depuis l'ordinateur)

1. Va sur ton dépôt GitHub **Jeu-Satisfaisant**.
2. Clique sur **Add file → Upload files**.
3. Ouvre le dossier `Douceurs-pour-GitHub`, sélectionne **tout ce qu'il contient** (Ctrl + A) et glisse-le dans la page GitHub. Les dossiers `js` et `icons` doivent bien être inclus.
4. Clique sur **Commit changes** et attends que l'envoi finisse.
5. Va dans **Settings → Pages**. Sous « Branch », choisis `main`, puis `/ (root)`, puis **Save**.
6. Attends 1 à 2 minutes et recharge la page : le lien du jeu s'affiche en haut, du genre `https://ton-pseudo.github.io/Jeu-Satisfaisant/`.

**Étape 2 : l'installer sur le téléphone**

- **Android (Chrome)** : ouvre le lien, puis appuie sur **⋮ → Installer l'application** (ou « Ajouter à l'écran d'accueil »).
- **iPhone (Safari)** : ouvre le lien, puis appuie sur **Partager ⬆️ → Sur l'écran d'accueil**.

L'icône Douceurs apparaît sur ton écran d'accueil. Le jeu s'ouvre en plein écran et marche même sans internet.

Tu peux t'envoyer le lien par WhatsApp pour l'ouvrir facilement sur ton téléphone.

## Fichiers

- `index.html` : la page
- `style.css` : le style
- `js/core.js` : le socle commun (vibrations, tactile, dessin)
- `js/audio.js` : le moteur de sons
- `js/main.js` : le menu
- `js/games/` : un fichier par mini-jeu
- `manifest.webmanifest`, `sw.js`, `icons/` : ce qui rend le jeu installable et utilisable sans internet
