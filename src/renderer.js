const { ipcRenderer } = require("electron");

let studentsData = [];
let booksData = [];

// Initialize application
document.addEventListener("DOMContentLoaded", () => {
  loadAllData();
});

async function loadAllData() {
  await loadStatistics();
  await loadStudents();
  await loadBooks();
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
  document.getElementById("addStudentForm").style.display = "block";
}

function hideAddStudentForm() {
  document.getElementById("addStudentForm").style.display = "none";
  document.querySelector("#addStudentForm form").reset();
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

  const result = await ipcRenderer.invoke("add-student", student);

  if (result.success) {
    alert("Student added successfully!");
    hideAddStudentForm();
    loadAllData();
  } else {
    alert("Error: " + result.error);
  }
}

async function deleteStudent(studentId) {
  if (confirm("Are you sure you want to delete this student?")) {
    const result = await ipcRenderer.invoke("delete-student", studentId);
    if (result.success) {
      alert("Student deleted successfully!");
      loadAllData();
    } else {
      alert("Error: " + result.error);
    }
  }
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
  document.getElementById("addBookForm").style.display = "block";
}

function hideAddBookForm() {
  document.getElementById("addBookForm").style.display = "none";
  document.querySelector("#addBookForm form").reset();
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
    available_copies: totalCopies,
  };

  const result = await ipcRenderer.invoke("add-book", book);

  if (result.success) {
    alert("Book added successfully!");
    hideAddBookForm();
    loadAllData();
  } else {
    alert("Error: " + result.error);
  }
}

async function deleteBook(isbn) {
  if (confirm("Are you sure you want to delete this book?")) {
    const result = await ipcRenderer.invoke("delete-book", isbn);
    if (result.success) {
      alert("Book deleted successfully!");
      loadAllData();
    } else {
      alert("Error: " + result.error);
    }
  }
}
