import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import './style.css';
import { registry } from './registry.js';
import { projectToWebMCP } from './webmcp.js';

// An agent in this tab (WebMCP) sees the same commands as the palette and the MCP
// server. A no-op until the browser has document.modelContext.
projectToWebMCP(registry);

const root = document.getElementById('root');
if (!root) throw new Error('No #root element');
createRoot(root).render(<App />);
