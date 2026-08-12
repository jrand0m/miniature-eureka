// T014: admin loan oversight list with filters + confirm-return/force-return actions — see
// specs/005-admin-loan-oversight/quickstart.md Scenario 4. Structure follows
// admin-ui/src/pages/books.ts (list + filters + inline action buttons), per this feature's brief.
import {
  listAdminReservations,
  confirmReturn,
  forceReturn,
  clearToken,
  type AdminReservation,
  type AdminReservationStatus,
} from "../services/admin-api-client";

const body = document.querySelector<HTMLTableSectionElement>("#loans-body")!;
const message = document.querySelector<HTMLParagraphElement>("#message")!;
const logoutButton = document.querySelector<HTMLButtonElement>("#logout-button")!;

const filterForm = document.querySelector<HTMLFormElement>("#filter-form")!;
const clearFiltersButton = document.querySelector<HTMLButtonElement>("#clear-filters-button")!;

const CONFIRM_RETURN_STATUSES: AdminReservationStatus[] = ["checked_out", "return_requested"];
const FORCE_RETURN_STATUSES: AdminReservationStatus[] = ["checked_out", "confirmed"];

function showMessage(text: string, kind: "error" | "success") {
  message.textContent = text;
  message.className = `message ${kind}`;
}

function formatDate(value: string | null): string {
  return value ?? "—";
}

function renderRow(loan: AdminReservation): HTMLTableRowElement {
  const row = document.createElement("tr");

  const bookCell = document.createElement("td");
  bookCell.textContent = `${loan.bookTitle} — ${loan.bookAuthor}`;
  row.appendChild(bookCell);

  const holderCell = document.createElement("td");
  holderCell.textContent = loan.userEmail;
  row.appendChild(holderCell);

  const statusCell = document.createElement("td");
  statusCell.textContent = loan.status;
  if (loan.forceReturnRequestedAt) {
    const badge = document.createElement("span");
    badge.className = "badge-flag";
    badge.textContent = "Early return requested";
    statusCell.appendChild(badge);
  }
  row.appendChild(statusCell);

  for (const value of [loan.requestedDate, loan.agreedDate, loan.checkedOutAt, loan.returnedAt]) {
    const td = document.createElement("td");
    td.textContent = formatDate(value);
    row.appendChild(td);
  }

  const actionsCell = document.createElement("td");

  if (CONFIRM_RETURN_STATUSES.includes(loan.status)) {
    const confirmButton = document.createElement("button");
    confirmButton.type = "button";
    confirmButton.textContent = "Confirm Return";
    confirmButton.addEventListener("click", async () => {
      const result = await confirmReturn(loan.id);
      if (!result.ok) {
        const err = "error" in result.data ? result.data.error : "";
        showMessage(
          err === "invalid_status_transition"
            ? "That loan is no longer eligible for a return confirmation."
            : "Confirming that return failed. Please try again.",
          "error",
        );
        return;
      }
      showMessage("Return confirmed.", "success");
      await loadLoans();
    });
    actionsCell.appendChild(confirmButton);
  }

  if (FORCE_RETURN_STATUSES.includes(loan.status)) {
    const forceButton = document.createElement("button");
    forceButton.type = "button";
    forceButton.textContent = "Force Early Return";
    forceButton.addEventListener("click", async () => {
      const result = await forceReturn(loan.id);
      if (!result.ok) {
        const err = "error" in result.data ? result.data.error : "";
        showMessage(
          err === "invalid_status_transition"
            ? "That loan is no longer eligible for a forced early return."
            : "Requesting an early return failed. Please try again.",
          "error",
        );
        return;
      }
      showMessage("Early return requested.", "success");
      await loadLoans();
    });
    actionsCell.appendChild(forceButton);
  }

  row.appendChild(actionsCell);

  return row;
}

function currentFilters(): { status?: AdminReservationStatus; bookId?: string; userId?: string } {
  const data = new FormData(filterForm);
  const status = String(data.get("status") ?? "").trim();
  const bookId = String(data.get("bookId") ?? "").trim();
  const userId = String(data.get("userId") ?? "").trim();
  return {
    status: status ? (status as AdminReservationStatus) : undefined,
    bookId: bookId || undefined,
    userId: userId || undefined,
  };
}

async function loadLoans(): Promise<void> {
  const result = await listAdminReservations(currentFilters());
  if (!result.ok || !("reservations" in result.data)) {
    clearToken();
    window.location.href = "/login.html";
    return;
  }

  body.innerHTML = "";
  for (const loan of result.data.reservations) {
    body.appendChild(renderRow(loan));
  }
}

filterForm.addEventListener("submit", (event) => {
  event.preventDefault();
  void loadLoans();
});

clearFiltersButton.addEventListener("click", () => {
  filterForm.reset();
  void loadLoans();
});

logoutButton.addEventListener("click", () => {
  clearToken();
  window.location.href = "/login.html";
});

loadLoans();
