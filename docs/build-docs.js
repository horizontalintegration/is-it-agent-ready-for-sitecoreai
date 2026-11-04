/*
 * build-docs.js — converts the page-check markdown docs into styled,
 * print-ready HTML (open in a browser → Print → Save as PDF).
 *
 * Zero dependencies. Scoped markdown parser covering exactly the
 * features used in these docs: headings, tables, bold, inline code,
 * unordered lists, horizontal rules, and paragraphs.
 *
 * Usage:  node docs/build-docs.js
 */
const fs = require('fs');
const path = require('path');

const esc = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Inline formatting: **bold**, `code`, [text](url)
function inline(s) {
  let out = esc(s);
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  return out;
}

function splitRow(line) {
  return line
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((c) => c.trim());
}

function mdToHtml(md) {
  const lines = md.split(/\r?\n/);
  const html = [];
  let i = 0;
  let inList = false;

  const closeList = () => {
    if (inList) {
      html.push('</ul>');
      inList = false;
    }
  };

  while (i < lines.length) {
    const line = lines[i];

    // Horizontal rule
    if (/^---+\s*$/.test(line)) {
      closeList();
      html.push('<hr/>');
      i++;
      continue;
    }

    // Headings
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      closeList();
      const level = h[1].length;
      html.push(`<h${level}>${inline(h[2])}</h${level}>`);
      i++;
      continue;
    }

    // Tables: header row | --- | rows
    if (/^\|.*\|/.test(line) && i + 1 < lines.length && /^\|?[\s:|-]+\|?$/.test(lines[i + 1])) {
      closeList();
      const header = splitRow(line);
      const aligns = splitRow(lines[i + 1]).map((c) => {
        const l = c.startsWith(':');
        const r = c.endsWith(':');
        return r && l ? 'center' : r ? 'right' : 'left';
      });
      html.push('<table><thead><tr>');
      header.forEach((c, idx) =>
        html.push(`<th style="text-align:${aligns[idx] || 'left'}">${inline(c)}</th>`)
      );
      html.push('</tr></thead><tbody>');
      i += 2;
      while (i < lines.length && /^\|.*\|/.test(lines[i])) {
        const cells = splitRow(lines[i]);
        html.push('<tr>');
        cells.forEach((c, idx) =>
          html.push(`<td style="text-align:${aligns[idx] || 'left'}">${inline(c)}</td>`)
        );
        html.push('</tr>');
        i++;
      }
      html.push('</tbody></table>');
      continue;
    }

    // Unordered list items
    const li = line.match(/^[-*]\s+(.*)$/);
    if (li) {
      if (!inList) {
        html.push('<ul>');
        inList = true;
      }
      html.push(`<li>${inline(li[1])}</li>`);
      i++;
      continue;
    }

    // Blank line
    if (/^\s*$/.test(line)) {
      closeList();
      i++;
      continue;
    }

    // Paragraph
    closeList();
    html.push(`<p>${inline(line)}</p>`);
    i++;
  }
  closeList();
  return html.join('\n');
}

const CSS = `
  :root { --accent:#5b34c4; --seo:#2563eb; --aeo:#16a34a; --geo:#9333ea; --ink:#1f2430; --muted:#5c6370; --line:#e3e6ec; }
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', system-ui, -apple-system, Arial, sans-serif; color: var(--ink); line-height: 1.55; max-width: 880px; margin: 0 auto; padding: 48px 40px; }
  h1 { font-size: 30px; border-bottom: 3px solid var(--accent); padding-bottom: 10px; margin-top: 0; }
  h2 { font-size: 22px; margin-top: 34px; padding-left: 12px; border-left: 5px solid var(--accent); }
  h3 { font-size: 17px; margin-top: 24px; color: var(--accent); }
  p { margin: 10px 0; }
  code { background: #f3f0fb; color: #6429c9; padding: 2px 6px; border-radius: 4px; font-family: 'Cascadia Code', Consolas, monospace; font-size: 0.88em; }
  a { color: var(--seo); text-decoration: none; }
  table { border-collapse: collapse; width: 100%; margin: 16px 0; font-size: 14px; }
  th { background: var(--accent); color: #fff; padding: 9px 12px; text-align: left; }
  td { padding: 8px 12px; border-bottom: 1px solid var(--line); vertical-align: top; }
  tr:nth-child(even) td { background: #faf9fe; }
  hr { border: none; border-top: 1px solid var(--line); margin: 26px 0; }
  ul { margin: 10px 0; padding-left: 22px; }
  li { margin: 5px 0; }
  strong { color: #2a2f3a; }
  blockquote { border-left: 4px solid var(--line); margin: 12px 0; padding: 4px 16px; color: var(--muted); }
  @media print {
    body { padding: 0; max-width: none; }
    h2, h3 { break-after: avoid; }
    table, tr { break-inside: avoid; }
    a { color: inherit; }
  }
`;

function wrap(title, body) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${title}</title>
<style>${CSS}</style>
</head>
<body>
${body}
</body>
</html>`;
}

const docs = [
  { md: 'PAGE-CHECKS-EXPLAINED.md', html: 'PAGE-CHECKS-EXPLAINED.html', title: 'Page Checks Explained — For Marketers' },
  { md: 'PAGE-CHECKS-TECHNICAL.md', html: 'PAGE-CHECKS-TECHNICAL.html', title: 'Page Checks — Technical Reference' },
  { md: 'PAGE-MATRIX-EXPLAINED.md', html: 'PAGE-MATRIX-EXPLAINED.html', title: 'Page Matrix Explained — For Marketers' },
  { md: 'PAGE-MATRIX-TECHNICAL.md', html: 'PAGE-MATRIX-TECHNICAL.html', title: 'Page Matrix — Technical Reference' },
  { md: 'SYMPOSIUM-DEMO-SCRIPT.md', html: 'SYMPOSIUM-DEMO-SCRIPT.html', title: 'Is It Agent-Ready? — Symposium Demo Script' },
];

const dir = __dirname;
for (const d of docs) {
  const src = path.join(dir, d.md);
  if (!fs.existsSync(src)) {
    console.log(`SKIP (missing): ${d.md}`);
    continue;
  }
  const md = fs.readFileSync(src, 'utf8');
  const out = wrap(d.title, mdToHtml(md));
  fs.writeFileSync(path.join(dir, d.html), out, 'utf8');
  console.log(`Built: docs/${d.html}`);
}
console.log('\nDone. Open the .html files in a browser and choose Print → Save as PDF.');
