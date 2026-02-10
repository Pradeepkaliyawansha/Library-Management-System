const { ipcRenderer } = require("electron");

let studentsData = [];
let booksData = [];
let transactionsData = [];
let editingStudent = null;
let editingBook = null;

// Initialize application
document.addEventListener("DOMContentLoaded", () => {
  loadAllData();
  setupUpdateListeners();
});

// Setup update listeners
function setupUpdateListeners() {
  // Listen for export triggers from menu
  ipcRenderer.on("export-students", () => {
    exportStudentsToExcel();
  });

  ipcRenderer.on("export-books", () => {
    exportBooksToExcel();
  });

  ipcRenderer.on("export-transactions", () => {
    exportTransactionsToExcel();
  });

  // Listen for update progress
  ipcRenderer.on("update-downloading", () => {
    showNotification("Downloading update...", "info");
  });

  ipcRenderer.on("update-progress", (event, progressObj) => {
    const percent = Math.round(progressObj.percent);
    showNotification(`Downloading update: ${percent}%`, "info");
  });
}

// Enhanced non-blocking notification system
function showNotification(message, type = "success") {
  const existingNotif = document.getElementById("customNotification");
  if (existingNotif) {
    existingNotif.remove();
  }

  const notification = document.createElement("div");
  notification.id = "customNotification";

  const colors = {
    success: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
    error: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
    info: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
    warning: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
  };

  const icons = {
    success: "✓",
    error: "✕",
    info: "ℹ",
    warning: "⚠",
  };

  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: ${colors[type]};
    color: white;
    padding: 15px 25px 15px 20px;
    border-radius: 12px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.4);
    z-index: 10001;
    font-weight: 600;
    font-size: 0.95rem;
    display: flex;
    align-items: center;
    gap: 12px;
    animation: slideInRight 0.3s ease-out, fadeOut 0.3s ease-in 2.7s forwards;
    max-width: 400px;
  `;

  notification.innerHTML = `
    <span style="font-size: 1.5rem;">${icons[type]}</span>
    <span>${message}</span>
  `;

  document.body.appendChild(notification);

  // Auto-remove after 3 seconds
  setTimeout(() => {
    if (notification && notification.parentNode) {
      notification.remove();
    }
  }, 3000);
}

// Add CSS animations
if (!document.getElementById("notificationStyles")) {
  const style = document.createElement("style");
  style.id = "notificationStyles";
  style.textContent = `
    @keyframes slideInRight {
      from {
        transform: translateX(400px);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }
    @keyframes fadeOut {
      from {
        opacity: 1;
      }
      to {
        opacity: 0;
      }
    }
  `;
  document.head.appendChild(style);
}

async function loadAllData() {
  await loadStatistics();
  await loadStudents();
  await loadBooks();
  await loadTransactions();
  updateDashboard();
}

// Statistics
async function loadStatistics() {
  const stats = await ipcRenderer.invoke("get-statistics");
  document.getElementById("totalStudents").textContent = stats.totalStudents;
  document.getElementById("totalBooks").textContent = stats.totalBooks;
  document.getElementById("availableCopies").textContent =
    stats.availableCopies;
  document.getElementById("issuedBooks").textContent = stats.issuedBooks;
}

// Tab Management - FIXED
function showTab(tabName) {
  const tabs = document.querySelectorAll(".tab-content");
  const buttons = document.querySelectorAll(".tab-button");

  tabs.forEach((tab) => tab.classList.remove("active"));
  buttons.forEach((btn) => btn.classList.remove("active"));

  document.getElementById(tabName).classList.add("active");

  // Find and activate the correct button using data-tab attribute
  const activeButton = document.querySelector(`[data-tab="${tabName}"]`);
  if (activeButton) {
    activeButton.classList.add("active");
  }
}

// Dashboard
function updateDashboard() {
  const recentStudentsDiv = document.getElementById("recentStudents");
  const recentBooksDiv = document.getElementById("recentBooks");

  // Show recent 5 students
  const recentStudents = studentsData.slice(0, 5);
  recentStudentsDiv.innerHTML =
    recentStudents.length > 0
      ? recentStudents
          .map(
            (s) => `
            <div class="list-item">
                <strong>${s.name}</strong> (${s.student_id})<br>
                <small>${s.department || "N/A"} - ${s.year || "N/A"}</small>
            </div>
        `,
          )
          .join("")
      : "<p>No students added yet.</p>";

  // Show recent 5 books
  const recentBooks = booksData.slice(0, 5);
  recentBooksDiv.innerHTML =
    recentBooks.length > 0
      ? recentBooks
          .map(
            (b) => `
            <div class="list-item">
                <strong>${b.title}</strong><br>
                <small>${b.author} | Available: ${b.available_copies}/${b.total_copies}</small>
            </div>
        `,
          )
          .join("")
      : "<p>No books added yet.</p>";
}

// Excel Export Functions
async function exportStudentsToExcel() {
  if (studentsData.length === 0) {
    showNotification("No students to export!", "warning");
    return;
  }

  const result = await ipcRenderer.invoke("export-to-excel", {
    type: "Students",
    data: studentsData.map((s) => ({
      student_id: s.student_id,
      name: s.name,
      email: s.email,
      phone: s.phone || "N/A",
      department: s.department || "N/A",
      year: s.year || "N/A",
      created_at: new Date(s.created_at).toLocaleDateString(),
    })),
  });

  if (result.success) {
    showNotification("Students exported successfully!", "success");
  } else if (result.error !== "Export cancelled") {
    showNotification(`Export failed: ${result.error}`, "error");
  }
}

async function exportBooksToExcel() {
  if (booksData.length === 0) {
    showNotification("No books to export!", "warning");
    return;
  }

  const result = await ipcRenderer.invoke("export-to-excel", {
    type: "Books",
    data: booksData.map((b) => ({
      isbn: b.isbn,
      title: b.title,
      author: b.author,
      publisher: b.publisher || "N/A",
      category: b.category || "N/A",
      total_copies: b.total_copies,
      available_copies: b.available_copies,
      created_at: new Date(b.created_at).toLocaleDateString(),
    })),
  });

  if (result.success) {
    showNotification("Books exported successfully!", "success");
  } else if (result.error !== "Export cancelled") {
    showNotification(`Export failed: ${result.error}`, "error");
  }
}

async function exportTransactionsToExcel() {
  if (transactionsData.length === 0) {
    showNotification("No transactions to export!", "warning");
    return;
  }

  const result = await ipcRenderer.invoke("export-to-excel", {
    type: "Transactions",
    data: transactionsData.map((t) => ({
      id: t.id,
      student_id: t.student_id,
      student_name: t.student_name || "N/A",
      isbn: t.isbn,
      book_title: t.book_title || "N/A",
      issue_date: new Date(t.issue_date).toLocaleDateString(),
      due_date: t.due_date ? new Date(t.due_date).toLocaleDateString() : "N/A",
      return_date: t.return_date
        ? new Date(t.return_date).toLocaleDateString()
        : "Not Returned",
      status: t.status.toUpperCase(),
    })),
  });

  if (result.success) {
    showNotification("Transactions exported successfully!", "success");
  } else if (result.error !== "Export cancelled") {
    showNotification(`Export failed: ${result.error}`, "error");
  }
}

// Students Management
async function loadStudents() {
  studentsData = await ipcRenderer.invoke("get-students");
  displayStudents(studentsData);
}

function displayStudents(students) {
  const tbody = document.getElementById("studentsTableBody");

  if (students.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="7" style="text-align: center;">No students found</td></tr>';
    return;
  }

  tbody.innerHTML = students
    .map(
      (student) => `
        <tr>
            <td>${student.student_id}</td>
            <td>${student.name}</td>
            <td>${student.email}</td>
            <td>${student.phone || "N/A"}</td>
            <td>${student.department || "N/A"}</td>
            <td>${student.year || "N/A"}</td>
            <td>
            <div class="table-actions">
        <button class="btn-small btn-info" onclick="viewStudentBooks('${student.student_id}')">Books</button>
        <button class="btn-small btn-primary" onclick="editStudent('${student.student_id}')">Edit</button>
        <button class="btn-small btn-danger" onclick="deleteStudent('${student.student_id}')">Delete</button>
    </div>
            </td>
        </tr>
    `,
    )
    .join("");
}

function filterStudents() {
  const searchTerm = document
    .getElementById("studentSearch")
    .value.toLowerCase();
  const filtered = studentsData.filter(
    (s) =>
      s.student_id.toLowerCase().includes(searchTerm) ||
      s.name.toLowerCase().includes(searchTerm) ||
      s.email.toLowerCase().includes(searchTerm) ||
      (s.department && s.department.toLowerCase().includes(searchTerm)),
  );
  displayStudents(filtered);
}

function showAddStudentForm() {
  editingStudent = null;
  document.getElementById("addStudentForm").style.display = "block";
  document.getElementById("studentFormTitle").textContent = "Add New Student";
  document.getElementById("studentId").disabled = false;
  document.querySelector("#addStudentForm form").reset();
}

function hideAddStudentForm() {
  document.getElementById("addStudentForm").style.display = "none";
  document.querySelector("#addStudentForm form").reset();
  editingStudent = null;
}

function editStudent(studentId) {
  const student = studentsData.find((s) => s.student_id === studentId);
  if (!student) return;

  editingStudent = student;
  document.getElementById("studentFormTitle").textContent = "Edit Student";
  document.getElementById("studentId").value = student.student_id;
  document.getElementById("studentId").disabled = true;
  document.getElementById("studentName").value = student.name;
  document.getElementById("studentEmail").value = student.email;
  document.getElementById("studentPhone").value = student.phone || "";
  document.getElementById("studentDepartment").value = student.department || "";
  document.getElementById("studentYear").value = student.year || "";
  document.getElementById("addStudentForm").style.display = "block";

  const formContainer = document.getElementById("addStudentForm");
  formContainer.style.display = "block";

  // ADD THIS LINE:
  formContainer.scrollIntoView({ behavior: "smooth", block: "center" });
}

async function addStudent(event) {
  event.preventDefault();

  const student = {
    student_id: document.getElementById("studentId").value,
    name: document.getElementById("studentName").value,
    email: document.getElementById("studentEmail").value,
    phone: document.getElementById("studentPhone").value,
    department: document.getElementById("studentDepartment").value,
    year: document.getElementById("studentYear").value,
  };

  // Immediately hide form and show notification - non-blocking
  const isEdit = !!editingStudent;
  hideAddStudentForm();
  showNotification(
    isEdit ? "Updating student..." : "Adding student...",
    "info",
  );

  // Perform database operation
  let result;
  if (isEdit) {
    result = await ipcRenderer.invoke("update-student", student);
  } else {
    result = await ipcRenderer.invoke("add-student", student);
  }

  if (result.success) {
    showNotification(
      isEdit ? "Student updated successfully!" : "Student added successfully!",
      "success",
    );

    // Reload data in background - non-blocking
    Promise.all([loadStatistics(), loadStudents()]).then(() => {
      updateDashboard();
    });
  } else {
    showNotification(`Error: ${result.error}`, "error");
    // Reopen form on error
    if (isEdit) {
      editStudent(student.student_id);
    } else {
      showAddStudentForm();
    }
  }
}

async function deleteStudent(studentId) {
  if (confirm("Are you sure you want to delete this student?")) {
    showNotification("Deleting student...", "info");

    const result = await ipcRenderer.invoke("delete-student", studentId);

    if (result.success) {
      showNotification("Student deleted successfully!", "success");

      // Reload data in background
      Promise.all([loadStatistics(), loadStudents()]).then(() => {
        updateDashboard();
      });
    } else {
      showNotification(`Error: ${result.error}`, "error");
    }
  }
}

async function viewStudentBooks(studentId) {
  const books = await ipcRenderer.invoke("get-student-books", studentId);
  const student = studentsData.find((s) => s.student_id === studentId);

  let message = `Books borrowed by ${student.name} (${studentId}):\n\n`;

  if (books.length === 0) {
    message += "No books currently borrowed.";
  } else {
    books.forEach((book, index) => {
      const issueDate = new Date(book.issue_date).toLocaleDateString();
      const dueDate = new Date(book.due_date).toLocaleDateString();
      message += `${index + 1}. ${book.title} by ${book.author}\n`;
      message += `   ISBN: ${book.isbn}\n`;
      message += `   Issue Date: ${issueDate}\n`;
      message += `   Due Date: ${dueDate}\n\n`;
    });
  }

  alert(message);
}

// Books Management
async function loadBooks() {
  booksData = await ipcRenderer.invoke("get-books");
  displayBooks(booksData);
}

function displayBooks(books) {
  const tbody = document.getElementById("booksTableBody");

  if (books.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="8" style="text-align: center;">No books found</td></tr>';
    return;
  }

  tbody.innerHTML = books
    .map(
      (book) => `
        <tr>
            <td>${book.isbn}</td>
            <td>${book.title}</td>
            <td>${book.author}</td>
            <td>${book.publisher || "N/A"}</td>
            <td>${book.category || "N/A"}</td>
            <td>${book.total_copies}</td>
            <td>${book.available_copies}</td>
            <td>
            <div class="table-actions">
                <button class="btn-small btn-success" onclick="showIssueBookModal('${book.isbn}')" ${book.available_copies <= 0 ? "disabled" : ""}>Issue</button>
                <button class="btn-small btn-primary" onclick="editBook('${book.isbn}')">Edit</button>
                <button class="btn-small btn-danger" onclick="deleteBook('${book.isbn}')">Delete</button>
            </div>
                </td>
        </tr>
    `,
    )
    .join("");
}

function filterBooks() {
  const searchTerm = document.getElementById("bookSearch").value.toLowerCase();
  const filtered = booksData.filter(
    (b) =>
      b.isbn.toLowerCase().includes(searchTerm) ||
      b.title.toLowerCase().includes(searchTerm) ||
      b.author.toLowerCase().includes(searchTerm) ||
      (b.category && b.category.toLowerCase().includes(searchTerm)),
  );
  displayBooks(filtered);
}

function showAddBookForm() {
  editingBook = null;
  document.getElementById("addBookForm").style.display = "block";
  document.getElementById("bookFormTitle").textContent = "Add New Book";
  document.getElementById("bookIsbn").disabled = false;
  document.querySelector("#addBookForm form").reset();
}

function hideAddBookForm() {
  document.getElementById("addBookForm").style.display = "none";
  document.querySelector("#addBookForm form").reset();
  editingBook = null;
}

function editBook(isbn) {
  const book = booksData.find((b) => b.isbn === isbn);
  if (!book) return;

  editingBook = book;
  document.getElementById("bookFormTitle").textContent = "Edit Book";
  document.getElementById("bookIsbn").value = book.isbn;
  document.getElementById("bookIsbn").disabled = true;
  document.getElementById("bookTitle").value = book.title;
  document.getElementById("bookAuthor").value = book.author;
  document.getElementById("bookPublisher").value = book.publisher || "";
  document.getElementById("bookCategory").value = book.category || "";
  document.getElementById("bookTotalCopies").value = book.total_copies;
  document.getElementById("addBookForm").style.display = "block";

  const formContainer = document.getElementById("addBookForm");
  formContainer.style.display = "block";

  // ADD THIS LINE:
  formContainer.scrollIntoView({ behavior: "smooth", block: "center" });
}

async function addBook(event) {
  event.preventDefault();

  const totalCopies = parseInt(
    document.getElementById("bookTotalCopies").value,
  );

  const book = {
    isbn: document.getElementById("bookIsbn").value,
    title: document.getElementById("bookTitle").value,
    author: document.getElementById("bookAuthor").value,
    publisher: document.getElementById("bookPublisher").value,
    category: document.getElementById("bookCategory").value,
    total_copies: totalCopies,
    available_copies: editingBook
      ? editingBook.available_copies + (totalCopies - editingBook.total_copies)
      : totalCopies,
  };

  // Immediately hide form and show notification - non-blocking
  const isEdit = !!editingBook;
  hideAddBookForm();
  showNotification(isEdit ? "Updating book..." : "Adding book...", "info");

  // Perform database operation
  let result;
  if (isEdit) {
    result = await ipcRenderer.invoke("update-book", book);
  } else {
    result = await ipcRenderer.invoke("add-book", book);
  }

  if (result.success) {
    showNotification(
      isEdit ? "Book updated successfully!" : "Book added successfully!",
      "success",
    );

    // Reload data in background - non-blocking
    Promise.all([loadStatistics(), loadBooks()]).then(() => {
      updateDashboard();
    });
  } else {
    showNotification(`Error: ${result.error}`, "error");
    // Reopen form on error
    if (isEdit) {
      editBook(book.isbn);
    } else {
      showAddBookForm();
    }
  }
}

async function deleteBook(isbn) {
  if (confirm("Are you sure you want to delete this book?")) {
    showNotification("Deleting book...", "info");

    const result = await ipcRenderer.invoke("delete-book", isbn);

    if (result.success) {
      showNotification("Book deleted successfully!", "success");

      // Reload data in background
      Promise.all([loadStatistics(), loadBooks()]).then(() => {
        updateDashboard();
      });
    } else {
      showNotification(`Error: ${result.error}`, "error");
    }
  }
}

// Issue Book Modal
function showIssueBookModal(isbn) {
  const book = booksData.find((b) => b.isbn === isbn);
  document.getElementById("issueBookIsbn").value = isbn;
  document.getElementById("issueBookTitle").textContent =
    `Issue: ${book.title}`;
  document.getElementById("issueBookModal").style.display = "block";
}

function hideIssueBookModal() {
  document.getElementById("issueBookModal").style.display = "none";
  document.getElementById("issueBookForm").reset();
}

async function issueBook(event) {
  event.preventDefault();

  const transaction = {
    student_id: document.getElementById("issueStudentId").value,
    isbn: document.getElementById("issueBookIsbn").value,
  };

  // Immediately hide modal and show notification - non-blocking
  hideIssueBookModal();
  showNotification("Issuing book...", "info");

  const result = await ipcRenderer.invoke("issue-book", transaction);

  if (result.success) {
    showNotification("Book issued successfully!", "success");

    // Reload data in background - non-blocking
    Promise.all([loadStatistics(), loadBooks(), loadTransactions()]).then(
      () => {
        updateDashboard();
      },
    );
  } else {
    showNotification(`Error: ${result.error}`, "error");
  }
}

// Transactions Management
async function loadTransactions() {
  transactionsData = await ipcRenderer.invoke("get-transactions");
  displayTransactions(transactionsData);
}

function displayTransactions(transactions) {
  const tbody = document.getElementById("transactionsTableBody");

  if (transactions.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="7" style="text-align: center;">No transactions found</td></tr>';
    return;
  }

  tbody.innerHTML = transactions
    .map((t) => {
      const issueDate = new Date(t.issue_date).toLocaleDateString();
      const dueDate = t.due_date
        ? new Date(t.due_date).toLocaleDateString()
        : "N/A";
      const returnDate = t.return_date
        ? new Date(t.return_date).toLocaleDateString()
        : "-";
      const isOverdue =
        t.status === "issued" && new Date(t.due_date) < new Date();

      // --- Logic for Delete Button Visibility ---
      let deleteButton = "";
      if (t.status === "returned") {
        deleteButton = `<button class="btn-small btn-danger" onclick="deleteTransaction(${t.id})">Delete</button>`;
      }

      return `
        <tr class="${isOverdue ? "overdue-row" : ""}">
            <td>${t.student_id}</td>
            <td>${t.student_name || "N/A"}</td>
            <td>${t.book_title || "N/A"}</td>
            <td>${issueDate}</td>
            <td>${dueDate}</td>
            <td>${returnDate}</td>
            <td>
            <div class="table-actions">
                <span class="status-badge status-${t.status}">${t.status.toUpperCase()}</span>
                ${t.status === "issued" ? `<button class="btn-small btn-warning" onclick="returnBook(${t.id})">Return</button>` : ""}
                ${deleteButton}
              </div>  
            </td>
        </tr>
      `;
    })
    .join("");
}

function filterTransactions() {
  const searchTerm = document
    .getElementById("transactionSearch")
    .value.toLowerCase();
  const filtered = transactionsData.filter(
    (t) =>
      t.student_id.toLowerCase().includes(searchTerm) ||
      (t.student_name && t.student_name.toLowerCase().includes(searchTerm)) ||
      (t.book_title && t.book_title.toLowerCase().includes(searchTerm)),
  );
  displayTransactions(filtered);
}

// OPTIMIZED RETURN BOOK FUNCTION - MUCH FASTER!
async function returnBook(transactionId) {
  if (confirm("Mark this book as returned?")) {
    // Immediately show notification - non-blocking
    showNotification("Processing return...", "info");

    const result = await ipcRenderer.invoke("return-book", transactionId);

    if (result.success) {
      showNotification("Book returned successfully!", "success");

      // Reload only transactions immediately for instant feedback
      // This makes the UI responsive right away!
      loadTransactions();

      // Reload other data in background without blocking the UI
      // Using setTimeout ensures UI updates happen first
      setTimeout(() => {
        Promise.all([loadStatistics(), loadBooks()]).then(() => {
          updateDashboard();
        });
      }, 100);
    } else {
      showNotification(`Error: ${result.error}`, "error");
    }
  }
}

async function deleteTransaction(transactionId) {
  if (confirm("Are you sure you want to delete this transaction record?")) {
    showNotification("Deleting transaction...", "info");

    const result = await ipcRenderer.invoke(
      "delete-transaction",
      transactionId,
    );

    if (result.success) {
      showNotification("Transaction deleted successfully!", "success");

      // Reload data in background
      loadTransactions();
    } else {
      showNotification(`Error: ${result.error}`, "error");
    }
  }
}
