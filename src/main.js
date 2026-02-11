const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  Menu,
  shell,
} = require("electron");
const path = require("path");
const fs = require("fs");
const initSqlJs = require("sql.js");
const { autoUpdater } = require("electron-updater");

let mainWindow;
let db;
let SQL;
let saveTimeout = null;

// Cache for frequently accessed data
let dataCache = {
  students: null,
  books: null,
  transactions: null,
  statistics: null,
  lastUpdate: {
    students: 0,
    books: 0,
    transactions: 0,
    statistics: 0,
  },
};

const CACHE_DURATION = 500; // milliseconds

autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

async function initDatabase() {
  try {
    SQL = await initSqlJs({
      locateFile: (file) =>
        path.join(__dirname, "..", "node_modules", "sql.js", "dist", file),
    });

    const dbPath = path.join(app.getPath("userData"), "library.db");

    if (fs.existsSync(dbPath)) {
      const buffer = fs.readFileSync(dbPath);
      db = new SQL.Database(buffer);
    } else {
      db = new SQL.Database();
    }

    // Create tables with indexes for better performance
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

    // Add indexes for better query performance
    try {
      db.run(
        "CREATE INDEX IF NOT EXISTS idx_student_id ON students(student_id)",
      );
      db.run("CREATE INDEX IF NOT EXISTS idx_book_isbn ON books(isbn)");
      db.run(
        "CREATE INDEX IF NOT EXISTS idx_trans_student ON transactions(student_id)",
      );
      db.run("CREATE INDEX IF NOT EXISTS idx_trans_isbn ON transactions(isbn)");
      db.run(
        "CREATE INDEX IF NOT EXISTS idx_trans_status ON transactions(status)",
      );
    } catch (error) {
      console.log("Index creation (may already exist):", error.message);
    }

    try {
      const checkColumn = db.exec("PRAGMA table_info(transactions)");
      if (checkColumn.length > 0) {
        const columns = checkColumn[0].values.map((row) => row[1]);
        if (!columns.includes("due_date")) {
          db.run("ALTER TABLE transactions ADD COLUMN due_date TEXT");
        }
      }
    } catch (error) {
      console.log("Column check/migration:", error.message);
    }

    await saveDatabase();
  } catch (error) {
    console.error("Database initialization error:", error);
  }
}

async function saveDatabase() {
  try {
    const dbPath = path.join(app.getPath("userData"), "library.db");
    const data = db.export();
    const buffer = Buffer.from(data);

    await fs.promises.writeFile(dbPath, buffer);
  } catch (error) {
    console.error("Error saving database:", error);
  }
}

function debouncedSave() {
  if (saveTimeout) {
    clearTimeout(saveTimeout);
  }

  saveTimeout = setTimeout(async () => {
    await saveDatabase();
  }, 300);
}

function invalidateCache(tables) {
  tables.forEach((table) => {
    dataCache[table] = null;
    dataCache.lastUpdate[table] = 0;
  });
}

function isCacheValid(table) {
  const now = Date.now();
  return (
    dataCache[table] !== null &&
    now - dataCache.lastUpdate[table] < CACHE_DURATION
  );
}

function createMenu() {
  const template = [
    {
      label: "File",
      submenu: [
        {
          label: "Export Data",
          submenu: [
            {
              label: "Export Students",
              click: () => {
                mainWindow.webContents.send("export-students");
              },
            },
            {
              label: "Export Books",
              click: () => {
                mainWindow.webContents.send("export-books");
              },
            },
            {
              label: "Export Transactions",
              click: () => {
                mainWindow.webContents.send("export-transactions");
              },
            },
          ],
        },
        { type: "separator" },
        {
          label: "Backup Database",
          click: async () => {
            const result = await dialog.showSaveDialog(mainWindow, {
              title: "Backup Database",
              defaultPath: `library_backup_${new Date().toISOString().split("T")[0]}.db`,
              filters: [{ name: "Database Files", extensions: ["db"] }],
            });

            if (!result.canceled && result.filePath) {
              try {
                const dbPath = path.join(app.getPath("userData"), "library.db");
                await fs.promises.copyFile(dbPath, result.filePath);
                dialog.showMessageBox(mainWindow, {
                  type: "info",
                  title: "Backup Successful",
                  message: "Database backup created successfully!",
                  buttons: ["OK"],
                });
              } catch (error) {
                dialog.showErrorBox("Backup Failed", error.message);
              }
            }
          },
        },
        {
          label: "Restore Database",
          click: async () => {
            const result = await dialog.showOpenDialog(mainWindow, {
              title: "Restore Database",
              filters: [{ name: "Database Files", extensions: ["db"] }],
              properties: ["openFile"],
            });

            if (!result.canceled && result.filePaths.length > 0) {
              const confirmRestore = await dialog.showMessageBox(mainWindow, {
                type: "warning",
                title: "Confirm Restore",
                message:
                  "This will replace your current database. Are you sure?",
                buttons: ["Cancel", "Restore"],
                defaultId: 0,
                cancelId: 0,
              });

              if (confirmRestore.response === 1) {
                try {
                  const dbPath = path.join(
                    app.getPath("userData"),
                    "library.db",
                  );
                  await fs.promises.copyFile(result.filePaths[0], dbPath);
                  invalidateCache([
                    "students",
                    "books",
                    "transactions",
                    "statistics",
                  ]);
                  dialog.showMessageBox(mainWindow, {
                    type: "info",
                    title: "Restore Successful",
                    message:
                      "Database restored successfully! Please restart the application.",
                    buttons: ["OK"],
                  });
                } catch (error) {
                  dialog.showErrorBox("Restore Failed", error.message);
                }
              }
            }
          },
        },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Help",
      submenu: [
        {
          label: "Check for Updates",
          click: () => {
            checkForUpdates();
          },
        },
        { type: "separator" },
        {
          label: "About",
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: "info",
              title: "About Library Management System",
              message: "Library Management System",
              detail: `Version: ${app.getVersion()}\n\nA comprehensive library management solution for universities.\n\nDeveloped by: Pradeep Kaliyawansha\nLicense: MIT`,
              buttons: ["OK"],
            });
          },
        },
        {
          label: "Documentation",
          click: async () => {
            await shell.openExternal(
              "https://github.com/yourusername/library-management",
            );
          },
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

autoUpdater.on("checking-for-update", () => {
  console.log("Checking for updates...");
});

autoUpdater.on("update-available", (info) => {
  dialog
    .showMessageBox(mainWindow, {
      type: "info",
      title: "Update Available",
      message: `A new version ${info.version} is available!`,
      detail: "Do you want to download it now?",
      buttons: ["Download", "Later"],
      defaultId: 0,
    })
    .then((result) => {
      if (result.response === 0) {
        autoUpdater.downloadUpdate();
        mainWindow.webContents.send("update-downloading");
      }
    });
});

autoUpdater.on("update-not-available", () => {
  dialog.showMessageBox(mainWindow, {
    type: "info",
    title: "No Updates",
    message: "You are already using the latest version.",
    buttons: ["OK"],
  });
});

autoUpdater.on("error", (err) => {
  dialog.showErrorBox(
    "Update Error",
    `Error checking for updates: ${err.message}`,
  );
});

autoUpdater.on("download-progress", (progressObj) => {
  let log_message = "Download speed: " + progressObj.bytesPerSecond;
  log_message = log_message + " - Downloaded " + progressObj.percent + "%";
  log_message =
    log_message +
    " (" +
    progressObj.transferred +
    "/" +
    progressObj.total +
    ")";
  console.log(log_message);

  mainWindow.webContents.send("update-progress", progressObj);
});

autoUpdater.on("update-downloaded", (info) => {
  dialog
    .showMessageBox(mainWindow, {
      type: "info",
      title: "Update Downloaded",
      message: "Update downloaded successfully!",
      detail: "The application will restart to apply the update.",
      buttons: ["Restart Now", "Later"],
      defaultId: 0,
    })
    .then((result) => {
      if (result.response === 0) {
        autoUpdater.quitAndInstall();
      }
    });
});

function checkForUpdates() {
  autoUpdater.checkForUpdates();
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
  createMenu();
}

// Optimized handlers with caching
ipcMain.handle("add-student", async (event, student) => {
  try {
    db.run(
      `INSERT INTO students (student_id, name, email, phone, department, year)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        student.student_id,
        student.name,
        student.email,
        student.phone,
        student.department,
        student.year,
      ],
    );
    invalidateCache(["students", "statistics"]);
    debouncedSave();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle("get-students", () => {
  try {
    if (isCacheValid("students")) {
      return dataCache.students;
    }

    const result = db.exec("SELECT * FROM students ORDER BY created_at DESC");
    if (result.length === 0) {
      dataCache.students = [];
      dataCache.lastUpdate.students = Date.now();
      return [];
    }

    const columns = result[0].columns;
    const values = result[0].values;

    const students = values.map((row) => {
      const obj = {};
      columns.forEach((col, idx) => {
        obj[col] = row[idx];
      });
      return obj;
    });

    dataCache.students = students;
    dataCache.lastUpdate.students = Date.now();
    return students;
  } catch (error) {
    console.error("Error getting students:", error);
    return [];
  }
});

ipcMain.handle("update-student", async (event, student) => {
  try {
    db.run(
      `UPDATE students SET name = ?, email = ?, phone = ?, department = ?, year = ?
       WHERE student_id = ?`,
      [
        student.name,
        student.email,
        student.phone,
        student.department,
        student.year,
        student.student_id,
      ],
    );
    invalidateCache(["students", "statistics"]);
    debouncedSave();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle("delete-student", async (event, studentId) => {
  try {
    db.run("DELETE FROM students WHERE student_id = ?", [studentId]);
    invalidateCache(["students", "statistics"]);
    debouncedSave();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle("add-book", async (event, book) => {
  try {
    db.run(
      `INSERT INTO books (isbn, title, author, publisher, category, total_copies, available_copies)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
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
    invalidateCache(["books", "statistics"]);
    debouncedSave();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle("get-books", () => {
  try {
    if (isCacheValid("books")) {
      return dataCache.books;
    }

    const result = db.exec("SELECT * FROM books ORDER BY created_at DESC");
    if (result.length === 0) {
      dataCache.books = [];
      dataCache.lastUpdate.books = Date.now();
      return [];
    }

    const columns = result[0].columns;
    const values = result[0].values;

    const books = values.map((row) => {
      const obj = {};
      columns.forEach((col, idx) => {
        obj[col] = row[idx];
      });
      return obj;
    });

    dataCache.books = books;
    dataCache.lastUpdate.books = Date.now();
    return books;
  } catch (error) {
    console.error("Error getting books:", error);
    return [];
  }
});

ipcMain.handle("update-book", async (event, book) => {
  try {
    db.run(
      `UPDATE books SET title = ?, author = ?, publisher = ?, category = ?, total_copies = ?, available_copies = ?
       WHERE isbn = ?`,
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
    invalidateCache(["books", "statistics"]);
    debouncedSave();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle("delete-book", async (event, isbn) => {
  try {
    db.run("DELETE FROM books WHERE isbn = ?", [isbn]);
    invalidateCache(["books", "statistics"]);
    debouncedSave();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle("issue-book", async (event, transaction) => {
  try {
    const duplicateCheck = db.exec(
      "SELECT id FROM transactions WHERE student_id = ? AND isbn = ? AND status = 'issued'",
      [transaction.student_id, transaction.isbn],
    );

    if (duplicateCheck.length > 0 && duplicateCheck[0].values.length > 0) {
      return {
        success: false,
        error:
          "This student already has a copy of this book issued and hasn't returned it yet.",
      };
    }

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

    const studentResult = db.exec(
      "SELECT student_id FROM students WHERE student_id = ?",
      [transaction.student_id],
    );

    if (studentResult.length === 0 || studentResult[0].values.length === 0) {
      return { success: false, error: "Student not found" };
    }

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 14);
    const dueDateStr = dueDate.toISOString();

    db.run(
      `INSERT INTO transactions (student_id, isbn, due_date, status)
       VALUES (?, ?, ?, 'issued')`,
      [transaction.student_id, transaction.isbn, dueDateStr],
    );

    db.run(
      "UPDATE books SET available_copies = available_copies - 1 WHERE isbn = ?",
      [transaction.isbn],
    );

    invalidateCache(["transactions", "books", "statistics"]);
    debouncedSave();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle("return-book", async (event, transactionId) => {
  try {
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

    db.run(
      `UPDATE transactions SET status = 'returned', return_date = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [transactionId],
    );

    db.run(
      "UPDATE books SET available_copies = available_copies + 1 WHERE isbn = ?",
      [isbn],
    );

    invalidateCache(["transactions", "books", "statistics"]);
    debouncedSave();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle("delete-transaction", async (event, transactionId) => {
  try {
    db.run("DELETE FROM transactions WHERE id = ?", [transactionId]);
    invalidateCache(["transactions"]);
    debouncedSave();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle("get-transactions", () => {
  try {
    if (isCacheValid("transactions")) {
      return dataCache.transactions;
    }

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

    if (result.length === 0) {
      dataCache.transactions = [];
      dataCache.lastUpdate.transactions = Date.now();
      return [];
    }

    const columns = result[0].columns;
    const values = result[0].values;

    const transactions = values.map((row) => {
      const obj = {};
      columns.forEach((col, idx) => {
        obj[col] = row[idx];
      });
      return obj;
    });

    dataCache.transactions = transactions;
    dataCache.lastUpdate.transactions = Date.now();
    return transactions;
  } catch (error) {
    console.error("Error getting transactions:", error);
    return [];
  }
});

ipcMain.handle("get-student-books", (event, studentId) => {
  try {
    const result = db.exec(
      `SELECT 
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
      ORDER BY t.issue_date DESC`,
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

ipcMain.handle("get-statistics", () => {
  try {
    if (isCacheValid("statistics")) {
      return dataCache.statistics;
    }

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

    const stats = {
      totalStudents,
      totalBooks,
      totalCopies,
      availableCopies,
      issuedBooks: totalCopies - availableCopies,
    };

    dataCache.statistics = stats;
    dataCache.lastUpdate.statistics = Date.now();
    return stats;
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

ipcMain.handle("export-to-excel", async (event, { type, data }) => {
  try {
    const ExcelJS = require("exceljs");
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(type);

    worksheet.properties.defaultRowHeight = 20;

    let columns = [];
    let title = "";

    if (type === "Students") {
      title = "Students Report";
      columns = [
        { header: "Student ID", key: "student_id", width: 15 },
        { header: "Name", key: "name", width: 25 },
        { header: "Email", key: "email", width: 30 },
        { header: "Phone", key: "phone", width: 15 },
        { header: "Department", key: "department", width: 20 },
        { header: "Year", key: "year", width: 12 },
        { header: "Created At", key: "created_at", width: 20 },
      ];
    } else if (type === "Books") {
      title = "Books Report";
      columns = [
        { header: "ISBN", key: "isbn", width: 15 },
        { header: "Title", key: "title", width: 35 },
        { header: "Author", key: "author", width: 25 },
        { header: "Publisher", key: "publisher", width: 25 },
        { header: "Category", key: "category", width: 20 },
        { header: "Total Copies", key: "total_copies", width: 15 },
        { header: "Available Copies", key: "available_copies", width: 18 },
        { header: "Created At", key: "created_at", width: 20 },
      ];
    } else if (type === "Transactions") {
      title = "Transactions Report";
      columns = [
        { header: "Transaction ID", key: "id", width: 15 },
        { header: "Student ID", key: "student_id", width: 15 },
        { header: "Student Name", key: "student_name", width: 25 },
        { header: "ISBN", key: "isbn", width: 15 },
        { header: "Book Title", key: "book_title", width: 35 },
        { header: "Issue Date", key: "issue_date", width: 20 },
        { header: "Due Date", key: "due_date", width: 20 },
        { header: "Return Date", key: "return_date", width: 20 },
        { header: "Status", key: "status", width: 12 },
      ];
    }

    worksheet.mergeCells("A1", String.fromCharCode(64 + columns.length) + "1");
    const titleCell = worksheet.getCell("A1");
    titleCell.value = title;
    titleCell.font = { size: 16, bold: true, color: { argb: "FFFFFFFF" } };
    titleCell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF667EEA" },
    };
    titleCell.alignment = { vertical: "middle", horizontal: "center" };
    worksheet.getRow(1).height = 30;

    worksheet.mergeCells("A2", String.fromCharCode(64 + columns.length) + "2");
    const dateCell = worksheet.getCell("A2");
    dateCell.value = `Generated on: ${new Date().toLocaleString()}`;
    dateCell.font = { size: 10, italic: true };
    dateCell.alignment = { horizontal: "center" };

    worksheet.columns = columns;

    const headerRow = worksheet.getRow(3);
    columns.forEach((col, index) => {
      const cell = headerRow.getCell(index + 1);
      cell.value = col.header;
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF764BA2" },
      };
      cell.alignment = { vertical: "middle", horizontal: "center" };
      cell.border = {
        top: { style: "thin" },
        left: { style: "thin" },
        bottom: { style: "thin" },
        right: { style: "thin" },
      };
    });
    headerRow.height = 25;

    data.forEach((item, index) => {
      const row = worksheet.addRow(item);
      row.eachCell((cell) => {
        cell.border = {
          top: { style: "thin", color: { argb: "FFE0E0E0" } },
          left: { style: "thin", color: { argb: "FFE0E0E0" } },
          bottom: { style: "thin", color: { argb: "FFE0E0E0" } },
          right: { style: "thin", color: { argb: "FFE0E0E0" } },
        };
        cell.alignment = { vertical: "middle" };
      });

      if (index % 2 === 0) {
        row.eachCell((cell) => {
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFF8F9FA" },
          };
        });
      }
    });

    if (type === "Books" || type === "Transactions") {
      worksheet.addRow([]);
      const summaryRow = worksheet.addRow(["Total Records:", data.length]);
      summaryRow.font = { bold: true };
      summaryRow.getCell(1).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFFFEB3B" },
      };
      summaryRow.getCell(2).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFFFEB3B" },
      };
    }

    const result = await dialog.showSaveDialog(mainWindow, {
      title: `Export ${type} to Excel`,
      defaultPath: `library_${type.toLowerCase()}_${new Date().toISOString().split("T")[0]}.xlsx`,
      filters: [{ name: "Excel Files", extensions: ["xlsx"] }],
    });

    if (!result.canceled && result.filePath) {
      await workbook.xlsx.writeFile(result.filePath);
      return { success: true, filePath: result.filePath };
    }

    return { success: false, error: "Export cancelled" };
  } catch (error) {
    console.error("Error exporting to Excel:", error);
    return { success: false, error: error.message };
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

app.on("before-quit", async () => {
  if (db && saveTimeout) {
    clearTimeout(saveTimeout);
    await saveDatabase();
  }
});
