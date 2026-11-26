import { describe, expect, it } from 'vitest';

import {
  formatInr,
  formatPaise,
  paiseFromRupees,
  paiseToRupeesString,
  rupeesToPaise,
  toPaise,
} from '@/domain/money';

describe('integer paise money helpers', () => {
  it('creates paise only from safe integers', () => {
    expect(toPaise(0)).toBe(0);
    expect(() => toPaise(12.5)).toThrow(RangeError);
    expect(() => toPaise(Number.MAX_SAFE_INTEGER + 1)).toThrow(RangeError);
  });

  it('converts rupee strings exactly to paise', () => {
    expect(rupeesToPaise('1,234.50')).toBe(123450);
    expect(rupeesToPaise('₹12.05')).toBe(1205);
    expect(rupeesToPaise('-0.01')).toBe(-1);
    expect(paiseFromRupees('.5')).toBe(50);
  });

  it('rejects invalid rupee strings', () => {
    expect(() => rupeesToPaise('')).toThrow(RangeError);
    expect(() => rupeesToPaise('12abc')).toThrow(RangeError);
    expect(() => rupeesToPaise('Infinity')).toThrow(RangeError);
  });

  it('rounds extra rupee decimals half away from zero', () => {
    expect(rupeesToPaise('1.005')).toBe(101);
    expect(rupeesToPaise('-1.005')).toBe(-101);
  });

  it('formats with Indian grouping and explicit signs', () => {
    expect(formatPaise(toPaise(123450))).toBe('+₹1,234.50');
    expect(formatInr(toPaise(-123450))).toBe('-₹1,234.50');
    expect(formatPaise(toPaise(123450), 'none')).toBe('₹1,234.50');
    expect(formatPaise(toPaise(0))).toBe('₹0.00');
  });

  it('converts paise back to rupee display strings', () => {
    expect(paiseToRupeesString(toPaise(123450))).toBe('1234.50');
    expect(paiseToRupeesString(toPaise(-1))).toBe('-0.01');
  });
});
