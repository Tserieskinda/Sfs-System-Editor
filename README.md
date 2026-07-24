# SFS System Editor

**A browser-based solar system editor for Spaceflight Simulator**

# 🌐 **[Open in Browser — https://tserieskinda.github.io/Sfs-System-Editor/](https://tserieskinda.github.io/Sfs-System-Editor/)**
> Always up to date. No installation required. Works on PC and mobile.

---

## Getting Started (Online)

1. Go to the website above
2. Wait for assets to load automatically
3. Start editing — no zip upload needed

> **Slow connection?** Click Cancel on the asset loader and upload the assets zip manually, or see the offline section at the bottom.

---

## Features

### Viewport
- Renders planets with terrain, atmosphere, water, clouds, rings, and post-processing
- Zoom and pan with scroll wheel / touch drag, or **WASD** (PC)
- Double-click a planet to zoom to it
- **Body Search** — search and jump to any planet in large systems
- **Difficulty Viewer** — preview the system at different SFS difficulty levels (affects SOI display)
- **Environments toggle** (globe icon) — individually disable SOI circles, atmosphere, water, fog, post-processing, clouds, front clouds, and surface textures to reduce lag or isolate elements

### Toolbar
| Tool | Description |
|---|---|
| Drag Orbit | Physically drag a planet to reposition it; orbital values update automatically |
| High-Res Surface | Toggle high-resolution terrain rendering |
| Change Centre | Re-parent the system hierarchy around a different body |
| WASD Speed | Adjust camera pan speed |
| Icon Size | Control planet icon size when zoomed out |
| Lock Sidebar | Locks the editing panel open — useful on mobile when exploring |

### Editing Sidebar
Opens when you click a planet. Tabs include:

- **Basic** — name, mass, radius, colour, type
- **Orbit** — SMA, eccentricity, argument of periapsis, orbital direction
- **Terrain** — formula-based terrain with per-difficulty support and live preview
- **Heightmap** — upload PNG heightmaps with live updating; adjust terrain resolution percentage for performance
- **Atmosphere** — height, colour, fog, gradients
- **Water** — water level with land/water interaction preview
- **Clouds** — disc and front cloud layers with texture support
- **Rings** — ring system with inner/outer radius and texture
- **Post-processing** — bloom, sun flare, colour grading
- **Landmarks** — add named surface landmarks with angular position and width controls

### System Panel
- Set system name, author, and version
- Configure space center planet and location
- Adjust import/compatibility settings

### Assets
- Upload custom textures, heightmaps, and presets via the Assets button
- Textures are cached in IndexedDB and persist between sessions

### Procedural Tools (in Utils and Tools)
- - **Procedural Asteroids** — Procedural asteorid generator
- **Procedural Landmark Generator** — auto-place named landmarks based on terrain scan
- **Procgen System** — generate randomised solar systems with configurable star type, planet count, and distribution

### Featured Systems
- Load curated community systems directly from the Featured tab — no zip hunting required
- Includes SFS Default System by Team Curiosity, BGH by Cyn/Athlea Lyrae, HTSS by Hexastream, and more later

### Import & Export
- **Open Existing System** — load any SFS system by zipping its folder and uploading
- **Export** — downloads a ready-to-use system zip; make sure a space center is set or the system won't load in-game
- **Auto-save** — progress is periodically saved to IndexedDB so accidental closes don't wipe your work

### Extra Tools
- **Polar → Equirectangular transformer** — convert polar-projection textures for use as planet surfaces
- **Bump map / heightmap converter** Convert image to hieghtmap with matched planet texture at high resolution 
- **Asteroid drawing → heightmap tool**
Draw an asteroid, add add-on effects and applynto a body
---

## Performance Tips

- Disable post-processing and fog in the Environments toggle (globe icon) on weak devices
- Lower the terrain resolution percentage (next to the terrain button) when editing heightmaps
- Lock the sidebar on mobile while viewing planet terrain up close (opening the editing sidebar causes lag)
- Use a Chromium-based browser for best canvas performance

---

## Known Issues

- Heightmap rendering has some inaccuracies
- Water/land interaction is approximate
- Clouds are broken (persistent issue, help would be appreciated)
- Systems from SFS 1.4 and below are not supported

---

## Making Custom Presets

1. Get your custom body's `.txt` planet file and all textures it uses
2. Download the latest assets zip from [Releases](https://github.com/Tserieskinda/Sfs-System-Editor/releases)
3. Extract it
4. Place the `.txt` file in `Custom Presets/Planet Data/`
5. Place textures and heightmaps in their respective folders
6. Clear asset cache button in main menu, then reload site and Cancel the auto downloading, then upload manually in step 7.
7. Re-zip and load in the editor — your preset will appear in the list

---

## Offline / Local Setup (technical)

Only needed if you want to run without internet access. The online version at the link above is always preferred.

### Android
- Download project files drom github
- Either Use **Simple HTTP Server** (Play Store) and Enter the extracted editor folder,
- Copy paste the local address shown into your browser.
  ---
- Or use Speck editor, download code zip from github and open it in speck editor, then click run.

### PC
- Download project files from github and extract in a folder.
- Download python and type these two one by one in terminal.
```
cd "path\to\SFS Editor"

python -m http.server 8000
```
Then open `http://localhost:8000` in your browser and upload the assets zip.

### iPhone / Mac
Any app that can host a local web server. Exact steps vary by app.

---

## Credits

Thanks to **Hexastream** and **Neverger** (creator of TTS) and the Celestia community for the zip assets.

**Initial beta testers & contributors:** Krameter, Mistiy, ReoreyBoi, Akselajin, Cyn, Cresign, Razan T3, Hexastream  
**Promoter:** JJC Aerospace on YouTube  
**Code help:** Floating Fuel on forums (hieghtmap visualizer), SFS Forums community Advice and explanations on forums 
**Community:** [SFS Forums thread](https://sfsforum.com/index.php?threads/sfs-system-editor-beta.18444/)

> *Not responsible for unauthorised redistribution of someone else's system or the provided SFS assets.*  
> It is **99% vibecoded.**
> enjoy :)
