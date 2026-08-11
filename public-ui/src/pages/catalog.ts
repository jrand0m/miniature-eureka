// T007 + T009: catalog browse/search page — search box, results list, and
// next/previous pagination controls that preserve the active search terms.
import { listBooks, type Book } from "../services/books-client";

const form = document.querySelector<HTMLFormElement>("#search-form")!;
const message = document.querySelector<HTMLParagraphElement>("#message")!;
const results = document.querySelector<HTMLUListElement>("#results")!;
const pagination = document.querySelector<HTMLDivElement>("#pagination")!;

const PAGE_SIZE = 20;

let currentTitle = "";
let currentAuthor = "";
let currentOffset = 0;

function renderBooks(books: Book[]): void {
  results.innerHTML = "";
  for (const book of books) {
    const item = document.createElement("li");
    item.className = "book";
    const available = document.createElement("span");
    available.className = "book-available";
    available.textContent = `${book.quantityAvailable} available`;
    const title = document.createElement("strong");
    title.textContent = book.title;
    const author = document.createElement("span");
    author.textContent = ` by ${book.author}`;
    item.append(title, author, document.createElement("br"), available);
    results.appendChild(item);
  }
}

function renderPagination(offset: number, limit: number, total: number): void {
  pagination.innerHTML = "";

  const prevButton = document.createElement("button");
  prevButton.type = "button";
  prevButton.textContent = "Previous";
  prevButton.disabled = offset <= 0;
  prevButton.addEventListener("click", () => {
    currentOffset = Math.max(0, offset - limit);
    void search();
  });

  const nextButton = document.createElement("button");
  nextButton.type = "button";
  nextButton.textContent = "Next";
  nextButton.disabled = offset + limit >= total;
  nextButton.addEventListener("click", () => {
    currentOffset = offset + limit;
    void search();
  });

  const status = document.createElement("span");
  status.className = "pagination-status";
  status.textContent =
    total === 0 ? "" : ` Showing ${offset + 1}-${Math.min(offset + limit, total)} of ${total} `;

  pagination.append(prevButton, status, nextButton);
}

async function search(): Promise<void> {
  const result = await listBooks({
    title: currentTitle || undefined,
    author: currentAuthor || undefined,
    limit: PAGE_SIZE,
    offset: currentOffset,
  });

  renderBooks(result.books);
  renderPagination(result.offset, result.limit, result.total);

  message.textContent = result.books.length === 0 ? "No books match your search." : "";
  message.className = "message";
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  currentTitle = (form.elements.namedItem("title") as HTMLInputElement).value.trim();
  currentAuthor = (form.elements.namedItem("author") as HTMLInputElement).value.trim();
  currentOffset = 0;
  void search();
});

void search();
