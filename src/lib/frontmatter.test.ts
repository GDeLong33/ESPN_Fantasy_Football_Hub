import { describe, expect, it } from 'vitest';
import { parseFrontmatter } from './frontmatter';

describe('parseFrontmatter', () => {
  it('reads flat keys and strips quotes', () => {
    const { meta, body } = parseFrontmatter(
      '---\ntitle: "Week 8: chaos"\ntag: Trade desk\ndate: 2026-10-27\n---\n\nHello *world*\n',
    );
    expect(meta).toEqual({ title: 'Week 8: chaos', tag: 'Trade desk', date: '2026-10-27' });
    expect(body).toBe('\nHello *world*\n');
  });

  it('handles CRLF line endings and a BOM', () => {
    const { meta, body } = parseFrontmatter('﻿---\r\ntitle: A\r\n---\r\nBody');
    expect(meta.title).toBe('A');
    expect(body).toBe('Body');
  });

  it('returns the whole text as body when there is no frontmatter', () => {
    expect(parseFrontmatter('Just text')).toEqual({ meta: {}, body: 'Just text' });
  });
});
