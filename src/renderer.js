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
    showUpdateNotification("Downloading update...");
  });

  ipcRenderer.on("update-progress", (event, progressObj) => {
    const percent = Math.round(progressObj.percent);
    showUpdateNotification(`Downloading update: ${percent}%`);
  });
}

function showUpdateNotification(message) {
  // Create a simple notification div
  const existingNotif = document.getElementById("updateNotification");
  if (existingNotif) {
    existingNotif.remove();
  }

  const notification = document.createElement("div");
  notification.id = "updateNotification";
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    padding: 15px 25px;
    border-radius: 10px;
    box-shadow: 0 5px 20px rgba(0,0,0,0.3);
    z-index: 10000;
    font-weight: 600;
  `;
  notification.textContent = message;
  document.body.appendChild(notification);

  // Auto-remove after 5 seconds if it's not a progress update
  if (!message.includes("%")) {
    setTimeout(() => {
      notification.remove();
    }, 5000);
  }
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

// Tab Management
function showTab(tabName) {
  const tabs = document.querySelectorAll(".tab-content");
  const buttons = document.querySelectorAll(".tab-button");

  tabs.forEach((tab) => tab.classList.remove("active"));
  buttons.forEach((btn) => btn.classList.remove("active"));

  document.getElementById(tabName).classList.add("active");
  event.target.classList.add("active");
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
    alert("No students to export!");
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
    alert(`Students exported successfully to:\n${result.filePath}`);
  } else if (result.error !== "Export cancelled") {
    alert(`Error exporting: ${result.error}`);
  }
}

async function exportBooksToExcel() {
  if (booksData.length === 0) {
    alert("No books to export!");
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
    alert(`Books exported successfully to:\n${result.filePath}`);
  } else if (result.error !== "Export cancelled") {
    alert(`Error exporting: ${result.error}`);
  }
}

async function exportTransactionsToExcel() {
  if (transactionsData.length === 0) {
    alert("No transactions to export!");
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
    alert(`Transactions exported successfully to:\n${result.filePath}`);
  } else if (result.error !== "Export cancelled") {
    alert(`Error exporting: ${result.error}`);
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
                <button class="btn-small btn-info" onclick="viewStudentBooks('${student.student_id}')">Books</button>
                <button class="btn-small btn-primary" onclick="editStudent('${student.student_id}')">Edit</button>
                <button class="btn-small btn-danger" onclick="deleteStudent('${student.student_id}')">Delete</button>
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

  let result;
  if (editingStudent) {
    result = await ipcRenderer.invoke("update-student", student);
    if (result.success) {
      alert("Student updated successfully!");
    }
  } else {
    result = await ipcRenderer.invoke("add-student", student);
    if (result.success) {
      alert("Student added successfully!");
    }
  }

  if (result.success) {
    hideAddStudentForm();
    // Optimized: Only reload what's necessary instead of everything
    await Promise.all([loadStatistics(), loadStudents()]);
    updateDashboard();
  } else {
    alert("Error: " + result.error);
  }
}

async function deleteStudent(studentId) {
  if (confirm("Are you sure you want to delete this student?")) {
    const result = await ipcRenderer.invoke("delete-student", studentId);
    if (result.success) {
      alert("Student deleted successfully!");
      // Optimized: Only reload what's necessary
      await Promise.all([loadStatistics(), loadStudents()]);
      updateDashboard();
    } else {
      alert("Error: " + result.error);
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
                <button class="btn-small btn-success" onclick="showIssueBookModal('${book.isbn}')" ${book.available_copies <= 0 ? "disabled" : ""}>Issue</button>
                <button class="btn-small btn-primary" onclick="editBook('${book.isbn}')">Edit</button>
                <button class="btn-small btn-danger" onclick="deleteBook('${book.isbn}')">Delete</button>
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

  let result;
  if (editingBook) {
    result = await ipcRenderer.invoke("update-book", book);
    if (result.success) {
      alert("Book updated successfully!");
    }
  } else {
    result = await ipcRenderer.invoke("add-book", book);
    if (result.success) {
      alert("Book added successfully!");
    }
  }

  if (result.success) {
    hideAddBookForm();
    // Optimized: Only reload what's necessary instead of everything
    await Promise.all([loadStatistics(), loadBooks()]);
    updateDashboard();
  } else {
    alert("Error: " + result.error);
  }
}

async function deleteBook(isbn) {
  if (confirm("Are you sure you want to delete this book?")) {
    const result = await ipcRenderer.invoke("delete-book", isbn);
    if (result.success) {
      alert("Book deleted successfully!");
      // Optimized: Only reload what's necessary
      await Promise.all([loadStatistics(), loadBooks()]);
      updateDashboard();
    } else {
      alert("Error: " + result.error);
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

  const result = await ipcRenderer.invoke("issue-book", transaction);

  if (result.success) {
    alert("Book issued successfully!");
    hideIssueBookModal();
    // Optimized: Only reload what's necessary
    await Promise.all([loadStatistics(), loadBooks(), loadTransactions()]);
    updateDashboard();
  } else {
    alert("Error: " + result.error);
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

      return `
        <tr class="${isOverdue ? "overdue-row" : ""}">
            <td>${t.student_id}</td>
            <td>${t.student_name || "N/A"}</td>
            <td>${t.book_title || "N/A"}</td>
            <td>${issueDate}</td>
            <td>${dueDate}</td>
            <td>${returnDate}</td>
            <td>
                <span class="status-badge status-${t.status}">${t.status.toUpperCase()}</span>
                ${t.status === "issued" ? `<button class="btn-small btn-warning" onclick="returnBook(${t.id})">Return</button>` : ""}
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

async function returnBook(transactionId) {
  if (confirm("Mark this book as returned?")) {
    const result = await ipcRenderer.invoke("return-book", transactionId);
    if (result.success) {
      alert("Book returned successfully!");
      // Optimized: Only reload what's necessary
      await Promise.all([loadStatistics(), loadBooks(), loadTransactions()]);
      updateDashboard();
    } else {
      alert("Error: " + result.error);
    }
  }
}
