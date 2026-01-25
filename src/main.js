const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");
const initSqlJs = require("sql.js");

let mainWindow;
let db;
let SQL;

// Initialize database
async function initDatabase() {
  try {
    SQL = await initSqlJs({
      locateFile: (file) =>
        path.join(__dirname, "..", "node_modules", "sql.js", "dist", file),
    });

    const dbPath = path.join(app.getPath("userData"), "library.db");

    // Load existing database or create new one
    if (fs.existsSync(dbPath)) {
      const buffer = fs.readFileSync(dbPath);
      db = new SQL.Database(buffer);
    } else {
      db = new SQL.Database();
    }

    // Create tables
    db.run(`
      CREATE TABLE IF NOT EXISTS students (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        phone TEXT,
        department TEXT,
        year TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS books (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        isbn TEXT UNIQUE NOT NULL,
        title TEXT NOT NULL,
        author TEXT NOT NULL,
        publisher TEXT,
        category TEXT,
        total_copies INTEGER DEFAULT 1,
        available_copies INTEGER DEFAULT 1,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id TEXT NOT NULL,
        isbn TEXT NOT NULL,
        issue_date TEXT DEFAULT CURRENT_TIMESTAMP,
        due_date TEXT,
        return_date TEXT,
        status TEXT DEFAULT 'issued',
        FOREIGN KEY (student_id) REFERENCES students(student_id),
        FOREIGN KEY (isbn) REFERENCES books(isbn)
      );
    `);

    // Check if due_date column exists, if not add it (for database migration)
    try {
      const checkColumn = db.exec("PRAGMA table_info(transactions)");
      if (checkColumn.length > 0) {
        const columns = checkColumn[0].values.map((row) => row[1]); // Get column names
        if (!columns.includes("due_date")) {
          console.log(
            "Adding missing due_date column to transactions table...",
          );
          db.run("ALTER TABLE transactions ADD COLUMN due_date TEXT");
        }
      }
    } catch (error) {
      console.log("Column check/migration:", error.message);
    }

    // Save database
    saveDatabase();
    console.log("Database initialized successfully");
  } catch (error) {
    console.error("Database initialization error:", error);
  }
}

function saveDatabase() {
  try {
    const dbPath = path.join(app.getPath("userData"), "library.db");
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbPath, buffer);
  } catch (error) {
    console.error("Error saving database:", error);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "index.html"));

  // Uncomment for development
  // mainWindow.webContents.openDevTools();
}

// IPC Handlers for Database Operations

// Students
ipcMain.handle("add-student", (event, student) => {
  try {
    db.run(
      `
      INSERT INTO students (student_id, name, email, phone, department, year)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
      [
        student.student_id,
        student.name,
        student.email,
        student.phone,
        student.department,
        student.year,
      ],
    );
    saveDatabase();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle("get-students", () => {
  try {
    const result = db.exec("SELECT * FROM students ORDER BY created_at DESC");
    if (result.length === 0) return [];

    const columns = result[0].columns;
    const values = result[0].values;

    return values.map((row) => {
      const obj = {};
      columns.forEach((col, idx) => {
        obj[col] = row[idx];
      });
      return obj;
    });
  } catch (error) {
    console.error("Error getting students:", error);
    return [];
  }
});

ipcMain.handle("update-student", (event, student) => {
  try {
    db.run(
      `
      UPDATE students SET name = ?, email = ?, phone = ?, department = ?, year = ?
      WHERE student_id = ?
    `,
      [
        student.name,
        student.email,
        student.phone,
        student.department,
        student.year,
        student.student_id,
      ],
    );
    saveDatabase();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle("delete-student", (event, studentId) => {
  try {
    db.run("DELETE FROM students WHERE student_id = ?", [studentId]);
    saveDatabase();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Books
ipcMain.handle("add-book", (event, book) => {
  try {
    db.run(
      `
      INSERT INTO books (isbn, title, author, publisher, category, total_copies, available_copies)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
      [
        book.isbn,
        book.title,
        book.author,
        book.publisher,
        book.category,
        book.total_copies,
        book.available_copies,
      ],
    );
    saveDatabase();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle("get-books", () => {
  try {
    const result = db.exec("SELECT * FROM books ORDER BY created_at DESC");
    if (result.length === 0) return [];

    const columns = result[0].columns;
    const values = result[0].values;

    return values.map((row) => {
      const obj = {};
      columns.forEach((col, idx) => {
        obj[col] = row[idx];
      });
      return obj;
    });
  } catch (error) {
    console.error("Error getting books:", error);
    return [];
  }
});

ipcMain.handle("update-book", (event, book) => {
  try {
    db.run(
      `
      UPDATE books SET title = ?, author = ?, publisher = ?, category = ?, total_copies = ?, available_copies = ?
      WHERE isbn = ?
    `,
      [
        book.title,
        book.author,
        book.publisher,
        book.category,
        book.total_copies,
        book.available_copies,
        book.isbn,
      ],
    );
    saveDatabase();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle("delete-book", (event, isbn) => {
  try {
    db.run("DELETE FROM books WHERE isbn = ?", [isbn]);
    saveDatabase();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Transactions - Issue Book
ipcMain.handle("issue-book", (event, transaction) => {
  try {
    // Check if book is available
    const bookResult = db.exec(
      "SELECT available_copies FROM books WHERE isbn = ?",
      [transaction.isbn],
    );

    if (bookResult.length === 0 || bookResult[0].values.length === 0) {
      return { success: false, error: "Book not found" };
    }

    const availableCopies = bookResult[0].values[0][0];

    if (availableCopies <= 0) {
      return { success: false, error: "No copies available" };
    }

    // Check if student exists
    const studentResult = db.exec(
      "SELECT student_id FROM students WHERE student_id = ?",
      [transaction.student_id],
    );

    if (studentResult.length === 0 || studentResult[0].values.length === 0) {
      return { success: false, error: "Student not found" };
    }

    // Calculate due date (14 days from now)
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 14);
    const dueDateStr = dueDate.toISOString();

    // Insert transaction
    db.run(
      `INSERT INTO transactions (student_id, isbn, due_date, status)
       VALUES (?, ?, ?, 'issued')`,
      [transaction.student_id, transaction.isbn, dueDateStr],
    );

    // Update available copies
    db.run(
      "UPDATE books SET available_copies = available_copies - 1 WHERE isbn = ?",
      [transaction.isbn],
    );

    saveDatabase();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Transactions - Return Book
ipcMain.handle("return-book", (event, transactionId) => {
  try {
    // Get transaction details
    const transResult = db.exec(
      "SELECT isbn, status FROM transactions WHERE id = ?",
      [transactionId],
    );

    if (transResult.length === 0 || transResult[0].values.length === 0) {
      return { success: false, error: "Transaction not found" };
    }

    const isbn = transResult[0].values[0][0];
    const status = transResult[0].values[0][1];

    if (status === "returned") {
      return { success: false, error: "Book already returned" };
    }

    // Update transaction
    db.run(
      `UPDATE transactions SET status = 'returned', return_date = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [transactionId],
    );

    // Update available copies
    db.run(
      "UPDATE books SET available_copies = available_copies + 1 WHERE isbn = ?",
      [isbn],
    );

    saveDatabase();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Get all transactions
ipcMain.handle("get-transactions", () => {
  try {
    const result = db.exec(`
      SELECT 
        t.id,
        t.student_id,
        s.name as student_name,
        t.isbn,
        b.title as book_title,
        t.issue_date,
        t.due_date,
        t.return_date,
        t.status
      FROM transactions t
      LEFT JOIN students s ON t.student_id = s.student_id
      LEFT JOIN books b ON t.isbn = b.isbn
      ORDER BY t.issue_date DESC
    `);

    if (result.length === 0) return [];

    const columns = result[0].columns;
    const values = result[0].values;

    return values.map((row) => {
      const obj = {};
      columns.forEach((col, idx) => {
        obj[col] = row[idx];
      });
      return obj;
    });
  } catch (error) {
    console.error("Error getting transactions:", error);
    return [];
  }
});

// Get student's borrowed books
ipcMain.handle("get-student-books", (event, studentId) => {
  try {
    const result = db.exec(
      `
      SELECT 
        t.id,
        t.isbn,
        b.title,
        b.author,
        t.issue_date,
        t.due_date,
        t.status
      FROM transactions t
      LEFT JOIN books b ON t.isbn = b.isbn
      WHERE t.student_id = ? AND t.status = 'issued'
      ORDER BY t.issue_date DESC
    `,
      [studentId],
    );

    if (result.length === 0) return [];

    const columns = result[0].columns;
    const values = result[0].values;

    return values.map((row) => {
      const obj = {};
      columns.forEach((col, idx) => {
        obj[col] = row[idx];
      });
      return obj;
    });
  } catch (error) {
    console.error("Error getting student books:", error);
    return [];
  }
});

// Statistics
ipcMain.handle("get-statistics", () => {
  try {
    let totalStudents = 0;
    let totalBooks = 0;
    let totalCopies = 0;
    let availableCopies = 0;

    const studentsResult = db.exec("SELECT COUNT(*) as count FROM students");
    if (studentsResult.length > 0) {
      totalStudents = studentsResult[0].values[0][0];
    }

    const booksResult = db.exec("SELECT COUNT(*) as count FROM books");
    if (booksResult.length > 0) {
      totalBooks = booksResult[0].values[0][0];
    }

    const copiesResult = db.exec(
      "SELECT SUM(total_copies) as total, SUM(available_copies) as available FROM books",
    );
    if (copiesResult.length > 0 && copiesResult[0].values.length > 0) {
      totalCopies = copiesResult[0].values[0][0] || 0;
      availableCopies = copiesResult[0].values[0][1] || 0;
    }

    return {
      totalStudents,
      totalBooks,
      totalCopies,
      availableCopies,
      issuedBooks: totalCopies - availableCopies,
    };
  } catch (error) {
    console.error("Error getting statistics:", error);
    return {
      totalStudents: 0,
      totalBooks: 0,
      totalCopies: 0,
      availableCopies: 0,
      issuedBooks: 0,
    };
  }
});

app.whenReady().then(async () => {
  await initDatabase();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  if (db) {
    saveDatabase();
  }
});
