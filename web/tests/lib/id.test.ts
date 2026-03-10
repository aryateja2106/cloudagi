import { describe, test, expect } from 'bun:test';
import { generateId } from '../../src/lib/id.js';

describe('generateId', () => {
  test('generated ID starts with the given prefix', () => {
    const id = generateId('lst');
    expect(id.startsWith('lst')).toBe(true);
  });

  test('generated ID has correct format: prefix_12chars', () => {
    const id = generateId('lst');
    // format: <prefix>_<12 alphanumeric chars>
    expect(id).toMatch(/^lst_[A-Za-z0-9]{12}$/);
  });

  test('generated IDs are unique across 100 calls', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(generateId('lst'));
    }
    expect(ids.size).toBe(100);
  });

  test('works with different prefixes: lst, ord, usr', () => {
    const lst = generateId('lst');
    const ord = generateId('ord');
    const usr = generateId('usr');

    expect(lst.startsWith('lst_')).toBe(true);
    expect(ord.startsWith('ord_')).toBe(true);
    expect(usr.startsWith('usr_')).toBe(true);
  });

  test('suffix contains only alphanumeric characters after the prefix', () => {
    const id = generateId('usr');
    const suffix = id.slice('usr_'.length);
    expect(suffix).toMatch(/^[A-Za-z0-9]+$/);
  });
});
