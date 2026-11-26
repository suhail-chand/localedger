import { describe, expect, it } from 'vitest';

import {
  CalculatorError,
  calculateExpression,
  evaluateCalculatorExpression,
  parseCalculatorExpression,
} from '@/domain/calculator';

describe('calculator expression parser', () => {
  it('evaluates operators and parentheses', () => {
    expect(evaluateCalculatorExpression('10 + 2 × 3')).toBe(1600);
    expect(evaluateCalculatorExpression('(10 + 2) ÷ 4')).toBe(300);
    expect(calculateExpression('100-25*2')).toBe(5000);
  });

  it('supports unary signs and decimal values', () => {
    expect(parseCalculatorExpression('-12.50 + 2.5')).toBe(-1000);
    expect(evaluateCalculatorExpression('+.25')).toBe(25);
  });

  it('rounds results half away from zero to paise', () => {
    expect(evaluateCalculatorExpression('1.005')).toBe(101);
    expect(evaluateCalculatorExpression('-1.005')).toBe(-101);
    expect(evaluateCalculatorExpression('1 ÷ 8')).toBe(13);
  });

  it('rejects empty, malformed, unbalanced, and division-by-zero expressions', () => {
    expect(() => evaluateCalculatorExpression('')).toThrow(CalculatorError);
    expect(() => evaluateCalculatorExpression('10 +')).toThrow(CalculatorError);
    expect(() => evaluateCalculatorExpression('(10 + 2')).toThrow(CalculatorError);
    expect(() => evaluateCalculatorExpression('10 / 0')).toThrow(CalculatorError);
    expect(() => evaluateCalculatorExpression('abc')).toThrow(CalculatorError);
  });

  it('does not evaluate JavaScript or accept exponent syntax', () => {
    expect(() => evaluateCalculatorExpression('1e3')).toThrow(CalculatorError);
  });
});
