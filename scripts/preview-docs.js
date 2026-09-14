#!/usr/bin/env node

/**
 * BZQ ERP Documentation & Mermaid Diagram Previewer
 * Extracts all Mermaid diagrams from a specified Markdown file and opens them
 * in the user's default browser with full styling and interactive rendering.
 */

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const defaultTarget = path.join(__dirname, '..', 'docs', 'PRODUCT_ROADMAP.md');
const argPath = process.argv[2];
const targetPath = argPath ? path.resolve(argPath) : defaultTarget;

if (!fs.existsSync(targetPath)) {
  console.error(`\x1b[31mError: Target file not found: ${targetPath}\x1b[0m`);
  process.exit(1);
}

const mdContent = fs.readFileSync(targetPath, 'utf8');
const mermaidRegex = /```mermaid\r?\n([\s\S]*?)\r?\n```/g;
const diagrams = [];
let match;

while ((match = mermaidRegex.exec(mdContent)) !== null) {
  diagrams.push(match[1]);
}

if (diagrams.length === 0) {
  console.log(`\x1b[33mNo Mermaid diagrams found in: ${path.relative(process.cwd(), targetPath)}\x1b[0m`);
  process.exit(0);
}

const htmlBlocks = diagrams.map((diagram, index) => `
  <section class="diagram-card">
    <div class="card-header">
      <span class="badge">Diagram ${index + 1}</span>
    </div>
    <div class="diagram-body">
      <pre class="mermaid">
${diagram}
      </pre>
    </div>
  </section>
`).join('\n');

const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>BZQ ERP - Diagram Preview</title>
  <style>
    :root {
      --bg: #f8fafc;
      --card-bg: #ffffff;
      --border: #e2e8f0;
      --text-main: #0f172a;
      --text-muted: #64748b;
      --primary: #2563eb;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background-color: var(--bg);
      color: var(--text-main);
      padding: 32px 16px;
      line-height: 1.5;
    }
    .container {
      max-width: 1080px;
      margin: 0 auto;
    }
    header {
      margin-bottom: 24px;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--border);
    }
    h1 {
      font-size: 1.75rem;
      font-weight: 700;
      color: var(--text-main);
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .file-path {
      font-size: 0.9rem;
      color: var(--text-muted);
      margin-top: 4px;
      font-family: monospace;
    }
    .diagram-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 12px;
      margin-bottom: 24px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.05);
      overflow: hidden;
    }
    .card-header {
      padding: 12px 20px;
      background: #f1f5f9;
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
    }
    .badge {
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      background: var(--primary);
      color: white;
      padding: 3px 8px;
      border-radius: 6px;
    }
    .diagram-body {
      padding: 24px;
      display: flex;
      justify-content: center;
      overflow-x: auto;
    }
  </style>
  <script type="module">
    import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs';
    mermaid.initialize({
      startOnLoad: true,
      theme: 'default',
      securityLevel: 'loose'
    });
  </script>
</head>
<body>
  <div class="container">
    <header>
      <h1>📊 BZQ ERP Diagram Viewer</h1>
      <div class="file-path">${path.relative(process.cwd(), targetPath)}</div>
    </header>
    ${htmlBlocks}
  </div>
</body>
</html>`;

const outPath = path.join(__dirname, '..', '.diagram-preview.html');
fs.writeFileSync(outPath, htmlContent, 'utf8');

console.log(`\x1b[32m✔ Rendered ${diagrams.length} diagram(s) to ${outPath}\x1b[0m`);

const openCommand = process.platform === 'darwin' ? `open "${outPath}"` :
                    process.platform === 'win32' ? `start "" "${outPath}"` :
                    `xdg-open "${outPath}"`;

exec(openCommand, (err) => {
  if (err) {
    console.error(`\x1b[33mCould not auto-launch browser. Open file manually: ${outPath}\x1b[0m`);
  } else {
    console.log(`\x1b[32m✔ Preview opened in default browser.\x1b[0m`);
  }
});
