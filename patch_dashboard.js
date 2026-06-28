const fs = require('fs');
let code = fs.readFileSync('src/components/dashboard-client.tsx', 'utf-8');

// Replace import
code = code.replace(/import { SettingsModal } from "\.\/settings-modal";/, 'import { SettingsPanel } from "./settings-panel";');

// In sidebar and topbar, change onSettingsClick
code = code.replace(/onSettingsClick=\{\(\) => setIsSettingsOpen\(true\)\}/g, 'onSettingsClick={() => setActiveCategory("settings")}');

// Remove isSettingsOpen state entirely
code = code.replace(/const \[isSettingsOpen, setIsSettingsOpen\] = React\.useState\(false\);\n/g, "");

// Add settings to the tab view logic
// Find where we check activeCategory for rendering main content:
//       ) : activeCategory === "trash" ? (
//         <TrashPanel ... />
//       ) : ...
const renderLogic = `          ) : activeCategory === "trash" ? (
            <TrashPanel`;
const replaceLogic = `          ) : activeCategory === "settings" ? (
            <SettingsPanel 
              aiSearchEnabled={isAISearch}
              onToggleAISearch={async (enabled) => {
                const res = await fetch("/api/user/settings", {
                  method: "POST",
                  body: JSON.stringify({ aiSearchEnabled: enabled }),
                });
                if (res.ok) setIsAISearch(enabled);
              }}
            />
          ) : activeCategory === "trash" ? (
            <TrashPanel`;

code = code.replace(renderLogic, replaceLogic);

// Remove the SettingsModal rendered at the bottom
// 
//       {/* Settings Modal */}
//       <SettingsModal ... />
const settingsModalRenderStr = `      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        aiSearchEnabled={isAISearch}
        onToggleAISearch={async (enabled) => {
          try {
            setIsSettingsOpen(false); // Close modal during update to prevent UI glitches if needed, but we do optimistic locally anyway
            // wait, we update via DashboardClient state, which is passed down.
            // Actually the SettingsModal also fetches. Let's just pass the setter
            const res = await fetch("/api/user/settings", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ aiSearchEnabled: enabled }),
            });
            if (res.ok) {
              setIsAISearch(enabled);
            } else {
              throw new Error("Failed to save setting");
            }
          } catch (err) {
            console.error(err);
            throw err;
          }
        }}
      />`;
code = code.replace(settingsModalRenderStr, "");

fs.writeFileSync('src/components/dashboard-client.tsx', code);
