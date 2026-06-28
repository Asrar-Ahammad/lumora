const fs = require('fs');
let code = fs.readFileSync('src/components/sidebar.tsx', 'utf-8');

// Insert useRef and useEffect near the top of Sidebar function
const hookCode = `
  const mobileNavRef = React.useRef<HTMLElement>(null);

  React.useEffect(() => {
    if (isMobileOpen && mobileNavRef.current) {
      // Small timeout to allow DOM to render before scrolling
      setTimeout(() => {
        if (!mobileNavRef.current) return;
        const activeElement = 
          mobileNavRef.current.querySelector('.bg-primary\\\\/10') || 
          mobileNavRef.current.querySelector('.bg-destructive\\\\/10');
          
        if (activeElement) {
          activeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 50);
    }
  }, [isMobileOpen, activeCategory]);
`;

code = code.replace(
  /const percentUsed = Math\.min/,
  hookCode + '\n  const percentUsed = Math.min'
);

// Add the ref to the mobile nav element
code = code.replace(
  /<nav className="flex-1 px-3 mt-4 overflow-y-auto space-y-6 pb-4">/,
  '<nav ref={mobileNavRef} className="flex-1 px-3 mt-4 overflow-y-auto space-y-6 pb-4">'
);

fs.writeFileSync('src/components/sidebar.tsx', code);
