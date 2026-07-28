=== Bluff Game (Online Multiplayer) ===
Repo: https://github.com/aliam664/Sh
Live: https://aliam664.github.io/Sh/
Tech: HTML5, CSS3, JS ES6+, Firebase (Auth/Firestore/Realtime), PWA.
Files: index.html, login.html, lobby.html, room.html, game.html, profile.html, css/style.css, css/responsive.css, js/firebase-config.js, js/firebase-auth.js, js/database.js, js/room.js, js/game-engine.js, js/ui.js, js/questions.js, js/security.js, manifest.json, service-worker.js.
Deployment: GitHub Pages from branch arena/019faa08-sh.
Connection: Add Firebase Config to js/firebase-config.js.
Online Play: Anonymous Auth -> Name -> Lobby (Create/Join Room with 6-char code) -> Real-time Game using onSnapshot.
Status: Core scaffold done. Full online play requires database, engine, and security rules to be completed.
