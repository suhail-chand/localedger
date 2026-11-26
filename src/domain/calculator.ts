import type { Paise } from '@/domain/types';
import { toPaise } from '@/domain/money';

type Rational = {
  readonly numerator: bigint;
  readonly denominator: bigint;
};

export class CalculatorError extends RangeError {}

export function evaluateCalculatorExpression(expression: string): Paise {
  if (expression.trim().length === 0) {
    throw new CalculatorError('Calculator expression cannot be empty');
  }

  const parser = new CalculatorParser(expression);
  const result = parser.parse();
  const paise = roundRationalToPaise(result);
  return toPaise(paise);
}

export function parseCalculatorExpression(expression: string): Paise {
  return evaluateCalculatorExpression(expression);
}

export function calculateExpression(expression: string): Paise {
  return evaluateCalculatorExpression(expression);
}

class CalculatorParser {
  private index = 0;

  public constructor(private readonly expression: string) {}

  public parse(): Rational {
    const result = this.parseSum();
    this.skipWhitespace();
    if (this.index !== this.expression.length) {
      throw new CalculatorError(`Unexpected character at position ${this.index + 1}`);
    }
    return result;
  }

  private parseSum(): Rational {
    let left = this.parseProduct();

    while (true) {
      this.skipWhitespace();
      const operator = this.peek();
      if (operator !== '+' && operator !== '-') {
        return left;
      }
      this.index += 1;
      const right = this.parseProduct();
      left =
        operator === '+'
          ? add(left, right)
          : subtract(left, right);
    }
  }

  private parseProduct(): Rational {
    let left = this.parseUnary();

    while (true) {
      this.skipWhitespace();
      const operator = this.peek();
      if (operator !== '*' && operator !== '/' && operator !== '×' && operator !== '÷') {
        return left;
      }
      this.index += 1;
      const right = this.parseUnary();
      left =
        operator === '*' || operator === '×'
          ? multiply(left, right)
          : divide(left, right);
    }
  }

  private parseUnary(): Rational {
    this.skipWhitespace();
    const operator = this.peek();
    if (operator === '+' || operator === '-') {
      this.index += 1;
      const value = this.parseUnary();
      return operator === '-' ? negate(value) : value;
    }
    return this.parsePrimary();
  }

  private parsePrimary(): Rational {
    this.skipWhitespace();
    if (this.peek() === '(') {
      this.index += 1;
      const result = this.parseSum();
      this.skipWhitespace();
      if (this.peek() !== ')') {
        throw new CalculatorError('Missing closing parenthesis');
      }
      this.index += 1;
      return result;
    }

    const start = this.index;
    let hasDigit = false;
    while (/[0-9]/.test(this.peek())) {
      hasDigit = true;
      this.index += 1;
    }
    if (this.peek() === '.') {
      this.index += 1;
      while (/[0-9]/.test(this.peek())) {
        hasDigit = true;
        this.index += 1;
      }
    }
    if (!hasDigit) {
      throw new CalculatorError(`Expected a number at position ${start + 1}`);
    }

    const text = this.expression.slice(start, this.index);
    return parseDecimal(text);
  }

  private peek(): string {
    return this.expression[this.index] ?? '';
  }

  private skipWhitespace(): void {
    while (/\s/.test(this.peek())) {
      this.index += 1;
    }
  }
}

function parseDecimal(text: string): Rational {
  const [whole = '0', fraction = ''] = text.split('.');
  const numerator = BigInt(`${whole || '0'}${fraction}`);
  const denominator = 10n ** BigInt(fraction.length);
  return reduce(numerator, denominator);
}

function add(left: Rational, right: Rational): Rational {
  return reduce(
    left.numerator * right.denominator + right.numerator * left.denominator,
    left.denominator * right.denominator,
  );
}

function subtract(left: Rational, right: Rational): Rational {
  return reduce(
    left.numerator * right.denominator - right.numerator * left.denominator,
    left.denominator * right.denominator,
  );
}

function multiply(left: Rational, right: Rational): Rational {
  return reduce(
    left.numerator * right.numerator,
    left.denominator * right.denominator,
  );
}

function divide(left: Rational, right: Rational): Rational {
  if (right.numerator === 0n) {
    throw new CalculatorError('Division by zero');
  }
  return reduce(
    left.numerator * right.denominator,
    left.denominator * right.numerator,
  );
}

function negate(value: Rational): Rational {
  return { numerator: -value.numerator, denominator: value.denominator };
}

function reduce(numerator: bigint, denominator: bigint): Rational {
  if (denominator === 0n) {
    throw new CalculatorError('Division by zero');
  }
  if (denominator < 0n) {
    numerator = -numerator;
    denominator = -denominator;
  }
  const divisor = greatestCommonDivisor(numerator, denominator);
  return {
    numerator: numerator / divisor,
    denominator: denominator / divisor,
  };
}

function greatestCommonDivisor(left: bigint, right: bigint): bigint {
  let a = left < 0n ? -left : left;
  let b = right < 0n ? -right : right;
  while (b !== 0n) {
    const remainder = a % b;
    a = b;
    b = remainder;
  }
  return a === 0n ? 1n : a;
}

function roundRationalToPaise(value: Rational): number {
  const numerator = value.numerator * 100n;
  const sign = numerator < 0n ? -1n : 1n;
  const absolute = numerator < 0n ? -numerator : numerator;
  const quotient = absolute / value.denominator;
  const remainder = absolute % value.denominator;
  const paise = sign * (quotient + (remainder * 2n >= value.denominator ? 1n : 0n));

  if (paise > BigInt(Number.MAX_SAFE_INTEGER) || paise < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new RangeError('Calculator result exceeds the safe integer range');
  }
  return Number(paise);
}
