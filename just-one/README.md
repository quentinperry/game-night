# Just One — Mobile

Version mobile (PWA, 100 % statique, sans build ni dépendance) du jeu coopératif **Just One**
(Ludovic Roudy & Bruno Sautter, Repos Production — Spiel des Jahres 2019).
**Projet fan, non officiel**, avec sa propre liste de mots.

Deux façons de jouer, sur téléphone, sans compte ni installation :

- **🤖 Solo** : tu es toujours le devineur, 3 robots écrivent chacun un indice d'un seul mot
  (les doublons sont annulés automatiquement, comme dans le jeu de plateau).
- **👥 Entre amis** : 2 à 7 joueurs sur le même appareil (pass-and-play) — l'appli indique à qui
  passer le téléphone à chaque étape.
- **🌐 En ligne** : 2 à 7 joueurs, **chacun sur son propre appareil**. L'hôte crée un salon et partage
  un **code de partie** (8 caractères) ; les autres le rejoignent avec ce code. Les appareils se
  connectent en **WebRTC direct** (data channel chiffré), la signalisation passe par le relais HTTP
  public ntfy.sh (topic = code de partie) : aucun compte, aucun serveur de jeu, et l'hôte fait
  autorité sur l'état — le mot en cours n'est jamais transmis aux clients (seul le nombre de cartes
  restantes l'est), et le devineur ne reçoit pas les indices annulés.

## Règles implémentées

- 13 cartes par partie, un devineur à tour de rôle (toujours toi en solo).
- Chaque autre joueur, **en voyant le mot**, écrit **un seul mot** d'indice, en secret.
- Les indices **identiques sont annulés** avant d'être montrés au devineur.
- Le devineur n'a droit qu'à **une seule tentative**, ou peut **passer**.
- ✅ Bonne réponse : +1 point · ❌ mauvaise réponse : la carte en cours **et la suivante** sont perdues
  · 🤐 passer : seule la carte en cours est perdue.
- Variante 2–3 joueurs : **2 indices** écrits par joueur.
- Barème final sur 13 : 13 parfait 🏆 · 12 incroyable · 11 excellent · 9-10 très beau · 7-8 dans la
  moyenne · 4-6 bon début · 0-3 à retenter.
- Partie sauvegardée automatiquement (bouton « Continuer » à l'accueil) + meilleur score local.

## Utilisation

Ouvrir `index.html` dans un navigateur mobile, ou servir le dossier statiquement :

```bash
cd just-one
python3 -m http.server 8000
# puis ouvrir http://localhost:8000 sur le téléphone (même réseau)
```

Puis « Ajouter à l'écran d'accueil » : l'appli devient installable et fonctionne **hors-ligne**
(service worker) après le premier chargement.

## Structure

```
index.html            structure des écrans + règles
css/style.css         thème mobile (dark, tactile)
js/words.js           banque de 573 mots FR (sélection inspirée des listes Wikipédia « Articles vitaux » niveaux 2-3, mots trop simples du quotidien retirés) + indices d'un mot pour les robots
js/engine.js          moteur pur (navigateur + Node) : manches, doublons, score, barème, vue publique (anti-fuite du mot)
js/net.js             mode en ligne : WebRTC + signalisation ntfy.sh par code de partie
js/app.js             interface : écrans, pass-and-play, solo, en ligne, sauvegarde
manifest.webmanifest  + icon.svg + sw.js   packaging PWA / hors-ligne
tests/                tests Node du moteur et de la banque de mots
```

## Tests

```bash
node --test
```

## Fichiers livrés tels quels

Aucun outil de build : ouvrir directement `index.html` fonctionne aussi (sauf le service worker,
qui exige un contexte sécurisé — `localhost` ou HTTPS).
