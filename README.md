<!-- // --- README.md --- -->

# 🐍 Slither Clone SIO ✨ - Archived Project

<p align="center">
  <img src="images/gameplay-screenshot.png" alt="Gameplay Screenshot" width="32%"/>
  <img src="images/menu-screenshot.png" alt="Main Menu Screenshot" width="32%"/>
  <img src="images/gameover-screenshot.png" alt="Game Over Screen Screenshot" width="32%"/>
</p>

**This project is archived and abandoned.** I spent many hours working on this multi-player Slither.io clone and was proud of what I accomplished, but now it's part of my past and I've moved on to other things. Feel free to use this code however you want - consider it public domain at this point. I likely won't touch this codebase again.

## 🌟 Key Features (Features Packed!)

This project isn't just a snake eating dots. Discover everything it has under the hood:

**🎮 Gameplay & User Experience:**

- **Real-time Multiplayer:** Compete against other players live thanks to Socket.IO.
- **High-Performance WebGL Rendering:** Smooth and reactive graphics handled by the client's GPU (`game-renderer.js`, `webgl-utils.js`).
- **Classic Movement:** Control your snake with the mouse.
- **Boost:** Accelerate to surprise your opponents (with size consumption and visual particles ✨).
- **Animated Food:** Food pellets that "breathe" and are attracted to players.
  - **Smart Spawn:** Players spawn in safer locations, evaluating multiple candidates to avoid immediate proximity to borders or large opponents (with fallback to random spawn). ✅
- **Precise Collision:** Optimized collision detection via `worker_threads` and point-segment algorithm.
- **Ghost Mode (Admin):** Mobile spectator with zoom, player selection, and moderation actions. 👻
- **WebGL Minimap:** Visualize the battlefield and nearby players.
- **Dynamic Leaderboard:** Real-time ranking (Top 10 displayed), sorted by status then size, with K/D ratio.
- **Notifications:** Player connect/disconnect messages (with anti-spam).
- **Admin Messages:** Broadcast messages to all players with a stylish "glitch" effect. 👾
- **Custom Game Over Screen:** End-game screen indicating the reason and final size.
- **2D Text Overlay:** Player names and indicators (frozen ❄️) rendered on a separate canvas.
- **Browser Zoom Prevention:** For an uninterrupted gaming experience.
- **Accessibility:** Keyboard navigation in menus.
- **Robust Offline Mode:** `offline.html` page with Snake minigame (ZQSD/WASD/Arrow controls) and automatic reconnection attempts (managed by Service Worker). PWA Ready! 📶
- **🌍 Internationalization (i18n):** User interface fully translated using `i18next`. Language is automatically detected from the browser, with fallbacks.
  - **Supported Languages (+30):**
    - 🇬🇧/🇺🇸 English (en)
    - 🇫🇷 French (fr)
    - 🇪🇸 Spanish (es)
    - 🇩🇪 German (de)
    - 🇨🇳 Chinese - Simplified (zh)
    - (Note: Full Right-to-Left layout for languages like Arabic, Persian, Urdu is planned but not yet implemented - see [Issue #10](https://github.com/mathe00/slither-clone-sio/issues/10))
    - 🇸🇦 Arabic (ar)
    - 🇧🇷/🇵🇹 Portuguese (pt)
    - 🇷🇺 Russian (ru)
    - 🇯🇵 Japanese (ja)
    - 🇮🇳 Hindi (hi)
    - 🇰🇷 Korean (ko)
    - 🇮🇹 Italian (it)
    - 🇹🇷 Turkish (tr)
    - 🇮🇩 Indonesian (id)
    - 🇵🇱 Polish (pl)
    - 🇮🇳 Bengali (bn)
    - 🇵🇰/🇮🇳 Urdu (ur)
    - 🇻🇳 Vietnamese (vi)
    - 🇹🇭 Thai (th)
    - 🇵🇭 Filipino (fil)
    - 🇮🇷/🇦🇫/🇹🇯 Persian (Farsi) (fa)
    - 🇲🇾/🇧🇳/🇸🇬 Malay (ms)
    - 🇳🇱/🇧🇪 Dutch (nl)
    - 🇺🇦 Ukrainian (uk)
    - 🇬🇷 Greek (el)
    - 🇸🇪 Swedish (sv) _(representing Scandinavian)_
    - 🇫🇮 Finnish (fi)
    - 🇭🇺 Hungarian (hu)
    - 🇷🇴 Romanian (ro)
    - 🇨🇿 Czech (cs)
    - 🌍 Swahili (sw)
    - 🌍 Hausa (ha)
    - 🇳🇬 Yoruba (yo)
    - 🇳🇬 Igbo (ig)
    - 🇹🇼/🇭🇰 Chinese - Traditional (zht)

**🎨 Advanced Customization:**

- **Snake Colors:** Choose the head and body color.
- **Complex Skins:**
  - **Single Color:** Classic and effective.
  - **Repeating Patterns:** Define up to 8 colors for a unique body pattern. 🎨
- **Trail Effects:** Add style to your wake with various particle effects (Sparkle, Smoke, Fire, Ice, Electric, Rainbow, Bubbles, Glitch, Void, Confetti)! ✨💨🔥🧊⚡🌈🫧👾🌌🎉
- **Custom Sounds:** Upload your own MP3 files for key events (death, kill, boost) via `localStorage`. 🔊

**🔒 Security & Administration:**

- **User Accounts:** Secure account creation (`bcrypt` hashing), persistent sessions (`httpOnly` cookies).
- **Full Admin System:**
  - Dedicated web interface (`admin.html`, localized via i18next) with tabs.
  - User management (CRUD, admin status, suspension).
  - Pruning of inactive accounts (with preview). 🧹
  - Server/game configuration editable live (some require restart).
  - View current configuration.
- **Admin Authentication:** Secure access via admin session.
- **Rate Limiting:** Limits account creation per IP.
- **Anti-Cheat:** Suspicious teleportation detection, self-collision check (configurable).
- **Security Modes (Collision):** Choice between `high` (server-side checks via workers, secure) and `low` (client-side checks, less secure). See technical details.
- **In-Game Moderation (Admin Ghost):** Kick, Ban (suspend + disconnect), Freeze/Unfreeze, Kill, Clear (removes without leaving food). 🚫

**🔧 Architecture & Tech Stack:**

- **Modular Node.js Backend:** Organized code (`apiRoutes.js`, `gameLogic.js`, `socketHandlers.js`, `serverLifecycle.js`). **Sends i18next keys** to the client for localized messages.
- **Modular JavaScript Client:** Separated logic (`game-main.js`, `game-renderer.js`, `webgl-utils.js`, `ui-logic.js`, `sound-manager.js`, `trail-effects.js`, `admin-logic.js`). **`ui-logic.js` and `admin-logic.js` handle i18next initialization and UI text rendering.**
- **Clean Express API:** Dedicated routes for authentication, customization, administration. **API responses use i18next keys for feedback.**
- **Performance Optimizations:**
  - `worker_threads` for intensive collision calculations.
  - Spatial Grid (`SpatialGrid`) to optimize nearby entity searches.
  - Area of Interest (AoI): Only sends relevant data around the client.
  - Optimized WebGL rendering.
- **Server Lifecycle Management:** Clean startup/shutdown, `server.lock` management.
- **Flexible Configuration:** Server and game settings managed via `config.json`.
- **Data Persistence:** Accounts (`accounts.json`) and sessions (`sessions.json`) saved.
- **Internationalization:** `i18next` library with JSON files in `/public/locales/`.
- **Progressive Web App (PWA):** Service Worker (`service-worker.js`) caches core assets, **including locale files and i18next libraries**, for offline functionality (localized offline page).

## ⚙️ Technical Deep Dive

Some key mechanisms explained:

- **Snake Rendering (WebGL):**
  Each snake is represented by an array of segments (`trail`). The current WebGL renderer (`game-renderer.js`) draws each segment as a colored quad. The size of the segments (`segmentRadius`) and head (`headRadius`) is calculated dynamically based on the player's `maxTrailLength` (logarithmically for a pleasant visual effect). Eyes are also drawn procedurally as overlapping quads. Rendering uses matrices (Model-View-Projection) managed by `webgl-utils.js` to position, orient, and scale each part.

- **Trail Effects (Particles):**
  The `trail-effects.js` module defines "spawner" functions for each effect type. When a snake moves (and depending on the effect chosen in `skinData`), `game-main.js` periodically calls the appropriate spawn function. This function generates data for one or more particles (initial position, velocity, lifespan, color, size, type). These particles are stored in the `particles` array of the player object. The rendering loop (`game-renderer.js`) updates the position and opacity of each particle and draws them (often as simple quads with additive blending for glow effects).

- **Real-time Communication (Socket.IO & Alternatives):**
  Socket.IO is currently used for bidirectional communication. It handles sending client inputs, broadcasting the game state (via AoI), notifications, etc.
  - **Client -> Server:** `mouse_move`, `boost`, `joinGame`, `clientCollisionDetected` (`low` mode), admin actions...
  - **Server -> Client(s):** `state`, `leaderboard`, `gameOver` (with i18next keys), `mapSizeUpdate`, `adminMessage`, various notifications (with i18next keys)...
  - **Scalability:** For a very large number of concurrent players, Socket.IO (based on TCP) could become a bottleneck. Alternatives like **WebRTC** (for P2P or via SFU) or **WebTransport** (based on HTTP/3 and QUIC, allowing unreliable and ordered/unordered UDP streams) could offer superior performance but would significantly complicate the network architecture.

- **Collision Detection & Security Modes (`high`, `medium`, `low`):**
  The server can operate in three distinct security modes, configurable via `config.json` or the admin panel (`/admin`), primarily affecting collision handling and anti-cheat:
  - **`high` Mode:** This mode offers the highest level of security and fairness.
    - **Head-Body Collision:** Detection is performed **server-side** authoritatively for **all players** (including admins playing normally). Dedicated workers (`collisionWorker.js`) calculate the distance between a player's head and the **line segments** forming the trail of nearby opponents (point-segment detection, more precise). The server solely determines if a collision occurred.
    - **Anti-Cheat (Teleportation):** The server uses a **standard** tolerance (`TELEPORT_TOLERANCE_FACTOR`) to detect suspicious movements for all players.
    - **Usage:** Recommended for situations requiring maximum cheat prevention, though it may impose a higher server load with many players.
  - **`medium` Mode (Recommended for Production):** This mode provides a balance between security and performance by trusting admin players for their own collision detection.
    - **Head-Body Collision (Non-Admins):** Detection for non-admin players is performed **server-side** authoritatively via workers, similar to `high` mode.
    - **Head-Body Collision (Admins):** Admin players (when not in ghost mode) perform their own collision detection **client-side**. If an admin's client detects a collision for the admin, it sends a `clientCollisionDetected` message to the server, which then trusts this message. This reduces server load for admin players.
    - **Anti-Cheat (Teleportation):** The server uses a **standard** tolerance (`TELEPORT_TOLERANCE_FACTOR`) for non-admin players and an **increased** tolerance (`TELEPORT_TOLERANCE_FACTOR * 1.2`) for admin players, making it slightly more lenient for admins regarding potential lag-induced "teleports".
    - **Usage:** This is the **recommended mode for most production environments** as it maintains server-side authority for regular players while offloading some computation for trusted admin users, offering a good compromise. 👍
  - **`low` Mode (Client + Lightweight / Insecure):** This mode delegates most collision logic to the client to significantly reduce server load, at the cost of security.
    - **Head-Body Collision:** Detection is performed **client-side** for **all players** (`game-main.js`). The player's browser checks if its own head touches the points of other players' trails (point-point detection, less precise). If a collision is detected, the client sends a `clientCollisionDetected` message to the server. **The server trusts this message** and triggers the player's death without performing its own collision check via workers.
    - **Anti-Cheat (Teleportation):** The server uses an **increased** tolerance (`TELEPORT_TOLERANCE_FACTOR * 1.2`) for all players to detect suspicious movements, reducing the risk of kicking legitimate players due to lag but making cheat detection less effective.
    - **Usage:** Primarily intended for **debugging**, testing, or private games among trusted players. **This mode is inherently insecure and highly vulnerable to cheating**, as a modified client can simply choose not to send the collision message. ⚠️
  - **Optimization (Workers & Spatial Grid):** In `high` and `medium` modes (for non-admins), the server uses a `SpatialGrid` to optimize nearby entity searches. This data is then sent to `worker_threads` for precise head-body collision calculations, avoiding blocking the main Node.js thread.

- **Skin System:**
  Skin information is stored in the `skinData` object within `accounts.json` for registered players.
  ```json
  "skinData": {
    "bodyType": "pattern", // "single" or "pattern"
    "bodyColor": "#44ff00", // Base color or for 'single' type
    "patternColors": ["#b739f4", "#9fc93f", ...], // Array of colors for 'pattern'
    "trailEffect": "glitch" // Name of the trail effect
  }
  ```
  This data is sent to the client during `joinGame` (for logged-in players) or directly by the client (for temporary players). The server includes it in `state` messages. The client (`game-renderer.js`) uses `skinData` to choose how to draw the body (single color or alternating `patternColors`), and `game-main.js` uses it to trigger the correct particle effect via `trail-effects.js`. The head color (`headColor`) is stored separately in `accounts.json` but managed alongside `skinData` in forms and the `/updateSkin` API.

## 🗺️ Project Status: Archived

**This project is no longer maintained.** What started as a fun experiment to create a multi-player Slither.io clone has reached its conclusion. While I'm proud of what I built - a fully functional game with real-time multiplayer, internationalization, admin features, and more - I've moved on to other interests and won't be continuing development.

The unique selling point of this clone was its multiplayer functionality, which was the main reason I built it (tired of trying to coordinate 1v1s on public servers). I put countless hours into coding and vibing with this project, and while it was a great learning experience, it's now time to let it go.

**Feel free to fork, modify, or use any part of this codebase for whatever you want.** No permission needed, no attribution required. Consider it abandoned to the public domain.

## 🤔 Final Thoughts

This project was a personal adventure into web game development, largely achieved with the help of AI (Google's Gemini 2.5 Pro and its impressive ability to handle large code contexts!). I'm not a professional developer, just an enthusiast who tinkered and learned by doing. 😅

The code isn't perfect by the strictest professional standards, but it works and integrates an impressive number of features, including full internationalization. The main goal was to explore possibilities and have fun - and I definitely accomplished that.

**Since this project is archived, I won't be accepting contributions or issues.** The codebase is here as-is, a snapshot of a fun learning experiment. If you find it useful or interesting, feel free to take it and run with it in your own direction!

## 💖 Support (No Longer Needed)

Since this project is archived and I've moved on to other things, **I'm no longer accepting donations**. I appreciate the thought, but please keep your money or support other active projects that could use it more!

I had a lot of fun building this and learned a tremendous amount along the way. That journey was reward enough.

## 🚀 Quick Start (For the Curious)

While I won't be providing support, if you're curious about the project and want to see it in action:

1.  **Prerequisites:** Node.js (version 18.x or higher recommended) and npm
2.  **Clone the Repository:**
    ```bash
    git clone https://github.com/mathe00/slither-clone-sio.git
    cd slither-clone-sio
    ```
3.  **Install Dependencies:**
    ```bash
    npm install
    ```
4.  **Start the Server:**
    ```bash
    node backend/server.js
    ```
5.  **Play!** Open your browser to `http://localhost:3000`

*Note: I can't guarantee this will work perfectly with future Node.js versions or system configurations, but it should give you a sense of what the project was all about.*

## 📜 License

Since this project is archived, consider it **public domain**. Do whatever you want with it - no attribution needed, no restrictions. The original MIT license still applies if you want to be formal about it.

---

Thanks for checking out this project! It was a blast to build, and I hope someone finds the code useful or inspiring. Time to move on to new adventures! 🐍✨
