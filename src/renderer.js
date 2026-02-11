const { ipcRenderer } = require("electron");

let studentsData = [];
let booksData = [];
let transactionsData = [];
let editingStudent = null;
let editingBook = null;
let operationInProgress = false;

// Debounce timers for search functions
let searchTimers = {
  students: null,
  books: null,
  transactions: null,
};

document.addEventListener("DOMContentLoaded", () => {
  loadAllData();
  setupUpdateListeners();
});

function setupUpdateListeners() {
  ipcRenderer.on("export-students", () => {
    exportStudentsToExcel();
  });

  ipcRenderer.on("export-books", () => {
    exportBooksToExcel();
  });

  ipcRenderer.on("export-transactions", () => {
    exportTransactionsToExcel();
  });

  ipcRenderer.on("update-downloading", () => {
    showNotification("Downloading update...", "info");
  });

  ipcRenderer.on("update-progress", (event, progressObj) => {
    const percent = Math.round(progressObj.percent);
    showNotification(`Downloading update: ${percent}%`, "info");
  });
}

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

  setTimeout(() => {
    if (notification && notification.parentNode) {
      notification.remove();
    }
  }, 3000);
}

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
  const startTime = performance.now();

  // Load in parallel for faster initial load
  await Promise.all([
    loadStatistics(),
    loadStudents(),
    loadBooks(),
    loadTransactions(),
  ]);

  updateDashboard();

  const endTime = performance.now();
  console.log(`Data loaded in ${(endTime - startTime).toFixed(2)}ms`);
}

async function loadStatistics() {
  const stats = await ipcRenderer.invoke("get-statistics");
  document.getElementById("totalStudents").textContent = stats.totalStudents;
  document.getElementById("totalBooks").textContent = stats.totalBooks;
  document.getElementById("availableCopies").textContent =
    stats.availableCopies;
  document.getElementById("issuedBooks").textContent = stats.issuedBooks;
}

function showTab(tabName) {
  const tabs = document.querySelectorAll(".tab-content");
  const buttons = document.querySelectorAll(".tab-button");

  tabs.forEach((tab) => tab.classList.remove("active"));
  buttons.forEach((btn) => btn.classList.remove("active"));

  document.getElementById(tabName).classList.add("active");

  const activeButton = document.querySelector(`[data-tab="${tabName}"]`);
  if (activeButton) {
    activeButton.classList.add("active");
  }
}

function updateDashboard() {
  const recentStudentsDiv = document.getElementById("recentStudents");
  const recentBooksDiv = document.getElementById("recentBooks");

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
  if (searchTimers.students) {
    clearTimeout(searchTimers.students);
  }

  searchTimers.students = setTimeout(() => {
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
  }, 150);
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

  const formContainer = document.getElementById("addStudentForm");
  formContainer.style.display = "block";
  formContainer.scrollIntoView({ behavior: "smooth", block: "center" });
}

async function addStudent(event) {
  event.preventDefault();

  if (operationInProgress) {
    showNotification("Please wait...", "warning");
    return;
  }

  operationInProgress = true;

  const student = {
    student_id: document.getElementById("studentId").value,
    name: document.getElementById("studentName").value,
    email: document.getElementById("studentEmail").value,
    phone: document.getElementById("studentPhone").value,
    department: document.getElementById("studentDepartment").value,
    year: document.getElementById("studentYear").value,
  };

  const isEdit = !!editingStudent;
  hideAddStudentForm();

  try {
    let result;
    if (isEdit) {
      result = await ipcRenderer.invoke("update-student", student);
    } else {
      result = await ipcRenderer.invoke("add-student", student);
    }

    if (result.success) {
      showNotification(
        isEdit ? "Student updated!" : "Student added!",
        "success",
      );

      // Reload only necessary data
      await Promise.all([loadStudents(), loadStatistics()]);
      updateDashboard();
    } else {
      showNotification(`Error: ${result.error}`, "error");
      if (isEdit) {
        editStudent(student.student_id);
      } else {
        showAddStudentForm();
      }
    }
  } catch (error) {
    showNotification(`Error: ${error.message}`, "error");
  } finally {
    operationInProgress = false;
  }
}

async function deleteStudent(studentId) {
  if (operationInProgress) {
    showNotification("Please wait...", "warning");
    return;
  }

  if (confirm("Are you sure you want to delete this student?")) {
    operationInProgress = true;

    try {
      const result = await ipcRenderer.invoke("delete-student", studentId);

      if (result.success) {
        showNotification("Student deleted!", "success");
        await Promise.all([loadStudents(), loadStatistics()]);
        updateDashboard();
      } else {
        showNotification(`Error: ${result.error}`, "error");
      }
    } catch (error) {
      showNotification(`Error: ${error.message}`, "error");
    } finally {
      operationInProgress = false;
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
  if (searchTimers.books) {
    clearTimeout(searchTimers.books);
  }

  searchTimers.books = setTimeout(() => {
    const searchTerm = document
      .getElementById("bookSearch")
      .value.toLowerCase();
    const filtered = booksData.filter(
      (b) =>
        b.isbn.toLowerCase().includes(searchTerm) ||
        b.title.toLowerCase().includes(searchTerm) ||
        b.author.toLowerCase().includes(searchTerm) ||
        (b.category && b.category.toLowerCase().includes(searchTerm)),
    );
    displayBooks(filtered);
  }, 150);
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

  const formContainer = document.getElementById("addBookForm");
  formContainer.style.display = "block";
  formContainer.scrollIntoView({ behavior: "smooth", block: "center" });
}

async function addBook(event) {
  event.preventDefault();

  if (operationInProgress) {
    showNotification("Please wait...", "warning");
    return;
  }

  operationInProgress = true;

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

  const isEdit = !!editingBook;
  hideAddBookForm();

  try {
    let result;
    if (isEdit) {
      result = await ipcRenderer.invoke("update-book", book);
    } else {
      result = await ipcRenderer.invoke("add-book", book);
    }

    if (result.success) {
      showNotification(isEdit ? "Book updated!" : "Book added!", "success");
      await Promise.all([loadBooks(), loadStatistics()]);
      updateDashboard();
    } else {
      showNotification(`Error: ${result.error}`, "error");
      if (isEdit) {
        editBook(book.isbn);
      } else {
        showAddBookForm();
      }
    }
  } catch (error) {
    showNotification(`Error: ${error.message}`, "error");
  } finally {
    operationInProgress = false;
  }
}

async function deleteBook(isbn) {
  if (operationInProgress) {
    showNotification("Please wait...", "warning");
    return;
  }

  if (confirm("Are you sure you want to delete this book?")) {
    operationInProgress = true;

    try {
      const result = await ipcRenderer.invoke("delete-book", isbn);

      if (result.success) {
        showNotification("Book deleted!", "success");
        await Promise.all([loadBooks(), loadStatistics()]);
        updateDashboard();
      } else {
        showNotification(`Error: ${result.error}`, "error");
      }
    } catch (error) {
      showNotification(`Error: ${error.message}`, "error");
    } finally {
      operationInProgress = false;
    }
  }
}

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

  if (operationInProgress) {
    showNotification("Please wait...", "warning");
    return;
  }

  operationInProgress = true;

  const transaction = {
    student_id: document.getElementById("issueStudentId").value,
    isbn: document.getElementById("issueBookIsbn").value,
  };

  hideIssueBookModal();

  try {
    const result = await ipcRenderer.invoke("issue-book", transaction);

    if (result.success) {
      showNotification("Book issued!", "success");
      await Promise.all([loadBooks(), loadTransactions(), loadStatistics()]);
      updateDashboard();
    } else {
      showNotification(`Error: ${result.error}`, "error");
    }
  } catch (error) {
    showNotification(`Error: ${error.message}`, "error");
  } finally {
    operationInProgress = false;
  }
}

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
  if (searchTimers.transactions) {
    clearTimeout(searchTimers.transactions);
  }

  searchTimers.transactions = setTimeout(() => {
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
  }, 150);
}

async function returnBook(transactionId) {
  if (operationInProgress) {
    showNotification("Please wait...", "warning");
    return;
  }

  if (confirm("Mark this book as returned?")) {
    operationInProgress = true;

    try {
      const result = await ipcRenderer.invoke("return-book", transactionId);

      if (result.success) {
        showNotification("Book returned!", "success");
        await Promise.all([loadTransactions(), loadBooks(), loadStatistics()]);
      } else {
        showNotification(`Error: ${result.error}`, "error");
      }
    } catch (error) {
      showNotification(`Error: ${error.message}`, "error");
    } finally {
      operationInProgress = false;
    }
  }
}

async function deleteTransaction(transactionId) {
  if (operationInProgress) {
    showNotification("Please wait...", "warning");
    return;
  }

  if (confirm("Are you sure you want to delete this transaction record?")) {
    operationInProgress = true;

    try {
      const result = await ipcRenderer.invoke(
        "delete-transaction",
        transactionId,
      );

      if (result.success) {
        showNotification("Transaction deleted!", "success");
        await loadTransactions();
      } else {
        showNotification(`Error: ${result.error}`, "error");
      }
    } catch (error) {
      showNotification(`Error: ${error.message}`, "error");
    } finally {
      operationInProgress = false;
    }
  }
}
