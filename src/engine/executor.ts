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
  BinaryExpr,
  UnaryExpr,
  FunctionCall,
  InExpr,
  BetweenExpr,
  LikeExpr,
  IsNullExpr,
  CaseExpr,
  SelectColumn,
  TableReference,
  JoinClause,
} from '../parser/ast.js';
import { StorageAdapter, Row, TableSchema, ColumnSchema } from '../storage/adapter.js';

export interface QueryResult<T = Row> {
  rows: T[];
  rowCount: number;
  columns: string[];
  lastInsertId?: number;
  affectedRows?: number;
}

export class ExecutorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExecutorError';
  }
}

export class QueryExecutor {
  private storage: StorageAdapter;
  private params: unknown[] = [];

  constructor(storage: StorageAdapter) {
    this.storage = storage;
  }

  async execute(ast: Statement, params: unknown[] = []): Promise<QueryResult> {
    this.params = params;

    switch (ast.type) {
      case 'SELECT':
        return this.executeSelect(ast);
      case 'INSERT':
        return this.executeInsert(ast);
      case 'UPDATE':
        return this.executeUpdate(ast);
      case 'DELETE':
        return this.executeDelete(ast);
      case 'CREATE_TABLE':
        return this.executeCreateTable(ast);
      case 'DROP_TABLE':
        return this.executeDropTable(ast);
      case 'ALTER_TABLE':
        return this.executeAlterTable(ast);
      default:
        throw new ExecutorError(`Unknown statement type: ${(ast as Statement).type}`);
    }
  }

  // SELECT execution
  private async executeSelect(stmt: SelectStatement): Promise<QueryResult> {
    let rows: Row[] = [];

    // 1. Get base table or handle no FROM clause
    if (stmt.from) {
      rows = await this.getTableRows(stmt.from);
    } else {
      // SELECT without FROM (e.g., SELECT 1+1)
      rows = [{}];
    }

    // 2. Apply JOINs
    for (const join of stmt.joins) {
      rows = await this.applyJoin(rows, join);
    }

    // 3. Apply WHERE filter
    if (stmt.where) {
      rows = rows.filter(row => this.evaluateCondition(stmt.where!, row));
    }

    // 4. Apply GROUP BY
    if (stmt.groupBy || this.hasAggregates(stmt.columns)) {
      rows = this.applyGroupBy(rows, stmt.groupBy, stmt.columns);
    }

    // 5. Apply HAVING filter (uses group rows for aggregate evaluation)
    if (stmt.having) {
      rows = rows.filter(row => {
        const groupRows = row['__groupRows__'] as Row[] | undefined;
        if (groupRows) {
          return this.evaluateConditionWithAggregates(stmt.having!, groupRows);
        }
        return this.evaluateCondition(stmt.having!, row);
      });
    }

    // Remove internal __groupRows__ before continuing
    for (const row of rows) {
      delete row['__groupRows__'];
    }

    // 6. Apply ORDER BY
    if (stmt.orderBy) {
      rows = this.applyOrderBy(rows, stmt.orderBy);
    }

    // 7. Project columns
    rows = this.projectColumns(rows, stmt.columns);

    // 8. Apply DISTINCT
    if (stmt.distinct) {
      rows = this.applyDistinct(rows);
    }

    // 9. Apply LIMIT/OFFSET
    if (stmt.limit) {
      const offsetVal = stmt.limit.offset;
      const countVal = stmt.limit.count;
      const offset = typeof offsetVal === 'number' ? offsetVal : (offsetVal ? Number(this.evaluateExpression(offsetVal, {})) : 0);
      const count = typeof countVal === 'number' ? countVal : Number(this.evaluateExpression(countVal, {}));
      rows = rows.slice(offset, offset + count);
    }

    const columns = this.extractColumnNames(stmt.columns, rows[0]);

    return {
      rows,
      rowCount: rows.length,
      columns,
    };
  }

  private async getTableRows(ref: TableReference): Promise<Row[]> {
    if (ref.type === 'Subquery' && ref.subquery) {
      const result = await this.executeSelect(ref.subquery);
      const prefix = ref.alias ?? '';
      if (prefix) {
        return result.rows.map(row => this.prefixRow(row, prefix));
      }
      return result.rows;
    }

    if (!ref.name) {
      throw new ExecutorError('Table name is required');
    }

    const rows = await this.storage.getTable(ref.name);
    if (rows === null) {
      throw new ExecutorError(`Table '${ref.name}' does not exist`);
    }

    // Always prefix with table name or alias for proper JOIN support
    const prefix = ref.alias ?? ref.name;
    return rows.map(row => this.prefixRow(row, prefix));
  }

  private prefixRow(row: Row, prefix: string): Row {
    const result: Row = {};
    for (const [key, value] of Object.entries(row)) {
      result[`${prefix}.${key}`] = value;
      result[key] = value; // Keep original too for convenience
    }
    return result;
  }

  private async applyJoin(leftRows: Row[], join: JoinClause): Promise<Row[]> {
    const rightRows = await this.getTableRows(join.table);
    const result: Row[] = [];

    if (join.type === 'CROSS') {
      for (const left of leftRows) {
        for (const right of rightRows) {
          result.push({ ...left, ...right });
        }
      }
      return result;
    }

    for (const left of leftRows) {
      let matched = false;

      for (const right of rightRows) {
        const combined = { ...left, ...right };

        if (!join.condition || this.evaluateCondition(join.condition, combined)) {
          result.push(combined);
          matched = true;
        }
      }

      if (!matched && join.type === 'LEFT') {
        const nullRight = this.createNullRow(rightRows[0] ?? {});
        result.push({ ...left, ...nullRight });
      }
    }

    if (join.type === 'RIGHT') {
      // Right join: also include unmatched right rows
      for (const right of rightRows) {
        let matched = false;
        for (const left of leftRows) {
          const combined = { ...left, ...right };
          if (!join.condition || this.evaluateCondition(join.condition, combined)) {
            matched = true;
            break;
          }
        }
        if (!matched) {
          const nullLeft = this.createNullRow(leftRows[0] ?? {});
          result.push({ ...nullLeft, ...right });
        }
      }
    }

    return result;
  }

  private createNullRow(template: Row): Row {
    const result: Row = {};
    for (const key of Object.keys(template)) {
      result[key] = null;
    }
    return result;
  }

  private hasAggregates(columns: SelectColumn[]): boolean {
    return columns.some(col => this.expressionHasAggregate(col.expression));
  }

  private expressionHasAggregate(expr: Expression): boolean {
    if (expr.type === 'FunctionCall') {
      const name = expr.name.toUpperCase();
      if (['COUNT', 'SUM', 'AVG', 'MIN', 'MAX'].includes(name)) {
        return true;
      }
      return expr.args.some(arg => this.expressionHasAggregate(arg));
    }
    if (expr.type === 'BinaryExpr') {
      return this.expressionHasAggregate(expr.left) || this.expressionHasAggregate(expr.right);
    }
    return false;
  }

  private applyGroupBy(rows: Row[], groupBy: Expression[] | null, columns: SelectColumn[]): Row[] {
    if (rows.length === 0) return rows;

    // Group rows by group key
    const groups = new Map<string, Row[]>();

    if (!groupBy || groupBy.length === 0) {
      // No GROUP BY - treat all rows as one group
      groups.set('__all__', rows);
    } else {
      for (const row of rows) {
        const key = groupBy.map(expr => JSON.stringify(this.evaluateExpression(expr, row))).join('|');
        if (!groups.has(key)) {
          groups.set(key, []);
        }
        groups.get(key)!.push(row);
      }
    }

    // Calculate aggregates for each group
    const result: Row[] = [];
    for (const groupRows of groups.values()) {
      const resultRow: Row = {};

      // Copy group by column values from first row
      if (groupBy) {
        for (const expr of groupBy) {
          if (expr.type === 'ColumnRef') {
            resultRow[expr.column] = groupRows[0][expr.column];
          }
        }
      }

      // Evaluate each column expression (including aggregates)
      for (const col of columns) {
        const value = this.evaluateExpressionWithAggregates(col.expression, groupRows);
        const alias = col.alias ?? this.expressionToColumnName(col.expression);
        resultRow[alias] = value;

        // Also store under canonical expression form for HAVING clause
        const exprKey = this.expressionToColumnName(col.expression);
        if (exprKey !== alias) {
          resultRow[exprKey] = value;
        }
      }

      // Store the group rows reference for potential HAVING evaluation
      resultRow['__groupRows__'] = groupRows;

      result.push(resultRow);
    }

    return result;
  }

  private evaluateExpressionWithAggregates(expr: Expression, rows: Row[]): unknown {
    if (expr.type === 'FunctionCall') {
      const name = expr.name.toUpperCase();

      switch (name) {
        case 'COUNT': {
          if (expr.args.length === 0 || (expr.args[0].type === 'ColumnRef' && expr.args[0].column === '*')) {
            return rows.length;
          }
          const values = rows.map(r => this.evaluateExpression(expr.args[0], r)).filter(v => v !== null);
          if (expr.distinct) {
            return new Set(values.map(v => JSON.stringify(v))).size;
          }
          return values.length;
        }
        case 'SUM': {
          const values = rows.map(r => this.evaluateExpression(expr.args[0], r)).filter(v => v !== null);
          return values.reduce((sum: number, v) => sum + Number(v), 0);
        }
        case 'AVG': {
          const values = rows.map(r => this.evaluateExpression(expr.args[0], r)).filter(v => v !== null);
          if (values.length === 0) return null;
          const sum = values.reduce((s: number, v) => s + Number(v), 0);
          return sum / values.length;
        }
        case 'MIN': {
          const values = rows.map(r => this.evaluateExpression(expr.args[0], r)).filter(v => v !== null);
          if (values.length === 0) return null;
          return Math.min(...values.map(Number));
        }
        case 'MAX': {
          const values = rows.map(r => this.evaluateExpression(expr.args[0], r)).filter(v => v !== null);
          if (values.length === 0) return null;
          return Math.max(...values.map(Number));
        }
        default:
          // Non-aggregate function - evaluate on first row
          return this.evaluateExpression(expr, rows[0] ?? {});
      }
    }

    if (expr.type === 'BinaryExpr') {
      const left = this.evaluateExpressionWithAggregates(expr.left, rows);
      const right = this.evaluateExpressionWithAggregates(expr.right, rows);
      return this.applyBinaryOperator(expr.operator, left, right);
    }

    // For non-aggregate expressions, use first row
    return this.evaluateExpression(expr, rows[0] ?? {});
  }

  private applyOrderBy(rows: Row[], orderBy: { expression: Expression; direction: 'ASC' | 'DESC' }[]): Row[] {
    return [...rows].sort((a, b) => {
      for (const clause of orderBy) {
        const aVal = this.evaluateExpression(clause.expression, a);
        const bVal = this.evaluateExpression(clause.expression, b);

        let comparison = 0;
        if (aVal === null && bVal === null) comparison = 0;
        else if (aVal === null) comparison = 1;
        else if (bVal === null) comparison = -1;
        else if (typeof aVal === 'number' && typeof bVal === 'number') {
          comparison = aVal - bVal;
        } else {
          comparison = String(aVal).localeCompare(String(bVal));
        }

        if (clause.direction === 'DESC') comparison = -comparison;
        if (comparison !== 0) return comparison;
      }
      return 0;
    });
  }

  private projectColumns(rows: Row[], columns: SelectColumn[]): Row[] {
    return rows.map(row => {
      const result: Row = {};
      for (const col of columns) {
        const expr = col.expression;

        // Handle SELECT * - expand all columns
        if (expr.type === 'ColumnRef' && expr.column === '*') {
          if (expr.table) {
            // table.* - include columns with that table prefix
            for (const [key, value] of Object.entries(row)) {
              const baseName = key.includes('.') ? key.split('.').pop()! : key;
              if (key.startsWith(`${expr.table}.`)) {
                result[baseName] = value;
              }
            }
          } else {
            // * - include all columns, prefer non-prefixed names
            for (const [key, value] of Object.entries(row)) {
              if (!key.includes('.')) {
                result[key] = value;
              }
            }
            // If no non-prefixed columns, use all
            if (Object.keys(result).length === 0) {
              Object.assign(result, row);
            }
          }
        } else {
          const alias = col.alias ?? this.expressionToColumnName(expr);

          // Check if already calculated (e.g., from GROUP BY)
          if (alias in row) {
            result[alias] = row[alias];
          } else {
            result[alias] = this.evaluateExpression(expr, row);
          }
        }
      }
      return result;
    });
  }

  private applyDistinct(rows: Row[]): Row[] {
    const seen = new Set<string>();
    const result: Row[] = [];

    for (const row of rows) {
      const key = JSON.stringify(row);
      if (!seen.has(key)) {
        seen.add(key);
        result.push(row);
      }
    }

    return result;
  }

  private extractColumnNames(columns: SelectColumn[], _sampleRow?: Row): string[] {
    return columns.map(col => {
      if (col.alias) return col.alias;
      return this.expressionToColumnName(col.expression);
    });
  }

  private expressionToColumnName(expr: Expression): string {
    if (expr.type === 'ColumnRef') {
      return expr.table ? `${expr.table}.${expr.column}` : expr.column;
    }
    if (expr.type === 'FunctionCall') {
      return `${expr.name}(${expr.args.map(a => this.expressionToColumnName(a)).join(', ')})`;
    }
    if (expr.type === 'Literal') {
      return String(expr.value);
    }
    return 'column';
  }

  // INSERT execution
  private async executeInsert(stmt: InsertStatement): Promise<QueryResult> {
    const schema = await this.storage.getSchema(stmt.table);
    if (!schema) {
      throw new ExecutorError(`Table '${stmt.table}' does not exist`);
    }

    const existingRows = (await this.storage.getTable(stmt.table)) ?? [];
    const newRows: Row[] = [];
    let lastInsertId: number | undefined;

    for (const valueRow of stmt.values) {
      const row: Row = {};

      // Map values to columns
      const columns = stmt.columns ?? schema.columns.map(c => c.name);

      for (let i = 0; i < columns.length; i++) {
        const colName = columns[i];
        const value = valueRow[i] ? this.evaluateExpression(valueRow[i], {}) : null;
        row[colName] = value;
      }

      // Handle auto-increment
      if (schema.autoIncrementColumn) {
        const colName = schema.autoIncrementColumn;
        if (row[colName] === null || row[colName] === undefined) {
          schema.autoIncrementValue = (schema.autoIncrementValue ?? 0) + 1;
          row[colName] = schema.autoIncrementValue;
          lastInsertId = schema.autoIncrementValue;
        }
      }

      // Apply defaults for missing columns
      for (const colSchema of schema.columns) {
        if (!(colSchema.name in row) || row[colSchema.name] === undefined) {
          row[colSchema.name] = colSchema.defaultValue ?? null;
        }
      }

      newRows.push(row);
    }

    await this.storage.setTable(stmt.table, [...existingRows, ...newRows]);
    await this.storage.setSchema(stmt.table, schema);

    return {
      rows: [],
      rowCount: 0,
      columns: [],
      affectedRows: newRows.length,
      lastInsertId,
    };
  }

  // UPDATE execution
  private async executeUpdate(stmt: UpdateStatement): Promise<QueryResult> {
    const schema = await this.storage.getSchema(stmt.table);
    if (!schema) {
      throw new ExecutorError(`Table '${stmt.table}' does not exist`);
    }

    const rows = (await this.storage.getTable(stmt.table)) ?? [];
    let affectedRows = 0;

    for (const row of rows) {
      if (!stmt.where || this.evaluateCondition(stmt.where, row)) {
        for (const assignment of stmt.assignments) {
          row[assignment.column] = this.evaluateExpression(assignment.value, row);
        }
        affectedRows++;
      }
    }

    await this.storage.setTable(stmt.table, rows);

    return {
      rows: [],
      rowCount: 0,
      columns: [],
      affectedRows,
    };
  }

  // DELETE execution
  private async executeDelete(stmt: DeleteStatement): Promise<QueryResult> {
    const schema = await this.storage.getSchema(stmt.table);
    if (!schema) {
      throw new ExecutorError(`Table '${stmt.table}' does not exist`);
    }

    const rows = (await this.storage.getTable(stmt.table)) ?? [];
    const remaining = rows.filter(row => {
      if (!stmt.where) return false;
      return !this.evaluateCondition(stmt.where, row);
    });

    const affectedRows = rows.length - remaining.length;
    await this.storage.setTable(stmt.table, remaining);

    return {
      rows: [],
      rowCount: 0,
      columns: [],
      affectedRows,
    };
  }

  // CREATE TABLE execution
  private async executeCreateTable(stmt: CreateTableStatement): Promise<QueryResult> {
    const exists = await this.storage.hasTable(stmt.table);

    if (exists) {
      if (stmt.ifNotExists) {
        return { rows: [], rowCount: 0, columns: [] };
      }
      throw new ExecutorError(`Table '${stmt.table}' already exists`);
    }

    const columns: ColumnSchema[] = stmt.columns.map(col => ({
      name: col.name,
      type: col.dataType.type,
      nullable: col.nullable,
      defaultValue: col.defaultValue ? this.evaluateExpression(col.defaultValue, {}) : undefined,
      primaryKey: col.primaryKey,
      autoIncrement: col.autoIncrement,
      unique: col.unique,
    }));

    const primaryKey = columns.find(c => c.primaryKey)?.name;
    const autoIncrementColumn = columns.find(c => c.autoIncrement)?.name;

    const schema: TableSchema = {
      name: stmt.table,
      columns,
      primaryKey,
      autoIncrementColumn,
      autoIncrementValue: 0,
    };

    await this.storage.setSchema(stmt.table, schema);
    await this.storage.setTable(stmt.table, []);

    return { rows: [], rowCount: 0, columns: [] };
  }

  // DROP TABLE execution
  private async executeDropTable(stmt: DropTableStatement): Promise<QueryResult> {
    const exists = await this.storage.hasTable(stmt.table);

    if (!exists) {
      if (stmt.ifExists) {
        return { rows: [], rowCount: 0, columns: [] };
      }
      throw new ExecutorError(`Table '${stmt.table}' does not exist`);
    }

    await this.storage.deleteTable(stmt.table);

    return { rows: [], rowCount: 0, columns: [] };
  }

  // ALTER TABLE execution
  private async executeAlterTable(stmt: AlterTableStatement): Promise<QueryResult> {
    const schema = await this.storage.getSchema(stmt.table);
    if (!schema) {
      throw new ExecutorError(`Table '${stmt.table}' does not exist`);
    }

    switch (stmt.action.type) {
      case 'ADD_COLUMN': {
        const newCol: ColumnSchema = {
          name: stmt.action.column.name,
          type: stmt.action.column.dataType.type,
          nullable: stmt.action.column.nullable,
          defaultValue: stmt.action.column.defaultValue
            ? this.evaluateExpression(stmt.action.column.defaultValue, {})
            : undefined,
          primaryKey: stmt.action.column.primaryKey,
          autoIncrement: stmt.action.column.autoIncrement,
          unique: stmt.action.column.unique,
        };
        schema.columns.push(newCol);

        // Add default value to existing rows
        const rows = (await this.storage.getTable(stmt.table)) ?? [];
        for (const row of rows) {
          row[newCol.name] = newCol.defaultValue ?? null;
        }
        await this.storage.setTable(stmt.table, rows);
        break;
      }
      case 'DROP_COLUMN': {
        const dropAction = stmt.action as { type: 'DROP_COLUMN'; column: string };
        const colIndex = schema.columns.findIndex(c => c.name.toLowerCase() === dropAction.column.toLowerCase());
        if (colIndex === -1) {
          throw new ExecutorError(`Column '${dropAction.column}' does not exist`);
        }
        schema.columns.splice(colIndex, 1);

        // Remove column from existing rows
        const rows = (await this.storage.getTable(stmt.table)) ?? [];
        for (const row of rows) {
          delete row[dropAction.column];
        }
        await this.storage.setTable(stmt.table, rows);
        break;
      }
    }

    await this.storage.setSchema(stmt.table, schema);

    return { rows: [], rowCount: 0, columns: [] };
  }

  // Expression evaluation
  private evaluateExpression(expr: Expression, row: Row): unknown {
    switch (expr.type) {
      case 'Literal':
        return expr.value;

      case 'ColumnRef':
        if (expr.column === '*') {
          return row;
        }
        if (expr.table) {
          // Try with table prefix first (case-insensitive)
          const prefixedKey = `${expr.table}.${expr.column}`;
          const foundKey = Object.keys(row).find(k => k.toLowerCase() === prefixedKey.toLowerCase());
          if (foundKey) {
            return row[foundKey];
          }
        }
        // Case-insensitive column lookup - try exact match first
        const exactKey = Object.keys(row).find(k => k.toLowerCase() === expr.column.toLowerCase());
        if (exactKey) {
          return row[exactKey];
        }
        // Try to find a prefixed key that ends with .column
        const suffixKey = Object.keys(row).find(k => {
          const parts = k.toLowerCase().split('.');
          return parts[parts.length - 1] === expr.column.toLowerCase();
        });
        return suffixKey ? row[suffixKey] : undefined;

      case 'BinaryExpr':
        return this.evaluateBinaryExpr(expr, row);

      case 'UnaryExpr':
        return this.evaluateUnaryExpr(expr, row);

      case 'FunctionCall':
        return this.evaluateFunctionCall(expr, row);

      case 'Placeholder':
        if (expr.name) {
          // Named placeholder - not yet supported
          throw new ExecutorError('Named placeholders not yet supported');
        }
        return this.params[expr.index];

      case 'InExpr':
        return this.evaluateInExpr(expr, row);

      case 'BetweenExpr':
        return this.evaluateBetweenExpr(expr, row);

      case 'LikeExpr':
        return this.evaluateLikeExpr(expr, row);

      case 'IsNullExpr':
        return this.evaluateIsNullExpr(expr, row);

      case 'CaseExpr':
        return this.evaluateCaseExpr(expr, row);

      case 'Subquery':
        throw new ExecutorError('Subqueries in expressions not yet fully supported');

      default:
        throw new ExecutorError(`Unknown expression type: ${(expr as Expression).type}`);
    }
  }

  private evaluateCondition(expr: Expression, row: Row): boolean {
    const result = this.evaluateExpression(expr, row);
    return Boolean(result);
  }

  private evaluateConditionWithAggregates(expr: Expression, rows: Row[]): boolean {
    const result = this.evaluateExpressionWithAggregates(expr, rows);
    return Boolean(result);
  }

  private evaluateBinaryExpr(expr: BinaryExpr, row: Row): unknown {
    const left = this.evaluateExpression(expr.left, row);
    const right = this.evaluateExpression(expr.right, row);
    return this.applyBinaryOperator(expr.operator, left, right);
  }

  private applyBinaryOperator(operator: string, left: unknown, right: unknown): unknown {
    switch (operator) {
      case 'AND':
        return Boolean(left) && Boolean(right);
      case 'OR':
        return Boolean(left) || Boolean(right);
      case '=':
        return left === right;
      case '!=':
      case '<>':
        return left !== right;
      case '<':
        return (left as number) < (right as number);
      case '>':
        return (left as number) > (right as number);
      case '<=':
        return (left as number) <= (right as number);
      case '>=':
        return (left as number) >= (right as number);
      case '+':
        return Number(left) + Number(right);
      case '-':
        return Number(left) - Number(right);
      case '*':
        return Number(left) * Number(right);
      case '/':
        return Number(left) / Number(right);
      case '%':
        return Number(left) % Number(right);
      case '||':
        return String(left) + String(right);
      default:
        throw new ExecutorError(`Unknown operator: ${operator}`);
    }
  }

  private evaluateUnaryExpr(expr: UnaryExpr, row: Row): unknown {
    const operand = this.evaluateExpression(expr.operand, row);

    switch (expr.operator) {
      case 'NOT':
        return !operand;
      case '-':
        return -Number(operand);
      default:
        throw new ExecutorError(`Unknown unary operator: ${expr.operator}`);
    }
  }

  private evaluateFunctionCall(expr: FunctionCall, row: Row): unknown {
    const name = expr.name.toUpperCase();
    const args = expr.args.map(a => this.evaluateExpression(a, row));

    switch (name) {
      case 'UPPER':
        return String(args[0]).toUpperCase();
      case 'LOWER':
        return String(args[0]).toLowerCase();
      case 'LENGTH':
        return String(args[0]).length;
      case 'TRIM':
        return String(args[0]).trim();
      case 'SUBSTR':
      case 'SUBSTRING':
        return String(args[0]).substring(Number(args[1]) - 1, args[2] ? Number(args[1]) - 1 + Number(args[2]) : undefined);
      case 'CONCAT':
        return args.map(String).join('');
      case 'REPLACE':
        return String(args[0]).replace(new RegExp(String(args[1]), 'g'), String(args[2]));
      case 'COALESCE':
        return args.find(a => a !== null) ?? null;
      case 'NULLIF':
        return args[0] === args[1] ? null : args[0];
      case 'NOW':
      case 'CURRENT_TIMESTAMP':
        return new Date().toISOString();
      case 'CURRENT_DATE':
        return new Date().toISOString().split('T')[0];
      case 'CURRENT_TIME':
        return new Date().toISOString().split('T')[1].split('.')[0];
      case 'ABS':
        return Math.abs(Number(args[0]));
      case 'ROUND':
        return Math.round(Number(args[0]) * Math.pow(10, Number(args[1] ?? 0))) / Math.pow(10, Number(args[1] ?? 0));
      case 'FLOOR':
        return Math.floor(Number(args[0]));
      case 'CEIL':
      case 'CEILING':
        return Math.ceil(Number(args[0]));
      case 'SQRT':
        return Math.sqrt(Number(args[0]));
      case 'POWER':
      case 'POW':
        return Math.pow(Number(args[0]), Number(args[1]));
      // Aggregate functions return first row value when used outside GROUP BY context
      case 'COUNT':
      case 'SUM':
      case 'AVG':
      case 'MIN':
      case 'MAX':
        return args[0];
      default:
        throw new ExecutorError(`Unknown function: ${name}`);
    }
  }

  private evaluateInExpr(expr: InExpr, row: Row): boolean {
    const left = this.evaluateExpression(expr.left, row);

    if (expr.values) {
      const values = expr.values.map(v => this.evaluateExpression(v, row));
      const result = values.some(v => v === left);
      return expr.not ? !result : result;
    }

    // Subquery IN - not fully implemented
    throw new ExecutorError('Subquery IN not yet supported');
  }

  private evaluateBetweenExpr(expr: BetweenExpr, row: Row): boolean {
    const value = this.evaluateExpression(expr.left, row) as number;
    const low = this.evaluateExpression(expr.low, row) as number;
    const high = this.evaluateExpression(expr.high, row) as number;
    const result = value >= low && value <= high;
    return expr.not ? !result : result;
  }

  private evaluateLikeExpr(expr: LikeExpr, row: Row): boolean {
    const value = String(this.evaluateExpression(expr.left, row));
    const pattern = String(this.evaluateExpression(expr.pattern, row));

    // Convert SQL LIKE pattern to regex
    const regex = new RegExp(
      '^' +
        pattern
          .replace(/[.+^${}()|[\]\\]/g, '\\$&')
          .replace(/%/g, '.*')
          .replace(/_/g, '.') +
        '$',
      'i'
    );

    const result = regex.test(value);
    return expr.not ? !result : result;
  }

  private evaluateIsNullExpr(expr: IsNullExpr, row: Row): boolean {
    const value = this.evaluateExpression(expr.left, row);
    const result = value === null || value === undefined;
    return expr.not ? !result : result;
  }

  private evaluateCaseExpr(expr: CaseExpr, row: Row): unknown {
    if (expr.operand) {
      // Simple CASE
      const operandValue = this.evaluateExpression(expr.operand, row);
      for (const { when, then } of expr.whenClauses) {
        const whenValue = this.evaluateExpression(when, row);
        if (operandValue === whenValue) {
          return this.evaluateExpression(then, row);
        }
      }
    } else {
      // Searched CASE
      for (const { when, then } of expr.whenClauses) {
        if (this.evaluateCondition(when, row)) {
          return this.evaluateExpression(then, row);
        }
      }
    }

    return expr.elseClause ? this.evaluateExpression(expr.elseClause, row) : null;
  }
}
