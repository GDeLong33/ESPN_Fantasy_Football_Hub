export type Frontmatter = Record<string, string>;

/**
 * Split a Markdown file into simple `key: value` frontmatter and body.
 * Only flat string values are supported, which is all story files need.
 */
export function parseFrontmatter(source: string): { meta: Frontmatter; body: string } {
  const text = source.replace(/^﻿/, '').replace(/\r\n/g, '\n');
  const match = /^---\n([\s\S]*?)\n---\n?/.exec(text);
  if (!match) return { meta: {}, body: text };

  const meta: Frontmatter = {};
  for (const line of match[1].split('\n')) {
    const idx = line.indexOf(':');
    if (idx <= 0 || line.trimStart().startsWith('#')) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (/^(["']).*\1$/.test(value)) value = value.slice(1, -1);
    meta[key] = value;
  }
  return { meta, body: text.slice(match[0].length) };
}
