// T007 + T009: catalog browse/search page — search box, results list, and
// next/previous pagination controls that preserve the active search terms.
// T012 + T017 (reservation-flow, specs/004-reservation-flow): a "Reserve" action per book,
// visible only when signed in, plus a minimal list of the visitor's own reservations.
import { listBooks, type Book } from "../services/books-client";
import { getToken } from "../services/auth-client";
import { createReservation, listMyReservations, type Reservation } from "../services/reservations-client";
import { mountNotifications } from "../components/notifications";

// T014 (006-notifications): bell/badge/panel, visible only when signed in.
mountNotifications(document.querySelector<HTMLDivElement>("#notifications-root")!);

const form = document.querySelector<HTMLFormElement>("#search-form")!;
const message = document.querySelector<HTMLParagraphElement>("#message")!;
const results = document.querySelector<HTMLUListElement>("#results")!;
const pagination = document.querySelector<HTMLDivElement>("#pagination")!;
const reserveMessage = document.querySelector<HTMLParagraphElement>("#reserve-message")!;
const myReservationsSection = document.querySelector<HTMLElement>("#my-reservations")!;
const myReservationsList = document.querySelector<HTMLUListElement>("#my-reservations-list")!;

const PAGE_SIZE = 20;

let currentTitle = "";
let currentAuthor = "";
let currentOffset = 0;

function showReserveMessage(text: string, kind: "error" | "success") {
  reserveMessage.textContent = text;
  reserveMessage.className = `message ${kind}`;
}

async function handleReserve(book: Book, dateInput: HTMLInputElement): Promise<void> {
  const requestedDate = dateInput.value;
  if (!requestedDate) {
    showReserveMessage("Pick a preferred delivery date first.", "error");
    return;
  }

  const result = await createReservation(book.id, requestedDate);

  if (result.status === 201) {
    showReserveMessage(`Reservation requested for "${book.title}" — awaiting admin confirmation.`, "success");
    void renderMyReservations();
    return;
  }
  if (result.status === 404) {
    showReserveMessage("That book no longer exists.", "error");
    return;
  }
  if (result.status === 409) {
    showReserveMessage("Sorry — no copies of that book are available right now.", "error");
    return;
  }
  if (result.status === 401) {
    showReserveMessage("Please log in to reserve a book.", "error");
    return;
  }
  showReserveMessage("Couldn't submit the reservation. Please try again.", "error");
}

function renderBooks(books: Book[]): void {
  results.innerHTML = "";
  const loggedIn = Boolean(getToken());

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

    if (loggedIn) {
      const dateInput = document.createElement("input");
      dateInput.type = "date";
      dateInput.setAttribute("aria-label", `Preferred delivery date for ${book.title}`);

      const reserveButton = document.createElement("button");
      reserveButton.type = "button";
      reserveButton.textContent = "Reserve";
      reserveButton.disabled = book.quantityAvailable <= 0;
      reserveButton.addEventListener("click", () => void handleReserve(book, dateInput));

      item.append(document.createElement("br"), dateInput, reserveButton);
    }

    results.appendChild(item);
  }
}

function renderReservationList(reservations: Reservation[]): void {
  myReservationsList.innerHTML = "";
  for (const r of reservations) {
    const item = document.createElement("li");
    item.textContent = `${r.status} — requested ${r.requestedDate}${r.agreedDate ? `, agreed ${r.agreedDate}` : ""}`;
    myReservationsList.appendChild(item);
  }
}

async function renderMyReservations(): Promise<void> {
  if (!getToken()) {
    myReservationsSection.hidden = true;
    return;
  }
  myReservationsSection.hidden = false;

  const result = await listMyReservations();
  if (result.status === 200 && "reservations" in result.data) {
    renderReservationList(result.data.reservations);
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

void renderMyReservations();

void search();
