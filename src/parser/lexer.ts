import { Token, TokenType, KEYWORDS } from './tokens.js';

export class LexerError extends Error {
  constructor(
    message: string,
    public line: number,
    public column: number
  ) {
    super(`${message} at line ${line}, column ${column}`);
    this.name = 'LexerError';
  }
}

export class Lexer {
  private source: string;
  private pos: number = 0;
  private line: number = 1;
  private column: number = 1;
  private placeholderIndex: number = 0;

  constructor(source: string) {
    this.source = source;
  }

  tokenize(): Token[] {
    const tokens: Token[] = [];

    while (!this.isAtEnd()) {
      this.skipWhitespaceAndComments();
      if (this.isAtEnd()) break;

      const token = this.scanToken();
      if (token) tokens.push(token);
    }

    tokens.push(this.makeToken(TokenType.EOF, ''));
    return tokens;
  }

  private isAtEnd(): boolean {
    return this.pos >= this.source.length;
  }

  private peek(): string {
    return this.source[this.pos] ?? '';
  }

  private peekNext(): string {
    return this.source[this.pos + 1] ?? '';
  }

  private advance(): string {
    const char = this.source[this.pos];
    this.pos++;
    if (char === '\n') {
      this.line++;
      this.column = 1;
    } else {
      this.column++;
    }
    return char;
  }

  private makeToken(type: TokenType, value: string): Token {
    return {
      type,
      value,
      line: this.line,
      column: this.column - value.length,
    };
  }

  private skipWhitespaceAndComments(): void {
    while (!this.isAtEnd()) {
      const char = this.peek();

      if (char === ' ' || char === '\t' || char === '\n' || char === '\r') {
        this.advance();
      } else if (char === '-' && this.peekNext() === '-') {
        // Single line comment
        while (!this.isAtEnd() && this.peek() !== '\n') {
          this.advance();
        }
      } else if (char === '/' && this.peekNext() === '*') {
        // Multi-line comment
        this.advance(); // /
        this.advance(); // *
        while (!this.isAtEnd()) {
          if (this.peek() === '*' && this.peekNext() === '/') {
            this.advance(); // *
            this.advance(); // /
            break;
          }
          this.advance();
        }
      } else {
        break;
      }
    }
  }

  private scanToken(): Token | null {
    const startLine = this.line;
    const startColumn = this.column;
    const char = this.peek();

    // Single character tokens
    switch (char) {
      case '(':
        this.advance();
        return { type: TokenType.LPAREN, value: '(', line: startLine, column: startColumn };
      case ')':
        this.advance();
        return { type: TokenType.RPAREN, value: ')', line: startLine, column: startColumn };
      case ',':
        this.advance();
        return { type: TokenType.COMMA, value: ',', line: startLine, column: startColumn };
      case '.':
        this.advance();
        return { type: TokenType.DOT, value: '.', line: startLine, column: startColumn };
      case ';':
        this.advance();
        return { type: TokenType.SEMICOLON, value: ';', line: startLine, column: startColumn };
      case '+':
        this.advance();
        return { type: TokenType.PLUS, value: '+', line: startLine, column: startColumn };
      case '-':
        this.advance();
        return { type: TokenType.MINUS, value: '-', line: startLine, column: startColumn };
      case '/':
        this.advance();
        return { type: TokenType.DIVIDE, value: '/', line: startLine, column: startColumn };
      case '%':
        this.advance();
        return { type: TokenType.MODULO, value: '%', line: startLine, column: startColumn };
      case '?':
        this.advance();
        return {
          type: TokenType.PLACEHOLDER,
          value: String(this.placeholderIndex++),
          line: startLine,
          column: startColumn,
        };
    }

    // Two character operators or single
    if (char === '*') {
      this.advance();
      return { type: TokenType.ASTERISK, value: '*', line: startLine, column: startColumn };
    }

    if (char === '|' && this.peekNext() === '|') {
      this.advance();
      this.advance();
      return { type: TokenType.CONCAT_OP, value: '||', line: startLine, column: startColumn };
    }

    if (char === '!' && this.peekNext() === '=') {
      this.advance();
      this.advance();
      return { type: TokenType.NOT_EQUALS, value: '!=', line: startLine, column: startColumn };
    }

    if (char === '<') {
      this.advance();
      if (this.peek() === '=') {
        this.advance();
        return { type: TokenType.LESS_EQUALS, value: '<=', line: startLine, column: startColumn };
      }
      if (this.peek() === '>') {
        this.advance();
        return { type: TokenType.NOT_EQUALS, value: '<>', line: startLine, column: startColumn };
      }
      return { type: TokenType.LESS_THAN, value: '<', line: startLine, column: startColumn };
    }

    if (char === '>') {
      this.advance();
      if (this.peek() === '=') {
        this.advance();
        return { type: TokenType.GREATER_EQUALS, value: '>=', line: startLine, column: startColumn };
      }
      return { type: TokenType.GREATER_THAN, value: '>', line: startLine, column: startColumn };
    }

    if (char === '=') {
      this.advance();
      return { type: TokenType.EQUALS, value: '=', line: startLine, column: startColumn };
    }

    // Strings
    if (char === "'" || char === '"') {
      return this.scanString(char);
    }

    // Backtick identifiers
    if (char === '`') {
      return this.scanBacktickIdentifier();
    }

    // Bracket identifiers [identifier]
    if (char === '[') {
      return this.scanBracketIdentifier();
    }

    // Named placeholders :name
    if (char === ':') {
      return this.scanNamedPlaceholder();
    }

    // Numbers
    if (this.isDigit(char)) {
      return this.scanNumber();
    }

    // Identifiers and keywords
    if (this.isAlpha(char) || char === '_') {
      return this.scanIdentifier();
    }

    throw new LexerError(`Unexpected character '${char}'`, this.line, this.column);
  }

  private scanString(quote: string): Token {
    const startLine = this.line;
    const startColumn = this.column;
    this.advance(); // Opening quote

    let value = '';
    while (!this.isAtEnd() && this.peek() !== quote) {
      if (this.peek() === '\\') {
        this.advance();
        if (!this.isAtEnd()) {
          const escaped = this.advance();
          switch (escaped) {
            case 'n':
              value += '\n';
              break;
            case 't':
              value += '\t';
              break;
            case 'r':
              value += '\r';
              break;
            case '\\':
              value += '\\';
              break;
            case "'":
              value += "'";
              break;
            case '"':
              value += '"';
              break;
            default:
              value += escaped;
          }
        }
      } else if (this.peek() === quote && this.peekNext() === quote) {
        // Escaped quote by doubling
        this.advance();
        value += this.advance();
      } else {
        value += this.advance();
      }
    }

    if (this.isAtEnd()) {
      throw new LexerError('Unterminated string', startLine, startColumn);
    }

    this.advance(); // Closing quote
    return { type: TokenType.STRING, value, line: startLine, column: startColumn };
  }

  private scanBacktickIdentifier(): Token {
    const startLine = this.line;
    const startColumn = this.column;
    this.advance(); // Opening backtick

    let value = '';
    while (!this.isAtEnd() && this.peek() !== '`') {
      value += this.advance();
    }

    if (this.isAtEnd()) {
      throw new LexerError('Unterminated identifier', startLine, startColumn);
    }

    this.advance(); // Closing backtick
    return { type: TokenType.IDENTIFIER, value, line: startLine, column: startColumn };
  }

  private scanBracketIdentifier(): Token {
    const startLine = this.line;
    const startColumn = this.column;
    this.advance(); // Opening bracket

    let value = '';
    while (!this.isAtEnd() && this.peek() !== ']') {
      value += this.advance();
    }

    if (this.isAtEnd()) {
      throw new LexerError('Unterminated identifier', startLine, startColumn);
    }

    this.advance(); // Closing bracket
    return { type: TokenType.IDENTIFIER, value, line: startLine, column: startColumn };
  }

  private scanNamedPlaceholder(): Token {
    const startLine = this.line;
    const startColumn = this.column;
    this.advance(); // :

    let name = '';
    while (!this.isAtEnd() && (this.isAlphaNumeric(this.peek()) || this.peek() === '_')) {
      name += this.advance();
    }

    if (name.length === 0) {
      throw new LexerError('Expected placeholder name after :', startLine, startColumn);
    }

    return { type: TokenType.PLACEHOLDER, value: name, line: startLine, column: startColumn };
  }

  private scanNumber(): Token {
    const startLine = this.line;
    const startColumn = this.column;
    let value = '';

    // Integer part
    while (!this.isAtEnd() && this.isDigit(this.peek())) {
      value += this.advance();
    }

    // Decimal part
    if (this.peek() === '.' && this.isDigit(this.peekNext())) {
      value += this.advance(); // .
      while (!this.isAtEnd() && this.isDigit(this.peek())) {
        value += this.advance();
      }
    }

    // Exponent part
    if (this.peek() === 'e' || this.peek() === 'E') {
      value += this.advance();
      if (this.peek() === '+' || this.peek() === '-') {
        value += this.advance();
      }
      while (!this.isAtEnd() && this.isDigit(this.peek())) {
        value += this.advance();
      }
    }

    return { type: TokenType.NUMBER, value, line: startLine, column: startColumn };
  }

  private scanIdentifier(): Token {
    const startLine = this.line;
    const startColumn = this.column;
    let value = '';

    while (!this.isAtEnd() && (this.isAlphaNumeric(this.peek()) || this.peek() === '_')) {
      value += this.advance();
    }

    const upperValue = value.toUpperCase();
    const keywordType = KEYWORDS[upperValue];

    if (keywordType !== undefined) {
      return { type: keywordType, value: upperValue, line: startLine, column: startColumn };
    }

    return { type: TokenType.IDENTIFIER, value, line: startLine, column: startColumn };
  }

  private isDigit(char: string): boolean {
    return char >= '0' && char <= '9';
  }

  private isAlpha(char: string): boolean {
    return (char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z');
  }

  private isAlphaNumeric(char: string): boolean {
    return this.isAlpha(char) || this.isDigit(char);
  }
}
