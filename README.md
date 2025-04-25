# 🐍 Slither Clone SIO ✨ - A Full-Stack & Supercharged Slither.io Clone!

![Gameplay Screenshot](placeholder-screenshot.png) <!-- TODO: Add a real screenshot! -->

Welcome to **Slither Clone SIO**, a modern and feature-rich reinterpretation of the classic Slither.io game. Developed entirely in JavaScript with Node.js, Express, Socket.IO, and **WebGL** for ultra-performant client-side rendering, this project goes beyond a simple clone. It integrates a robust architecture, advanced customization features, a comprehensive admin system, and optimizations for a smooth and engaging gaming experience. 🚀

---
## 🌟 Key Features (Features Packed!)
This project isn't just a snake eating dots. Discover everything it has under the hood:

**🎮 Gameplay & User Experience:**
*   **Real-time Multiplayer:** Compete against other players live thanks to Socket.IO.
*   **High-Performance WebGL Rendering:** Smooth and reactive graphics handled by the client's GPU (`game-renderer.js`, `webgl-utils.js`).
*   **Classic Movement:** Control your snake with the mouse.
*   **Boost:** Accelerate to surprise your opponents (with size consumption and visual particles ✨).
*   **Animated Food:** Food pellets that "breathe" and are attracted to players.
*   **Precise Collision:** Optimized collision detection via `worker_threads` and point-segment algorithm.
*   **Ghost Mode (Admin):** Mobile spectator with zoom, player selection, and moderation actions. 👻
*   **WebGL Minimap:** Visualize the battlefield and nearby players.
*   **Dynamic Leaderboard:** Real-time ranking (Top 10 displayed), sorted by status then size, with K/D ratio.
*   **Notifications:** Player connect/disconnect messages (with anti-spam).
*   **Admin Messages:** Broadcast messages to all players with a stylish "glitch" effect. 👾
*   **Custom Game Over Screen:** End-game screen indicating the reason and final size.
*   **2D Text Overlay:** Player names and indicators (frozen ❄️) rendered on a separate canvas.
*   **Browser Zoom Prevention:** For an uninterrupted gaming experience.
*   **Accessibility:** Keyboard navigation in menus.
*   **Robust Offline Mode:** `offline.html` page with Snake minigame (ZQSD/WASD/Arrow controls) and automatic reconnection attempts (managed by Service Worker). PWA Ready! 📶

**🎨 Advanced Customization:**
*   **Snake Colors:** Choose the head and body color.
*   **Complex Skins:**
    *   **Single Color:** Classic and effective.
    *   **Repeating Patterns:** Define up to 8 colors for a unique body pattern. 🎨
*   **Trail Effects:** Add style to your wake with various particle effects (Sparkle, Smoke, Fire, Ice, Electric, Rainbow, Bubbles, Glitch, Void, Confetti)! ✨💨🔥🧊⚡🌈🫧👾🌌🎉
*   **Custom Sounds:** Upload your own MP3 files for key events (death, kill, boost) via `localStorage`. 🔊

**🔒 Security & Administration:**
*   **User Accounts:** Secure account creation (`bcrypt` hashing), persistent sessions (`httpOnly` cookies).
*   **Full Admin System:**
    *   Dedicated web interface (`admin.html`) with tabs (some to be restored).
    *   User management (CRUD, admin status, suspension).
    *   Pruning of inactive accounts (with preview). 🧹
    *   Server/game configuration editable live (some require restart).
    *   View current configuration.
*   **Admin Authentication:** Secure access via admin session.
*   **Rate Limiting:** Limits account creation per IP.
*   **Anti-Cheat:** Suspicious teleportation detection, self-collision check (configurable).
*   **Security Modes (Collision):** Choice between `high` (server-side checks via workers, secure) and `low` (client-side checks, less secure). See technical details.
*   **In-Game Moderation (Admin Ghost):** Kick, Ban (suspend + disconnect), Freeze/Unfreeze, Kill, Clear (removes without leaving food). 🚫

**🔧 Architecture & Tech Stack:**
*   **Modular Node.js Backend:** Organized code (`apiRoutes.js`, `gameLogic.js`, `socketHandlers.js`, `serverLifecycle.js`).
*   **Modular JavaScript Client:** Separated logic (`game-main.js`, `game-renderer.js`, `webgl-utils.js`, `ui-logic.js`, `sound-manager.js`, `trail-effects.js`).
*   **Clean Express API:** Dedicated routes for authentication, customization, administration.
*   **Performance Optimizations:**
    *   `worker_threads` for intensive collision calculations.
    *   Spatial Grid (`SpatialGrid`) to optimize nearby entity searches.
    *   Area of Interest (AoI): Only sends relevant data around the client.
    *   Optimized WebGL rendering.
*   **Server Lifecycle Management:** Clean startup/shutdown, `server.lock` management.
*   **Flexible Configuration:** Server and game settings managed via `config.json`.
*   **Data Persistence:** Accounts (`accounts.json`) and sessions (`sessions.json`) saved.

---
## ⚙️ Technical Deep Dive
Some key mechanisms explained:

*   **Snake Rendering (WebGL):**
    Each snake is represented by an array of segments (`trail`). The current WebGL renderer (`game-renderer.js`) draws each segment as a colored quad. The size of the segments (`segmentRadius`) and head (`headRadius`) is calculated dynamically based on the player's `maxTrailLength` (logarithmically for a pleasant visual effect). Eyes are also drawn procedurally as overlapping quads. Rendering uses matrices (Model-View-Projection) managed by `webgl-utils.js` to position, orient, and scale each part.

*   **Trail Effects (Particles):**
    The `trail-effects.js` module defines "spawner" functions for each effect type. When a snake moves (and depending on the effect chosen in `skinData`), `game-main.js` periodically calls the appropriate spawn function. This function generates data for one or more particles (initial position, velocity, lifespan, color, size, type). These particles are stored in the `particles` array of the player object. The rendering loop (`game-renderer.js`) updates the position and opacity of each particle and draws them (often as simple quads with additive blending for glow effects).

*   **Real-time Communication (Socket.IO & Alternatives):**
    Socket.IO is currently used for bidirectional communication. It handles sending client inputs, broadcasting the game state (via AoI), notifications, etc.
    *   **Client -> Server:** `mouse_move`, `boost`, `joinGame`, `clientCollisionDetected` (`low` mode), admin actions...
    *   **Server -> Client(s):** `state`, `leaderboard`, `gameOver`, `mapSizeUpdate`, `adminMessage`, various notifications...
    *   **Scalability:** For a very large number of concurrent players, Socket.IO (based on TCP) could become a bottleneck. Alternatives like **WebRTC** (for P2P or via SFU) or **WebTransport** (based on HTTP/3 and QUIC, allowing unreliable and ordered/unordered UDP streams) could offer superior performance but would significantly complicate the network architecture.

*   **Collision Detection & Security Modes (`high` vs `low`):**
    The server can operate in two distinct security modes, configurable via `config.json` or the admin panel (`/admin`), primarily affecting collision handling and anti-cheat:
    *   **`high` Mode (Recommended):** This is the default mode, designed for the best security and fairness.
        *   **Head-Body Collision:** Detection is performed **server-side** authoritatively. Dedicated workers (`collisionWorker.js`) calculate the distance between a player's head and the **line segments** forming the trail of nearby opponents (point-segment detection, more precise). The server solely determines if a collision occurred.
        *   **Anti-Cheat (Teleportation):** The server uses a **standard** tolerance (`TELEPORT_TOLERANCE_FACTOR`) to detect suspicious movements, making it more sensitive to teleportation cheat attempts.
        *   **Security Improvement Ideas:** Even stricter validation of client inputs, detection of suspicious movement patterns (bots, macros), analysis of action consistency over time.
        *   **Usage:** Ideal for public servers or when fairness and cheat prevention are priorities. 👍
    *   **`low` Mode (Client + Lightweight / Insecure):** This mode delegates part of the logic to the client to reduce server load, at the cost of security.
        *   **Head-Body Collision:** Detection is performed **client-side** (`game-main.js`). The player's browser checks if its own head touches the points of other players' trails (point-point detection, less precise). If a collision is detected, the client sends a `clientCollisionDetected` message to the server. **The server trusts this message** and triggers the player's death without performing its own collision check via workers.
        *   **Anti-Cheat (Teleportation):** The server uses an **increased** tolerance (`TELEPORT_TOLERANCE_FACTOR * 1.2`) to detect suspicious movements, reducing the risk of kicking legitimate players due to lag but making cheat detection less effective.
        *   **Performance Improvement Ideas:** Send less data in `state` messages (e.g., simplified trails for distant players?), use binary data formats (e.g., Protocol Buffers, MessagePack) instead of JSON to reduce message size.
        *   **Usage:** Primarily intended for **debugging**, testing, or private games among trusted players. **This mode is inherently insecure and highly vulnerable to cheating**, as a modified client can simply choose not to send the collision message. ⚠️
    *   **Optimization (Workers & Spatial Grid):** In both modes, the server uses a `SpatialGrid` to optimize nearby entity searches. In `high` mode, this data is then sent to `worker_threads` for precise head-body collision calculations, avoiding blocking the main Node.js thread.

*   **Skin System:**
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

---
## 🗺️ Roadmap & Future Ideas
This project is a solid foundation, but here are some potential improvements and planned fixes:

### ✅ To-Do (Priority)
*   **Optimization & Scalability:**
    *   [ ] **Socket Performance:** Evaluate and potentially enhance the Socket.IO server's capacity to handle a large number of concurrent players.
        *   *Ideas:* Node.js profiling, message optimization (frequency, size, binary format?), clustering Node.js, consider WebTransport/WebRTC for >1000 player scenarios?
    *   [ ] **AoI (Area of Interest) Precision:** Currently, AoI only considers the *head* position of other players. A player whose tail is the only part within the AoI won't be visible, potentially causing unfair deaths.
        *   *Approach 1:* Send the full data of a player as soon as *any* part of their body (trail) enters the client's AoI. Simple but potentially higher bandwidth usage.
        *   *Approach 2:* Send only the *part* of the trail that is visible within the AoI. More complex to manage server and client-side (truncating/reconstructing trails) but more bandwidth-efficient.
*   **UI (User Interface):**
    *   [ ] **Simplify Main Menu:** Reorganize/group buttons for a less cluttered and more intuitive interface.
    *   [ ] **Restore Admin Panel Tabs:** Reintegrate missing tabs (likely related to specific features removed or planned).
*   **Gameplay:**
    *   [ ] **Boost Particle Consistency:** Particles generated during boost should have the same appearance/type as standard food or be a distinct but visually consistent type.

### ⏳ Future Improvements (Lower Priority)
*   [ ] **Rendering Engine Migration:**
    *   [ ] Explore migrating the client-side rendering from the current custom WebGL implementation to a dedicated game framework like **Phaser**.
    *   *Rationale:* Phaser could simplify development (scene management, sprites, physics helpers), potentially offer comparable or better performance depending on usage, and benefit from a larger community and ecosystem. This would involve a significant refactor of `game-renderer.js`, `webgl-utils.js`, and parts of `game-main.js`.
*   [ ] **Advanced Gameplay:**
    *   [ ] Add optional power-ups (temporary invincibility, food magnet, etc.) configurable via the admin panel.
    *   [ ] Create a Battle Royale mode with a progressively shrinking zone.
*   [ ] **Internationalization (i18n):**
    *   [ ] Implement a translation system for all user-visible text (labels, messages, UI elements, etc.).
    *   *Target Languages:* English, French, Spanish, German, and potentially more. 🌍
    *   *Ideas:* Use an i18n library (like `i18next`) with JSON translation files per language. Detect browser language or allow user selection.
*   [ ] **Code Refactoring & Cleanup:**
    *   [ ] Full code review to improve comments (in English), remove obsolete development comments ("FIN modification", "ajout ici", etc.).
    *   [ ] Ensure consistent JSDoc documentation for important functions.
    *   [ ] Standardize code style further if necessary.

---
## 🤔 Creator's Note & Contributions
This project is a personal adventure into web game development, largely achieved with the help of AI (Google's Gemini 2.5 Pro and its impressive ability to handle large code contexts!). I'm not a professional developer, just an enthusiast tinkering and learning by doing. 😅

The code isn't perfect by the strictest professional standards, but it works and integrates an impressive number of features. The main goal was to explore possibilities and have fun.

**Contributions are welcome!** If you're an experienced developer (or even a motivated beginner!) and see areas for improvement, bugs to fix, or want to implement one of the roadmap ideas (like the Phaser migration!), feel free to open an *Issue* or a *Pull Request* on the GitHub repository. Your help would be greatly appreciated! 🙏

---
## 🚀 Quick Start
1.  **Prerequisites:** Ensure you have [Node.js](https://nodejs.org/) (version 18.x or higher recommended) and npm installed.
2.  **Clone the Repository:**
    ```bash
    git clone https://github.com/mathe00/slither-clone-sio.git
    cd slither-clone-sio
    ```
3.  **Install Dependencies:**
    ```bash
    npm install
    ```
4.  **Configuration (Optional but Recommended):**
    *   The `backend/config.json` file will be created with default values on the first run if it doesn't exist.
    *   **Admin Password:** To set the admin password for the first time or reset it, stop the server and run:
        ```bash
        node backend/server.js --set-new-password YOUR_SECRET_PASSWORD
        ```
    *   Adjust other settings in `backend/config.json` as needed (map size, FPS, etc.).
5.  **Start the Server:**
    ```bash
    npm start
    # Or: node backend/server.js
    ```
6.  **Play!** Open your browser and navigate to `http://localhost:3000` (or the configured port).

---
## 📜 License
This project is distributed under the **MIT License**. See the `LICENSE` file (to be added if needed) or [choosealicense.com/licenses/mit/](https://choosealicense.com/licenses/mit/) for more details.

---
Have fun growing your snake! 🐍🎉
