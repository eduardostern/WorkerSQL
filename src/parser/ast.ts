export type Statement =
  | SelectStatement
  | InsertStatement
  | UpdateStatement
  | DeleteStatement
  | CreateTableStatement
  | DropTableStatement
  | AlterTableStatement;

export interface SelectStatement {
  type: 'SELECT';
  distinct: boolean;
  columns: SelectColumn[];
  from: TableReference | null;
  joins: JoinClause[];
  where: Expression | null;
  groupBy: Expression[] | null;
  having: Expression | null;
  orderBy: OrderByClause[] | null;
  limit: LimitClause | null;
}

export interface InsertStatement {
  type: 'INSERT';
  table: string;
  columns: string[] | null;
  values: Expression[][];
  onConflict?: 'IGNORE' | 'REPLACE';
}

export interface UpdateStatement {
  type: 'UPDATE';
  table: string;
  assignments: Assignment[];
  where: Expression | null;
}

export interface DeleteStatement {
  type: 'DELETE';
  table: string;
  where: Expression | null;
}

export interface CreateTableStatement {
  type: 'CREATE_TABLE';
  table: string;
  ifNotExists: boolean;
  columns: ColumnDefinition[];
  constraints: TableConstraint[];
}

export interface DropTableStatement {
  type: 'DROP_TABLE';
  table: string;
  ifExists: boolean;
}

export interface AlterTableStatement {
  type: 'ALTER_TABLE';
  table: string;
  action: AlterAction;
}

export type AlterAction =
  | { type: 'ADD_COLUMN'; column: ColumnDefinition }
  | { type: 'DROP_COLUMN'; column: string }
  | { type: 'RENAME_COLUMN'; oldName: string; newName: string }
  | { type: 'RENAME_TABLE'; newName: string };

export interface SelectColumn {
  expression: Expression;
  alias: string | null;
}

export interface TableReference {
  type: 'Table' | 'Subquery';
  name?: string;
  alias?: string;
  subquery?: SelectStatement;
}

export interface JoinClause {
  type: 'INNER' | 'LEFT' | 'RIGHT' | 'CROSS';
  table: TableReference;
  condition: Expression | null;
}

export interface OrderByClause {
  expression: Expression;
  direction: 'ASC' | 'DESC';
  nulls?: 'FIRST' | 'LAST';
}

export interface LimitClause {
  count: number | Expression;
  offset?: number | Expression;
}

export interface Assignment {
  column: string;
  value: Expression;
}

export interface ColumnDefinition {
  name: string;
  dataType: DataType;
  nullable: boolean;
  defaultValue: Expression | null;
  primaryKey: boolean;
  autoIncrement: boolean;
  unique: boolean;
}

export interface DataType {
  type: string;
  length?: number;
  precision?: number;
  scale?: number;
}

export interface TableConstraint {
  type: 'PRIMARY_KEY' | 'UNIQUE' | 'FOREIGN_KEY' | 'CHECK';
  name?: string;
  columns?: string[];
  references?: { table: string; columns: string[] };
  expression?: Expression;
}

// Expressions
export type Expression =
  | Literal
  | ColumnRef
  | BinaryExpr
  | UnaryExpr
  | FunctionCall
  | SubqueryExpr
  | Placeholder
  | InExpr
  | BetweenExpr
  | LikeExpr
  | IsNullExpr
  | CaseExpr
  | CastExpr;

export interface Literal {
  type: 'Literal';
  value: string | number | boolean | null;
  dataType: 'STRING' | 'NUMBER' | 'BOOLEAN' | 'NULL';
}

export interface ColumnRef {
  type: 'ColumnRef';
  table: string | null;
  column: string;
}

export interface BinaryExpr {
  type: 'BinaryExpr';
  operator: string;
  left: Expression;
  right: Expression;
}

export interface UnaryExpr {
  type: 'UnaryExpr';
  operator: string;
  operand: Expression;
}

export interface FunctionCall {
  type: 'FunctionCall';
  name: string;
  args: Expression[];
  distinct?: boolean;
}

export interface SubqueryExpr {
  type: 'Subquery';
  query: SelectStatement;
}

export interface Placeholder {
  type: 'Placeholder';
  index: number;
  name?: string;
}

export interface InExpr {
  type: 'InExpr';
  left: Expression;
  values?: Expression[];
  subquery?: SelectStatement;
  not: boolean;
}

export interface BetweenExpr {
  type: 'BetweenExpr';
  left: Expression;
  low: Expression;
  high: Expression;
  not: boolean;
}

export interface LikeExpr {
  type: 'LikeExpr';
  left: Expression;
  pattern: Expression;
  escape?: string;
  not: boolean;
}

export interface IsNullExpr {
  type: 'IsNullExpr';
  left: Expression;
  not: boolean;
}

export interface CaseExpr {
  type: 'CaseExpr';
  operand: Expression | null;
  whenClauses: { when: Expression; then: Expression }[];
  elseClause: Expression | null;
}

export interface CastExpr {
  type: 'CastExpr';
  expression: Expression;
  targetType: DataType;
}
