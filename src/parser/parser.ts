import { Token, TokenType } from './tokens.js';
import {
  Statement,
  SelectStatement,
  InsertStatement,
  UpdateStatement,
  DeleteStatement,
  CreateTableStatement,
  DropTableStatement,
  AlterTableStatement,
  Expression,
  SelectColumn,
  TableReference,
  JoinClause,
  OrderByClause,
  LimitClause,
  Assignment,
  ColumnDefinition,
  TableConstraint,
  DataType,
  FunctionCall,
  InExpr,
  BetweenExpr,
  LikeExpr,
  IsNullExpr,
  CaseExpr,
} from './ast.js';

export class ParserError extends Error {
  constructor(
    message: string,
    public token: Token
  ) {
    super(`${message} at line ${token.line}, column ${token.column}`);
    this.name = 'ParserError';
  }
}

export class Parser {
  private tokens: Token[];
  private current: number = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  parse(): Statement {
    const stmt = this.parseStatement();
    if (!this.check(TokenType.EOF) && !this.check(TokenType.SEMICOLON)) {
      throw new ParserError(`Unexpected token: ${this.peek().type}`, this.peek());
    }
    return stmt;
  }

  parseMultiple(): Statement[] {
    const statements: Statement[] = [];
    while (!this.isAtEnd()) {
      this.skipSemicolons();
      if (this.isAtEnd()) break;
      statements.push(this.parseStatement());
      this.skipSemicolons();
    }
    return statements;
  }

  private skipSemicolons(): void {
    while (this.match(TokenType.SEMICOLON)) {
      // Skip semicolons
    }
  }

  private parseStatement(): Statement {
    if (this.check(TokenType.SELECT)) {
      return this.parseSelect();
    }
    if (this.check(TokenType.INSERT)) {
      return this.parseInsert();
    }
    if (this.check(TokenType.UPDATE)) {
      return this.parseUpdate();
    }
    if (this.check(TokenType.DELETE)) {
      return this.parseDelete();
    }
    if (this.check(TokenType.CREATE)) {
      return this.parseCreate();
    }
    if (this.check(TokenType.DROP)) {
      return this.parseDrop();
    }
    if (this.check(TokenType.ALTER)) {
      return this.parseAlter();
    }

    throw new ParserError(`Unexpected token: ${this.peek().type}`, this.peek());
  }

  // SELECT statement
  private parseSelect(): SelectStatement {
    this.consume(TokenType.SELECT);

    const distinct = this.match(TokenType.DISTINCT);
    if (!distinct) this.match(TokenType.ALL); // Consume ALL if present

    const columns = this.parseSelectColumns();

    let from: TableReference | null = null;
    if (this.match(TokenType.FROM)) {
      from = this.parseTableReference();
    }

    const joins = this.parseJoins();
    const where = this.parseWhere();
    const groupBy = this.parseGroupBy();
    const having = this.parseHaving();
    const orderBy = this.parseOrderBy();
    const limit = this.parseLimit();

    return {
      type: 'SELECT',
      distinct,
      columns,
      from,
      joins,
      where,
      groupBy,
      having,
      orderBy,
      limit,
    };
  }

  private parseSelectColumns(): SelectColumn[] {
    const columns: SelectColumn[] = [];

    do {
      columns.push(this.parseSelectColumn());
    } while (this.match(TokenType.COMMA));

    return columns;
  }

  private parseSelectColumn(): SelectColumn {
    const expression = this.parseExpression();
    let alias: string | null = null;

    if (this.match(TokenType.AS)) {
      alias = this.consumeIdentifier();
    } else if (this.check(TokenType.IDENTIFIER) && !this.checkKeyword()) {
      alias = this.consumeIdentifier();
    }

    return { expression, alias };
  }

  private parseTableReference(): TableReference {
    if (this.match(TokenType.LPAREN)) {
      if (this.check(TokenType.SELECT)) {
        const subquery = this.parseSelect();
        this.consume(TokenType.RPAREN);
        let alias: string | undefined;
        if (this.match(TokenType.AS)) {
          alias = this.consumeIdentifier();
        } else if (this.check(TokenType.IDENTIFIER)) {
          alias = this.consumeIdentifier();
        }
        return { type: 'Subquery', subquery, alias };
      }
      throw new ParserError('Expected SELECT in subquery', this.peek());
    }

    const name = this.consumeIdentifier();
    let alias: string | undefined;

    if (this.match(TokenType.AS)) {
      alias = this.consumeIdentifier();
    } else if (this.check(TokenType.IDENTIFIER) && !this.checkKeyword()) {
      alias = this.consumeIdentifier();
    }

    return { type: 'Table', name, alias };
  }

  private parseJoins(): JoinClause[] {
    const joins: JoinClause[] = [];

    while (true) {
      let joinType: 'INNER' | 'LEFT' | 'RIGHT' | 'CROSS' | null = null;

      if (this.match(TokenType.INNER)) {
        this.consume(TokenType.JOIN);
        joinType = 'INNER';
      } else if (this.match(TokenType.LEFT)) {
        this.match(TokenType.OUTER);
        this.consume(TokenType.JOIN);
        joinType = 'LEFT';
      } else if (this.match(TokenType.RIGHT)) {
        this.match(TokenType.OUTER);
        this.consume(TokenType.JOIN);
        joinType = 'RIGHT';
      } else if (this.match(TokenType.CROSS)) {
        this.consume(TokenType.JOIN);
        joinType = 'CROSS';
      } else if (this.match(TokenType.JOIN)) {
        joinType = 'INNER';
      }

      if (joinType === null) break;

      const table = this.parseTableReference();
      let condition: Expression | null = null;

      if (joinType !== 'CROSS' && this.match(TokenType.ON)) {
        condition = this.parseExpression();
      }

      joins.push({ type: joinType, table, condition });
    }

    return joins;
  }

  private parseWhere(): Expression | null {
    if (!this.match(TokenType.WHERE)) return null;
    return this.parseExpression();
  }

  private parseGroupBy(): Expression[] | null {
    if (!this.match(TokenType.GROUP)) return null;
    this.consume(TokenType.BY);

    const expressions: Expression[] = [];
    do {
      expressions.push(this.parseExpression());
    } while (this.match(TokenType.COMMA));

    return expressions;
  }

  private parseHaving(): Expression | null {
    if (!this.match(TokenType.HAVING)) return null;
    return this.parseExpression();
  }

  private parseOrderBy(): OrderByClause[] | null {
    if (!this.match(TokenType.ORDER)) return null;
    this.consume(TokenType.BY);

    const clauses: OrderByClause[] = [];
    do {
      const expression = this.parseExpression();
      let direction: 'ASC' | 'DESC' = 'ASC';

      if (this.match(TokenType.DESC)) {
        direction = 'DESC';
      } else {
        this.match(TokenType.ASC);
      }

      clauses.push({ expression, direction });
    } while (this.match(TokenType.COMMA));

    return clauses;
  }

  private parseLimit(): LimitClause | null {
    if (!this.match(TokenType.LIMIT)) return null;

    const count = this.parseExpression();
    let offset: Expression | undefined;

    if (this.match(TokenType.OFFSET)) {
      offset = this.parseExpression();
    } else if (this.match(TokenType.COMMA)) {
      // MySQL style: LIMIT offset, count
      offset = count;
      const newCount = this.parseExpression();
      return { count: newCount, offset };
    }

    return { count, offset };
  }

  // INSERT statement
  private parseInsert(): InsertStatement {
    this.consume(TokenType.INSERT);
    this.consume(TokenType.INTO);

    const table = this.consumeIdentifier();
    let columns: string[] | null = null;

    if (this.match(TokenType.LPAREN)) {
      columns = [];
      do {
        columns.push(this.consumeIdentifier());
      } while (this.match(TokenType.COMMA));
      this.consume(TokenType.RPAREN);
    }

    this.consume(TokenType.VALUES);

    const values: Expression[][] = [];
    do {
      this.consume(TokenType.LPAREN);
      const row: Expression[] = [];
      do {
        row.push(this.parseExpression());
      } while (this.match(TokenType.COMMA));
      this.consume(TokenType.RPAREN);
      values.push(row);
    } while (this.match(TokenType.COMMA));

    return { type: 'INSERT', table, columns, values };
  }

  // UPDATE statement
  private parseUpdate(): UpdateStatement {
    this.consume(TokenType.UPDATE);
    const table = this.consumeIdentifier();
    this.consume(TokenType.SET);

    const assignments: Assignment[] = [];
    do {
      const column = this.consumeIdentifier();
      this.consume(TokenType.EQUALS);
      const value = this.parseExpression();
      assignments.push({ column, value });
    } while (this.match(TokenType.COMMA));

    const where = this.parseWhere();

    return { type: 'UPDATE', table, assignments, where };
  }

  // DELETE statement
  private parseDelete(): DeleteStatement {
    this.consume(TokenType.DELETE);
    this.consume(TokenType.FROM);
    const table = this.consumeIdentifier();
    const where = this.parseWhere();

    return { type: 'DELETE', table, where };
  }

  // CREATE statement
  private parseCreate(): CreateTableStatement {
    this.consume(TokenType.CREATE);
    this.consume(TokenType.TABLE);

    const ifNotExists = this.match(TokenType.IF) && this.match(TokenType.NOT) && this.match(TokenType.EXISTS);

    const table = this.consumeIdentifier();
    this.consume(TokenType.LPAREN);

    const columns: ColumnDefinition[] = [];
    const constraints: TableConstraint[] = [];

    do {
      if (
        this.check(TokenType.PRIMARY) ||
        this.check(TokenType.UNIQUE) ||
        this.check(TokenType.FOREIGN) ||
        this.check(TokenType.CHECK) ||
        this.check(TokenType.CONSTRAINT)
      ) {
        constraints.push(this.parseTableConstraint());
      } else {
        columns.push(this.parseColumnDefinition());
      }
    } while (this.match(TokenType.COMMA));

    this.consume(TokenType.RPAREN);

    return { type: 'CREATE_TABLE', table, ifNotExists, columns, constraints };
  }

  private parseColumnDefinition(): ColumnDefinition {
    const name = this.consumeIdentifier();
    const dataType = this.parseDataType();

    let nullable = true;
    let defaultValue: Expression | null = null;
    let primaryKey = false;
    let autoIncrement = false;
    let unique = false;

    while (true) {
      if (this.match(TokenType.NOT)) {
        this.consume(TokenType.NULL);
        nullable = false;
      } else if (this.match(TokenType.NULL)) {
        nullable = true;
      } else if (this.match(TokenType.DEFAULT)) {
        defaultValue = this.parsePrimary();
      } else if (this.match(TokenType.PRIMARY)) {
        this.consume(TokenType.KEY);
        primaryKey = true;
      } else if (this.match(TokenType.AUTO_INCREMENT)) {
        autoIncrement = true;
      } else if (this.match(TokenType.UNIQUE)) {
        unique = true;
      } else {
        break;
      }
    }

    return { name, dataType, nullable, defaultValue, primaryKey, autoIncrement, unique };
  }

  private parseDataType(): DataType {
    const token = this.advance();
    const type = token.value;
    let length: number | undefined;
    let precision: number | undefined;
    let scale: number | undefined;

    if (this.match(TokenType.LPAREN)) {
      const firstNum = this.consume(TokenType.NUMBER);
      precision = parseInt(firstNum.value, 10);
      length = precision;

      if (this.match(TokenType.COMMA)) {
        const secondNum = this.consume(TokenType.NUMBER);
        scale = parseInt(secondNum.value, 10);
      }

      this.consume(TokenType.RPAREN);
    }

    return { type, length, precision, scale };
  }

  private parseTableConstraint(): TableConstraint {
    let name: string | undefined;

    if (this.match(TokenType.CONSTRAINT)) {
      name = this.consumeIdentifier();
    }

    if (this.match(TokenType.PRIMARY)) {
      this.consume(TokenType.KEY);
      this.consume(TokenType.LPAREN);
      const columns: string[] = [];
      do {
        columns.push(this.consumeIdentifier());
      } while (this.match(TokenType.COMMA));
      this.consume(TokenType.RPAREN);
      return { type: 'PRIMARY_KEY', name, columns };
    }

    if (this.match(TokenType.UNIQUE)) {
      this.consume(TokenType.LPAREN);
      const columns: string[] = [];
      do {
        columns.push(this.consumeIdentifier());
      } while (this.match(TokenType.COMMA));
      this.consume(TokenType.RPAREN);
      return { type: 'UNIQUE', name, columns };
    }

    if (this.match(TokenType.FOREIGN)) {
      this.consume(TokenType.KEY);
      this.consume(TokenType.LPAREN);
      const columns: string[] = [];
      do {
        columns.push(this.consumeIdentifier());
      } while (this.match(TokenType.COMMA));
      this.consume(TokenType.RPAREN);

      this.consume(TokenType.REFERENCES);
      const refTable = this.consumeIdentifier();
      this.consume(TokenType.LPAREN);
      const refColumns: string[] = [];
      do {
        refColumns.push(this.consumeIdentifier());
      } while (this.match(TokenType.COMMA));
      this.consume(TokenType.RPAREN);

      return { type: 'FOREIGN_KEY', name, columns, references: { table: refTable, columns: refColumns } };
    }

    if (this.match(TokenType.CHECK)) {
      this.consume(TokenType.LPAREN);
      const expression = this.parseExpression();
      this.consume(TokenType.RPAREN);
      return { type: 'CHECK', name, expression };
    }

    throw new ParserError('Expected constraint', this.peek());
  }

  // DROP statement
  private parseDrop(): DropTableStatement {
    this.consume(TokenType.DROP);
    this.consume(TokenType.TABLE);

    const ifExists = this.match(TokenType.IF) && this.match(TokenType.EXISTS);
    const table = this.consumeIdentifier();

    return { type: 'DROP_TABLE', table, ifExists };
  }

  // ALTER statement
  private parseAlter(): AlterTableStatement {
    this.consume(TokenType.ALTER);
    this.consume(TokenType.TABLE);
    const table = this.consumeIdentifier();

    if (this.match(TokenType.ADD)) {
      this.match(TokenType.COLUMN);
      const column = this.parseColumnDefinition();
      return { type: 'ALTER_TABLE', table, action: { type: 'ADD_COLUMN', column } };
    }

    if (this.match(TokenType.DROP)) {
      this.match(TokenType.COLUMN);
      const column = this.consumeIdentifier();
      return { type: 'ALTER_TABLE', table, action: { type: 'DROP_COLUMN', column } };
    }

    throw new ParserError('Expected ADD or DROP', this.peek());
  }

  // Expression parsing (precedence climbing)
  private parseExpression(): Expression {
    return this.parseOr();
  }

  private parseOr(): Expression {
    let left = this.parseAnd();

    while (this.match(TokenType.OR)) {
      const right = this.parseAnd();
      left = { type: 'BinaryExpr', operator: 'OR', left, right };
    }

    return left;
  }

  private parseAnd(): Expression {
    let left = this.parseNot();

    while (this.match(TokenType.AND)) {
      const right = this.parseNot();
      left = { type: 'BinaryExpr', operator: 'AND', left, right };
    }

    return left;
  }

  private parseNot(): Expression {
    if (this.match(TokenType.NOT)) {
      const operand = this.parseNot();
      return { type: 'UnaryExpr', operator: 'NOT', operand };
    }
    return this.parseComparison();
  }

  private parseComparison(): Expression {
    let left = this.parseAdditive();

    // IS NULL / IS NOT NULL
    if (this.match(TokenType.IS)) {
      const not = this.match(TokenType.NOT);
      this.consume(TokenType.NULL);
      return { type: 'IsNullExpr', left, not } as IsNullExpr;
    }

    // NOT IN / NOT LIKE / NOT BETWEEN
    if (this.match(TokenType.NOT)) {
      if (this.match(TokenType.IN)) {
        return this.parseInExpr(left, true);
      }
      if (this.match(TokenType.LIKE)) {
        return this.parseLikeExpr(left, true);
      }
      if (this.match(TokenType.BETWEEN)) {
        return this.parseBetweenExpr(left, true);
      }
      throw new ParserError('Expected IN, LIKE, or BETWEEN after NOT', this.peek());
    }

    // IN
    if (this.match(TokenType.IN)) {
      return this.parseInExpr(left, false);
    }

    // LIKE
    if (this.match(TokenType.LIKE)) {
      return this.parseLikeExpr(left, false);
    }

    // BETWEEN
    if (this.match(TokenType.BETWEEN)) {
      return this.parseBetweenExpr(left, false);
    }

    // Comparison operators
    if (this.matchAny([TokenType.EQUALS, TokenType.NOT_EQUALS, TokenType.LESS_THAN, TokenType.GREATER_THAN, TokenType.LESS_EQUALS, TokenType.GREATER_EQUALS])) {
      const operator = this.previous().value;
      const right = this.parseAdditive();
      return { type: 'BinaryExpr', operator, left, right };
    }

    return left;
  }

  private parseInExpr(left: Expression, not: boolean): InExpr {
    this.consume(TokenType.LPAREN);

    if (this.check(TokenType.SELECT)) {
      const subquery = this.parseSelect();
      this.consume(TokenType.RPAREN);
      return { type: 'InExpr', left, subquery, not };
    }

    const values: Expression[] = [];
    do {
      values.push(this.parseExpression());
    } while (this.match(TokenType.COMMA));
    this.consume(TokenType.RPAREN);

    return { type: 'InExpr', left, values, not };
  }

  private parseLikeExpr(left: Expression, not: boolean): LikeExpr {
    const pattern = this.parseAdditive();
    return { type: 'LikeExpr', left, pattern, not };
  }

  private parseBetweenExpr(left: Expression, not: boolean): BetweenExpr {
    const low = this.parseAdditive();
    this.consume(TokenType.AND);
    const high = this.parseAdditive();
    return { type: 'BetweenExpr', left, low, high, not };
  }

  private parseAdditive(): Expression {
    let left = this.parseMultiplicative();

    while (this.matchAny([TokenType.PLUS, TokenType.MINUS, TokenType.CONCAT_OP])) {
      const operator = this.previous().value;
      const right = this.parseMultiplicative();
      left = { type: 'BinaryExpr', operator, left, right };
    }

    return left;
  }

  private parseMultiplicative(): Expression {
    let left = this.parseUnary();

    while (this.matchAny([TokenType.ASTERISK, TokenType.DIVIDE, TokenType.MODULO])) {
      const operator = this.previous().value;
      const right = this.parseUnary();
      left = { type: 'BinaryExpr', operator, left, right };
    }

    return left;
  }

  private parseUnary(): Expression {
    if (this.match(TokenType.MINUS)) {
      const operand = this.parseUnary();
      return { type: 'UnaryExpr', operator: '-', operand };
    }
    if (this.match(TokenType.PLUS)) {
      return this.parseUnary();
    }
    return this.parsePrimary();
  }

  private parsePrimary(): Expression {
    // CASE expression
    if (this.match(TokenType.CASE)) {
      return this.parseCaseExpr();
    }

    // Parenthesized expression or subquery
    if (this.match(TokenType.LPAREN)) {
      if (this.check(TokenType.SELECT)) {
        const query = this.parseSelect();
        this.consume(TokenType.RPAREN);
        return { type: 'Subquery', query };
      }
      const expr = this.parseExpression();
      this.consume(TokenType.RPAREN);
      return expr;
    }

    // NULL
    if (this.match(TokenType.NULL)) {
      return { type: 'Literal', value: null, dataType: 'NULL' };
    }

    // TRUE/FALSE
    if (this.match(TokenType.TRUE)) {
      return { type: 'Literal', value: true, dataType: 'BOOLEAN' };
    }
    if (this.match(TokenType.FALSE)) {
      return { type: 'Literal', value: false, dataType: 'BOOLEAN' };
    }

    // Numbers
    if (this.match(TokenType.NUMBER)) {
      const value = this.previous().value;
      return { type: 'Literal', value: parseFloat(value), dataType: 'NUMBER' };
    }

    // Strings
    if (this.match(TokenType.STRING)) {
      return { type: 'Literal', value: this.previous().value, dataType: 'STRING' };
    }

    // Placeholders
    if (this.match(TokenType.PLACEHOLDER)) {
      const token = this.previous();
      const index = parseInt(token.value, 10);
      if (isNaN(index)) {
        return { type: 'Placeholder', index: -1, name: token.value };
      }
      return { type: 'Placeholder', index };
    }

    // Asterisk (for SELECT *)
    if (this.match(TokenType.ASTERISK)) {
      return { type: 'ColumnRef', table: null, column: '*' };
    }

    // Function calls or column references
    if (this.checkAggregateFunction() || this.checkBuiltinFunction()) {
      return this.parseFunctionCall();
    }

    if (this.check(TokenType.IDENTIFIER)) {
      return this.parseColumnRefOrFunction();
    }

    throw new ParserError(`Unexpected token: ${this.peek().type}`, this.peek());
  }

  private parseCaseExpr(): CaseExpr {
    let operand: Expression | null = null;

    // Simple CASE: CASE expr WHEN ...
    if (!this.check(TokenType.WHEN)) {
      operand = this.parseExpression();
    }

    const whenClauses: { when: Expression; then: Expression }[] = [];
    while (this.match(TokenType.WHEN)) {
      const when = this.parseExpression();
      this.consume(TokenType.THEN);
      const then = this.parseExpression();
      whenClauses.push({ when, then });
    }

    let elseClause: Expression | null = null;
    if (this.match(TokenType.ELSE)) {
      elseClause = this.parseExpression();
    }

    this.consume(TokenType.END);

    return { type: 'CaseExpr', operand, whenClauses, elseClause };
  }

  private parseFunctionCall(): FunctionCall {
    const name = this.advance().value;
    this.consume(TokenType.LPAREN);

    const distinct = this.match(TokenType.DISTINCT);
    const args: Expression[] = [];

    if (!this.check(TokenType.RPAREN)) {
      if (this.match(TokenType.ASTERISK)) {
        // COUNT(*)
        args.push({ type: 'ColumnRef', table: null, column: '*' });
      } else {
        do {
          args.push(this.parseExpression());
        } while (this.match(TokenType.COMMA));
      }
    }

    this.consume(TokenType.RPAREN);

    return { type: 'FunctionCall', name, args, distinct };
  }

  private parseColumnRefOrFunction(): Expression {
    const first = this.consumeIdentifier();

    // table.column or table.*
    if (this.match(TokenType.DOT)) {
      if (this.match(TokenType.ASTERISK)) {
        return { type: 'ColumnRef', table: first, column: '*' };
      }
      const column = this.consumeIdentifier();
      return { type: 'ColumnRef', table: first, column };
    }

    // Function call
    if (this.match(TokenType.LPAREN)) {
      const distinct = this.match(TokenType.DISTINCT);
      const args: Expression[] = [];

      if (!this.check(TokenType.RPAREN)) {
        if (this.match(TokenType.ASTERISK)) {
          args.push({ type: 'ColumnRef', table: null, column: '*' });
        } else {
          do {
            args.push(this.parseExpression());
          } while (this.match(TokenType.COMMA));
        }
      }

      this.consume(TokenType.RPAREN);
      return { type: 'FunctionCall', name: first.toUpperCase(), args, distinct };
    }

    // Simple column reference
    return { type: 'ColumnRef', table: null, column: first };
  }

  // Helper methods
  private isAtEnd(): boolean {
    return this.peek().type === TokenType.EOF;
  }

  private peek(): Token {
    return this.tokens[this.current];
  }

  private previous(): Token {
    return this.tokens[this.current - 1];
  }

  private advance(): Token {
    if (!this.isAtEnd()) this.current++;
    return this.previous();
  }

  private check(type: TokenType): boolean {
    return this.peek().type === type;
  }

  private checkKeyword(): boolean {
    const token = this.peek();
    return (
      token.type === TokenType.FROM ||
      token.type === TokenType.WHERE ||
      token.type === TokenType.GROUP ||
      token.type === TokenType.ORDER ||
      token.type === TokenType.LIMIT ||
      token.type === TokenType.HAVING ||
      token.type === TokenType.JOIN ||
      token.type === TokenType.LEFT ||
      token.type === TokenType.RIGHT ||
      token.type === TokenType.INNER ||
      token.type === TokenType.CROSS ||
      token.type === TokenType.ON ||
      token.type === TokenType.AND ||
      token.type === TokenType.OR
    );
  }

  private checkAggregateFunction(): boolean {
    const type = this.peek().type;
    return (
      type === TokenType.COUNT ||
      type === TokenType.SUM ||
      type === TokenType.AVG ||
      type === TokenType.MIN ||
      type === TokenType.MAX
    );
  }

  private checkBuiltinFunction(): boolean {
    const type = this.peek().type;
    return (
      type === TokenType.COALESCE ||
      type === TokenType.NULLIF ||
      type === TokenType.CAST ||
      type === TokenType.UPPER ||
      type === TokenType.LOWER ||
      type === TokenType.LENGTH ||
      type === TokenType.TRIM ||
      type === TokenType.SUBSTR ||
      type === TokenType.SUBSTRING ||
      type === TokenType.CONCAT ||
      type === TokenType.REPLACE ||
      type === TokenType.NOW ||
      type === TokenType.CURRENT_TIMESTAMP ||
      type === TokenType.CURRENT_DATE ||
      type === TokenType.CURRENT_TIME
    );
  }

  private match(type: TokenType): boolean {
    if (this.check(type)) {
      this.advance();
      return true;
    }
    return false;
  }

  private matchAny(types: TokenType[]): boolean {
    for (const type of types) {
      if (this.check(type)) {
        this.advance();
        return true;
      }
    }
    return false;
  }

  private consume(type: TokenType): Token {
    if (this.check(type)) {
      return this.advance();
    }
    throw new ParserError(`Expected ${type}, got ${this.peek().type}`, this.peek());
  }

  private consumeIdentifier(): string {
    if (this.check(TokenType.IDENTIFIER)) {
      return this.advance().value;
    }
    // Allow keywords as identifiers in some contexts
    const token = this.peek();
    if (token.type in TokenType) {
      return this.advance().value.toLowerCase();
    }
    throw new ParserError(`Expected identifier, got ${token.type}`, token);
  }
}
