const fs = require('fs');
let code = fs.readFileSync('src/components/settings-panel.tsx', 'utf-8');

// Replace SettingsModal with SettingsPanel
code = code.replace(/export function SettingsModal/g, "export function SettingsPanel");
code = code.replace(/interface SettingsModalProps/g, "interface SettingsPanelProps");
code = code.replace(/SettingsModalProps/g, "SettingsPanelProps");

// Remove isOpen and onClose from props
code = code.replace(/isOpen,\s*onClose,\s*/, "");
code = code.replace(/isOpen:\s*boolean;\s*onClose:\s*\(\)\s*=>\s*void;/g, "");

// Remove if (!isOpen) return null; check
code = code.replace(/if \(!isOpen\) return;\n/g, "");
code = code.replace(/if \(!isOpen\) return null;/g, "");

// Modify the returned layout
const modalLayoutStr = `<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-background border border-border shadow-2xl rounded-2xl w-full max-w-lg flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card">
          <div className="flex items-center gap-2">
            <Gear size={22} className="text-primary" />
            <h2 className="text-base font-semibold text-foreground">Settings</h2>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6 overflow-y-auto max-h-[70vh]">`;

const panelLayoutStr = `<div className="flex-1 overflow-y-auto p-4 md:p-6 flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Gear size={22} weight="fill" className="text-primary" />
          </div>
          <h2 className="text-lg font-semibold text-foreground tracking-tight">
            Settings
          </h2>
        </div>
      </div>

      <div className="max-w-2xl w-full space-y-8 pb-10">`;

code = code.replace(modalLayoutStr, panelLayoutStr);

// The end of the file needs adjusting to close the <div>s correctly
const endModalStr = `            </div>
          </div>
        </div>
      </div>
    </div>
  )
}`;
const endPanelStr = `            </div>
          </div>
      </div>
    </div>
  )
}`;
code = code.replace(endModalStr, endPanelStr); // Roughly replaces the closing tags if they match, or we'll just fix the last 5 divs

fs.writeFileSync('src/components/settings-panel.tsx', code);
