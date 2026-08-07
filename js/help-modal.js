// Help Modal Handler
// Displays readme and usage information in a mobile-friendly modal

const HELP_CONTENT = `
<strong>🌍 SFS SYSTEM EDITOR</strong><br/><br/>
A browser-based tool for creating and editing planetary systems in Spaceflight Simulator.<br/><br/>

<strong>QUICK START</strong><br/>
• Click "NEW SYSTEM" to create a system from scratch<br/>
• Click "OPEN" to load a system file<br/>
• Click "FEATURED" to browse community systems<br/>
• Select a body in the viewport or left panel to edit it<br/><br/>

<strong>VIEWPORT CONTROLS</strong><br/>
• Drag to pan • Scroll to zoom • Right-click drag to rotate (3D view)<br/>
• Click a body to select it • Double-click to zoom to body<br/>
• Use toolbar buttons for grid, scale, and view options<br/><br/>

<strong>BODY EDITING</strong><br/>
Once a body is selected, edit its properties in the right sidebar:<br/>
• BASE: Radius, gravity, appearance<br/>
• ORBIT: Parent body, SMA, eccentricity (if orbiting)<br/>
• ATMOSPHERE: Height, density, visual effects<br/>
• TERRAIN: Heightmaps, ocean, surfaces<br/>
• VISUALS: Clouds, rings, auroras, post-processing<br/><br/>

<strong>TERRAIN EDITOR</strong><br/>
Create realistic planet surfaces with the height map system:<br/>
• Use built-in formulas (Perlin, ridged, layered)<br/>
• Or paste raw height data<br/>
• Different settings per difficulty (Normal, Hard, Realistic)<br/><br/>

<strong>TEXTURE CREATION</strong><br/>
• CREATE TEXTURES menu has tools for atmosphere, planets, daycycle textures<br/>
• Bump map converter: Turn height data into 3D-looking surfaces<br/>
• Texture remapper: Adjust colors and patterns<br/><br/>

<strong>PROCEDURAL GENERATION</strong><br/>
Click GENERATE to auto-create realistic systems:<br/>
• Random star type + planets<br/>
• Orbital mechanics automatically calculated<br/>
• Customize via seed and settings<br/><br/>

<strong>MULTIPLAYER (BETA)</strong><br/>
Edit a system together in real time:<br/>
• Click MULTIPLAYER to host or join a session<br/>
• No account needed • Peer-to-peer • Free<br/>
• Click bodies to claim them (lock others out during edit)<br/><br/>

<strong>ASSETS & PRESETS</strong><br/>
• Click "LOAD ASSETS" to import community textures and presets<br/>
• Assets are stored in your browser cache for offline use<br/>
• Featured systems include community creations<br/><br/>

<strong>EXPORT & SAVE</strong><br/>
• Click EXPORT to download your system (SFS file format)<br/>
• Auto-save keeps your work in browser storage<br/>
• Load any SFS system to edit and improve it<br/><br/>

<strong>SETTINGS</strong><br/>
Click the ⚙️ icon (top right) to customize:<br/>
• UI theme (gamelike, nebula, aurora)<br/>
• Accent color<br/>
• Sound effects volume<br/><br/>

<strong>FULLSCREEN</strong><br/>
Click the ⊡ icon (top right) to maximize viewport.<br/><br/>

<strong>KEYBOARD SHORTCUTS</strong><br/>
• Delete: Remove selected body<br/>
• Enter: Rename selected body<br/>
• Esc: Deselect / close modals<br/>
• Z: Toggle zoom-to-fit<br/><br/>

<strong>TIPS & TRICKS</strong><br/>
• Use the landmark system to mark surface features<br/>
• Post-processing keys add color grading at different heights<br/>
• AU distance rings help visualize orbital scales<br/>
• Difficulty scales let you tweak values per game mode<br/>
• Try the procgen system as a starting point, then customize<br/><br/>

<strong>TROUBLESHOOTING</strong><br/>
• Canvas not updating? Try zooming or panning<br/>
• File won't open? Make sure it's a valid SFS system file<br/>
• Assets not loading? Check your internet; cache is in browser storage<br/>
• Lost work? Check auto-save (usually in indexedDB)<br/><br/>

<strong>COMMUNITY</strong><br/>
• Share your systems via the editor's export feature<br/>
• Browse featured systems to see what others create<br/>
• Report bugs or request features on Discord/forums<br/><br/>

<strong>KEYBOARD TIPS</strong><br/>
• Text inputs update live — no need to click save<br/>
• Number inputs accept km, m, or AU (use suffix)<br/>
• Toggles apply instantly<br/>
• Sliders show preview in real time<br/><br/>

Need more help? Check featured systems or try the built-in tutorials!
`;

function openHelpModal(){
  const modal = document.getElementById('modal-help');
  if(!modal) return;
  
  // Populate help content if not already done
  const helpContent = document.getElementById('help-content');
  if(helpContent && !helpContent.hasContent){
    helpContent.innerHTML = HELP_CONTENT;
    helpContent.hasContent = true;
  }
  
  modal.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeHelpModal(){
  const modal = document.getElementById('modal-help');
  if(!modal) return;
  
  modal.classList.remove('open');
  document.body.style.overflow = '';
}

// Close help modal on Escape key
document.addEventListener('keydown', (e) => {
  if(e.key === 'Escape'){
    const modal = document.getElementById('modal-help');
    if(modal && modal.classList.contains('open')){
      closeHelpModal();
    }
  }
});

// Close help modal when clicking outside (on backdrop)
document.addEventListener('click', (e) => {
  const modal = document.getElementById('modal-help');
  if(!modal || !modal.classList.contains('open')) return;
  if(e.target === modal){
    closeHelpModal();
  }
});
