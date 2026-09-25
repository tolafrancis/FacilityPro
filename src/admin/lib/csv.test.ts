import { describe, expect, it } from 'vitest';
import { csvCell, toCsv } from './csv';

describe('CSV export', () => {
  it('quotes commas, quotes and line breaks', () => {
    expect(csvCell('Saigon, Tower')).toBe('"Saigon, Tower"');
    expect(csvCell('The "Best" Co')).toBe('"The ""Best"" Co"');
    expect(csvCell('two\nlines')).toBe('"two\nlines"');
    expect(csvCell(null)).toBe('');
    expect(csvCell(42)).toBe('42');
  });

  it('neutralises spreadsheet formulas in text cells', () => {
    expect(csvCell('=HYPERLINK("http://evil")')).toBe(`"'=HYPERLINK(""http://evil"")"`);
    expect(csvCell('+1234')).toBe("'+1234");
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(csvCell(-5)).toBe('-5');
  });

  it('builds a UTF-8 file with a header row', () => {
    const csv = toCsv([{ n: 'Công ty Á', u: 3 }], [
      { header: 'Name', value: (r) => r.n },
      { header: 'Users', value: (r) => r.u },
    ]);
    expect(csv).toBe('﻿Name,Users\r\nCông ty Á,3\r\n');
  });
});
