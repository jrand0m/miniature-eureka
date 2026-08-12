// T006/T008/T010/T012/T014: book catalog list with add/edit/delete and quantity-adjust
// controls — see specs/003-admin-book-mgmt/quickstart.md Scenario 5.
import {
  listAdminBooks,
  createBook,
  updateBook,
  deleteBook,
  adjustBookQuantity,
  clearToken,
  type AdminBook,
} from "../services/admin-api-client";

const body = document.querySelector<HTMLTableSectionElement>("#books-body")!;
const message = document.querySelector<HTMLParagraphElement>("#message")!;
const logoutButton = document.querySelector<HTMLButtonElement>("#logout-button")!;
const pagination = document.querySelector<HTMLDivElement>("#pagination")!;

const form = document.querySelector<HTMLFormElement>("#book-form")!;
const formHeading = document.querySelector<HTMLHeadingElement>("#form-heading")!;
const submitButton = document.querySelector<HTMLButtonElement>("#submit-button")!;
const cancelEditButton = document.querySelector<HTMLButtonElement>("#cancel-edit-button")!;

const PAGE_SIZE = 20;
let currentOffset = 0;
let editingId: string | null = null;

function showMessage(text: string, kind: "error" | "success") {
  message.textContent = text;
  message.className = `message ${kind}`;
}

function formField(name: string): HTMLInputElement {
  return form.elements.namedItem(name) as HTMLInputElement;
}

function enterEditMode(book: AdminBook) {
  editingId = book.id;
  formField("title").value = book.title;
  formField("author").value = book.author;
  formField("isbn").value = book.isbn ?? "";
  formField("description").value = book.description ?? "";
  formField("quantityTotal").value = "";
  formField("quantityTotal").disabled = true;
  formHeading.textContent = `Edit "${book.title}"`;
  submitButton.textContent = "Save changes";
  cancelEditButton.hidden = false;
}

function exitEditMode() {
  editingId = null;
  form.reset();
  formField("quantityTotal").disabled = false;
  formHeading.textContent = "Add a book";
  submitButton.textContent = "Add book";
  cancelEditButton.hidden = true;
}

function renderRow(book: AdminBook): HTMLTableRowElement {
  const row = document.createElement("tr");

  const cells = [book.title, book.author, book.isbn ?? "—", String(book.quantityTotal), String(book.quantityAvailable)];
  for (const text of cells) {
    const td = document.createElement("td");
    td.textContent = text;
    row.appendChild(td);
  }

  const adjustCell = document.createElement("td");
  const deltaInput = document.createElement("input");
  deltaInput.type = "number";
  deltaInput.step = "1";
  deltaInput.placeholder = "±N";
  deltaInput.style.width = "4rem";
  const applyButton = document.createElement("button");
  applyButton.type = "button";
  applyButton.textContent = "Apply";
  applyButton.addEventListener("click", async () => {
    const delta = Number(deltaInput.value);
    if (!Number.isInteger(delta)) {
      showMessage("Enter a whole number to adjust the quantity by.", "error");
      return;
    }
    const result = await adjustBookQuantity(book.id, delta);
    if (!result.ok) {
      const err = "error" in result.data ? result.data.error : "";
      showMessage(
        err === "insufficient_quantity"
          ? "Cannot remove more copies than are currently available."
          : "That adjustment failed. Please try again.",
        "error",
      );
      return;
    }
    showMessage("Quantity updated.", "success");
    await loadBooks();
  });
  adjustCell.append(deltaInput, applyButton);
  row.appendChild(adjustCell);

  const actionsCell = document.createElement("td");
  const editButton = document.createElement("button");
  editButton.type = "button";
  editButton.textContent = "Edit";
  editButton.addEventListener("click", () => enterEditMode(book));

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.textContent = "Delete";
  deleteButton.addEventListener("click", async () => {
    if (!window.confirm(`Remove "${book.title}" from the catalog?`)) return;
    const result = await deleteBook(book.id);
    if (!result.ok) {
      const err = "error" in result.data ? result.data.error : "";
      showMessage(
        err === "copies_unavailable"
          ? "Some copies of this book are currently checked out — it can't be removed."
          : "That deletion failed. Please try again.",
        "error",
      );
      return;
    }
    showMessage("Book removed.", "success");
    if (editingId === book.id) exitEditMode();
    await loadBooks();
  });

  actionsCell.append(editButton, deleteButton);
  row.appendChild(actionsCell);

  return row;
}

function renderPagination(offset: number, limit: number, total: number): void {
  pagination.innerHTML = "";

  const prevButton = document.createElement("button");
  prevButton.type = "button";
  prevButton.textContent = "Previous";
  prevButton.disabled = offset <= 0;
  prevButton.addEventListener("click", () => {
    currentOffset = Math.max(0, offset - limit);
    void loadBooks();
  });

  const nextButton = document.createElement("button");
  nextButton.type = "button";
  nextButton.textContent = "Next";
  nextButton.disabled = offset + limit >= total;
  nextButton.addEventListener("click", () => {
    currentOffset = offset + limit;
    void loadBooks();
  });

  const status = document.createElement("span");
  status.className = "pagination-status";
  status.textContent =
    total === 0 ? "" : ` Showing ${offset + 1}-${Math.min(offset + limit, total)} of ${total} `;

  pagination.append(prevButton, status, nextButton);
}

async function loadBooks(): Promise<void> {
  const result = await listAdminBooks({ limit: PAGE_SIZE, offset: currentOffset });
  if (!result.ok || !("books" in result.data)) {
    clearToken();
    window.location.href = "/login.html";
    return;
  }

  body.innerHTML = "";
  for (const book of result.data.books) {
    body.appendChild(renderRow(book));
  }
  renderPagination(result.data.offset, result.data.limit, result.data.total);
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const title = formField("title").value.trim();
  const author = formField("author").value.trim();
  const isbn = formField("isbn").value.trim();
  const description = formField("description").value.trim();

  if (editingId) {
    const result = await updateBook(editingId, {
      title,
      author,
      isbn: isbn || null,
      description: description || null,
    });
    if (!result.ok) {
      showMessage("That update failed. Please check the fields and try again.", "error");
      return;
    }
    showMessage("Book updated.", "success");
    exitEditMode();
    await loadBooks();
    return;
  }

  const quantityTotal = Number(formField("quantityTotal").value);
  if (!Number.isInteger(quantityTotal) || quantityTotal < 0) {
    showMessage("Total copies must be a whole number of zero or more.", "error");
    return;
  }

  const result = await createBook({
    title,
    author,
    isbn: isbn || undefined,
    description: description || undefined,
    quantityTotal,
  });
  if (!result.ok) {
    showMessage("That book could not be added. Please check the fields and try again.", "error");
    return;
  }
  showMessage("Book added.", "success");
  form.reset();
  currentOffset = 0;
  await loadBooks();
});

cancelEditButton.addEventListener("click", () => exitEditMode());

logoutButton.addEventListener("click", () => {
  clearToken();
  window.location.href = "/login.html";
});

loadBooks();
