import { describe, it, expect, beforeEach } from 'vitest';
import { WorkerSQL } from '../src/index.js';

describe('WorkerSQL', () => {
  let db: WorkerSQL;

  beforeEach(async () => {
    db = new WorkerSQL();
    await db.init();
  });

  describe('CREATE TABLE', () => {
    it('should create a simple table', async () => {
      await db.query(`
        CREATE TABLE users (
          id INTEGER PRIMARY KEY AUTO_INCREMENT,
          name TEXT NOT NULL,
          email TEXT
        )
      `);

      const tables = await db.tables.list();
      expect(tables).toContain('users');
    });

    it('should create table with IF NOT EXISTS', async () => {
      await db.query('CREATE TABLE IF NOT EXISTS test (id INTEGER)');
      await db.query('CREATE TABLE IF NOT EXISTS test (id INTEGER)');

      const tables = await db.tables.list();
      expect(tables.filter(t => t === 'test')).toHaveLength(1);
    });
  });

  describe('INSERT', () => {
    beforeEach(async () => {
      await db.query(`
        CREATE TABLE users (
          id INTEGER PRIMARY KEY AUTO_INCREMENT,
          name TEXT,
          age INTEGER
        )
      `);
    });

    it('should insert a single row', async () => {
      const result = await db.query(
        'INSERT INTO users (name, age) VALUES (?, ?)',
        ['John', 30]
      );

      expect(result.affectedRows).toBe(1);
      expect(result.lastInsertId).toBe(1);
    });

    it('should insert multiple rows', async () => {
      await db.query(
        'INSERT INTO users (name, age) VALUES (?, ?), (?, ?)',
        ['John', 30, 'Jane', 25]
      );

      const result = await db.query('SELECT COUNT(*) as count FROM users');
      expect(result.rows[0].count).toBe(2);
    });

    it('should auto-increment IDs', async () => {
      await db.query('INSERT INTO users (name) VALUES (?)', ['User1']);
      await db.query('INSERT INTO users (name) VALUES (?)', ['User2']);
      await db.query('INSERT INTO users (name) VALUES (?)', ['User3']);

      const result = await db.query('SELECT id FROM users ORDER BY id');
      expect(result.rows.map(r => r.id)).toEqual([1, 2, 3]);
    });
  });

  describe('SELECT', () => {
    beforeEach(async () => {
      await db.query(`
        CREATE TABLE products (
          id INTEGER PRIMARY KEY AUTO_INCREMENT,
          name TEXT,
          price FLOAT,
          category TEXT
        )
      `);
      await db.query(
        'INSERT INTO products (name, price, category) VALUES (?, ?, ?), (?, ?, ?), (?, ?, ?)',
        ['Widget', 10.99, 'A', 'Gadget', 25.50, 'B', 'Thing', 5.00, 'A']
      );
    });

    it('should select all rows', async () => {
      const result = await db.query('SELECT * FROM products');
      expect(result.rows).toHaveLength(3);
    });

    it('should select specific columns', async () => {
      const result = await db.query('SELECT name, price FROM products');
      expect(result.columns).toEqual(['name', 'price']);
      expect(Object.keys(result.rows[0])).toEqual(['name', 'price']);
    });

    it('should filter with WHERE', async () => {
      const result = await db.query('SELECT * FROM products WHERE category = ?', ['A']);
      expect(result.rows).toHaveLength(2);
    });

    it('should handle LIKE patterns', async () => {
      const result = await db.query("SELECT * FROM products WHERE name LIKE '%dget'");
      expect(result.rows).toHaveLength(2); // Widget and Gadget
    });

    it('should handle IN clause', async () => {
      const result = await db.query("SELECT * FROM products WHERE name IN ('Widget', 'Thing')");
      expect(result.rows).toHaveLength(2);
    });

    it('should handle BETWEEN', async () => {
      const result = await db.query('SELECT * FROM products WHERE price BETWEEN 5 AND 15');
      expect(result.rows).toHaveLength(2); // Widget (10.99) and Thing (5.00)
    });

    it('should order results', async () => {
      const result = await db.query('SELECT * FROM products ORDER BY price DESC');
      expect(result.rows[0].name).toBe('Gadget');
      expect(result.rows[2].name).toBe('Thing');
    });

    it('should limit results', async () => {
      const result = await db.query('SELECT * FROM products LIMIT 2');
      expect(result.rows).toHaveLength(2);
    });

    it('should handle OFFSET', async () => {
      const result = await db.query('SELECT * FROM products ORDER BY id LIMIT 2 OFFSET 1');
      expect(result.rows).toHaveLength(2);
      expect(result.rows[0].id).toBe(2);
    });

    it('should select DISTINCT values', async () => {
      const result = await db.query('SELECT DISTINCT category FROM products');
      expect(result.rows).toHaveLength(2);
    });
  });

  describe('Aggregate Functions', () => {
    beforeEach(async () => {
      await db.query(`
        CREATE TABLE sales (
          id INTEGER PRIMARY KEY AUTO_INCREMENT,
          product TEXT,
          amount FLOAT,
          quantity INTEGER
        )
      `);
      await db.query(
        'INSERT INTO sales (product, amount, quantity) VALUES (?, ?, ?), (?, ?, ?), (?, ?, ?), (?, ?, ?)',
        ['A', 100, 2, 'A', 200, 3, 'B', 150, 1, 'B', 50, 4]
      );
    });

    it('should COUNT rows', async () => {
      const result = await db.query('SELECT COUNT(*) as total FROM sales');
      expect(result.rows[0].total).toBe(4);
    });

    it('should SUM values', async () => {
      const result = await db.query('SELECT SUM(amount) as total FROM sales');
      expect(result.rows[0].total).toBe(500);
    });

    it('should calculate AVG', async () => {
      const result = await db.query('SELECT AVG(amount) as avg FROM sales');
      expect(result.rows[0].avg).toBe(125);
    });

    it('should find MIN and MAX', async () => {
      const result = await db.query('SELECT MIN(amount) as min, MAX(amount) as max FROM sales');
      expect(result.rows[0].min).toBe(50);
      expect(result.rows[0].max).toBe(200);
    });

    it('should GROUP BY', async () => {
      const result = await db.query(`
        SELECT product, SUM(amount) as total
        FROM sales
        GROUP BY product
        ORDER BY product
      `);
      expect(result.rows).toHaveLength(2);
      expect(result.rows[0].product).toBe('A');
      expect(result.rows[0].total).toBe(300);
      expect(result.rows[1].product).toBe('B');
      expect(result.rows[1].total).toBe(200);
    });

    it('should filter with HAVING', async () => {
      const result = await db.query(`
        SELECT product, SUM(amount) as total
        FROM sales
        GROUP BY product
        HAVING SUM(amount) > 250
      `);
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].product).toBe('A');
    });
  });

  describe('JOIN', () => {
    beforeEach(async () => {
      await db.query('CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)');
      await db.query('CREATE TABLE orders (id INTEGER PRIMARY KEY, user_id INTEGER, total FLOAT)');

      await db.query('INSERT INTO users (id, name) VALUES (?, ?), (?, ?)', [1, 'Alice', 2, 'Bob']);
      await db.query('INSERT INTO orders (id, user_id, total) VALUES (?, ?, ?), (?, ?, ?), (?, ?, ?)',
        [1, 1, 100, 2, 1, 200, 3, 2, 150]);
    });

    it('should INNER JOIN tables', async () => {
      const result = await db.query(`
        SELECT users.name, orders.total
        FROM users
        INNER JOIN orders ON users.id = orders.user_id
      `);
      expect(result.rows).toHaveLength(3);
    });

    it('should LEFT JOIN tables', async () => {
      await db.query('INSERT INTO users (id, name) VALUES (?, ?)', [3, 'Charlie']);

      const result = await db.query(`
        SELECT users.name as name, orders.total as total
        FROM users
        LEFT JOIN orders ON users.id = orders.user_id
        ORDER BY users.name
      `);
      expect(result.rows).toHaveLength(4);
      expect(result.rows.find(r => r.name === 'Charlie')?.total).toBeNull();
    });
  });

  describe('UPDATE', () => {
    beforeEach(async () => {
      await db.query('CREATE TABLE items (id INTEGER PRIMARY KEY AUTO_INCREMENT, name TEXT, stock INTEGER)');
      await db.query('INSERT INTO items (name, stock) VALUES (?, ?), (?, ?)', ['A', 10, 'B', 20]);
    });

    it('should update all rows', async () => {
      await db.query('UPDATE items SET stock = 0');
      const result = await db.query('SELECT * FROM items');
      expect(result.rows.every(r => r.stock === 0)).toBe(true);
    });

    it('should update with WHERE condition', async () => {
      await db.query('UPDATE items SET stock = ? WHERE name = ?', [50, 'A']);
      const result = await db.query('SELECT * FROM items WHERE name = ?', ['A']);
      expect(result.rows[0].stock).toBe(50);
    });

    it('should return affected rows count', async () => {
      const result = await db.query('UPDATE items SET stock = stock + 5');
      expect(result.affectedRows).toBe(2);
    });
  });

  describe('DELETE', () => {
    beforeEach(async () => {
      await db.query('CREATE TABLE items (id INTEGER PRIMARY KEY AUTO_INCREMENT, name TEXT)');
      await db.query('INSERT INTO items (name) VALUES (?), (?), (?)', ['A', 'B', 'C']);
    });

    it('should delete with WHERE condition', async () => {
      await db.query('DELETE FROM items WHERE name = ?', ['B']);
      const result = await db.query('SELECT * FROM items');
      expect(result.rows).toHaveLength(2);
      expect(result.rows.map(r => r.name)).not.toContain('B');
    });

    it('should return affected rows count', async () => {
      const result = await db.query('DELETE FROM items WHERE name IN (?, ?)', ['A', 'B']);
      expect(result.affectedRows).toBe(2);
    });
  });

  describe('Prepared Statements', () => {
    beforeEach(async () => {
      await db.query('CREATE TABLE users (id INTEGER PRIMARY KEY AUTO_INCREMENT, name TEXT)');
      await db.query('INSERT INTO users (name) VALUES (?), (?), (?)', ['Alice', 'Bob', 'Charlie']);
    });

    it('should prepare and execute statements', async () => {
      const stmt = db.prepare('SELECT * FROM users WHERE name = ?');

      const result1 = await stmt.execute(['Alice']);
      expect(result1.rows).toHaveLength(1);
      expect(result1.rows[0].name).toBe('Alice');

      const result2 = await stmt.execute(['Bob']);
      expect(result2.rows).toHaveLength(1);
      expect(result2.rows[0].name).toBe('Bob');
    });

    it('should return first row with .first()', async () => {
      const stmt = db.prepare('SELECT * FROM users ORDER BY id');
      const first = await stmt.first();
      expect(first?.name).toBe('Alice');
    });

    it('should return all rows with .all()', async () => {
      const stmt = db.prepare('SELECT * FROM users');
      const all = await stmt.all();
      expect(all).toHaveLength(3);
    });
  });

  describe('SQL Functions', () => {
    it('should handle string functions', async () => {
      const result = await db.query("SELECT UPPER('hello') as upper, LOWER('WORLD') as lower");
      expect(result.rows[0].upper).toBe('HELLO');
      expect(result.rows[0].lower).toBe('world');
    });

    it('should handle LENGTH', async () => {
      const result = await db.query("SELECT LENGTH('hello') as len");
      expect(result.rows[0].len).toBe(5);
    });

    it('should handle CONCAT', async () => {
      const result = await db.query("SELECT CONCAT('Hello', ' ', 'World') as greeting");
      expect(result.rows[0].greeting).toBe('Hello World');
    });

    it('should handle COALESCE', async () => {
      const result = await db.query("SELECT COALESCE(NULL, 'default') as value");
      expect(result.rows[0].value).toBe('default');
    });

    it('should handle math functions', async () => {
      const result = await db.query('SELECT ABS(-5) as abs, ROUND(3.7) as round, FLOOR(3.7) as floor');
      expect(result.rows[0].abs).toBe(5);
      expect(result.rows[0].round).toBe(4);
      expect(result.rows[0].floor).toBe(3);
    });
  });

  describe('CASE expressions', () => {
    beforeEach(async () => {
      await db.query('CREATE TABLE items (id INTEGER PRIMARY KEY, status TEXT)');
      await db.query("INSERT INTO items (id, status) VALUES (?, ?), (?, ?), (?, ?)",
        [1, 'active', 2, 'inactive', 3, 'pending']);
    });

    it('should handle simple CASE', async () => {
      const result = await db.query(`
        SELECT id,
          CASE status
            WHEN 'active' THEN 'On'
            WHEN 'inactive' THEN 'Off'
            ELSE 'Unknown'
          END as display
        FROM items
        ORDER BY id
      `);
      expect(result.rows[0].display).toBe('On');
      expect(result.rows[1].display).toBe('Off');
      expect(result.rows[2].display).toBe('Unknown');
    });
  });

  describe('TableAccessor', () => {
    beforeEach(async () => {
      await db.query('CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT)');
      await db.query("INSERT INTO test (id, value) VALUES (1, 'a'), (2, 'b')");
    });

    it('should list tables', async () => {
      const tables = await db.tables.list();
      expect(tables).toContain('test');
    });

    it('should check if table exists', async () => {
      expect(await db.tables.exists('test')).toBe(true);
      expect(await db.tables.exists('nonexistent')).toBe(false);
    });

    it('should describe table schema', async () => {
      const schema = await db.tables.describe('test');
      expect(schema?.name).toBe('test');
      expect(schema?.columns).toHaveLength(2);
    });

    it('should get all rows', async () => {
      const rows = await db.tables.getAll('test');
      expect(rows).toHaveLength(2);
    });
  });
});
