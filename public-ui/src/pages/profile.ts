// T004 + T009 (005-user-profile-return): profile page — lists the signed-in user's own
// reservations with status, and offers a "Request Return" action (date input + button) for
// reservations currently `checked_out`. Authenticated-only: a signed-out visitor sees a login
// prompt instead of any reservation data, mirroring the auth-gated patterns already used on
// catalog.ts / auth-status.ts.
import { getToken } from "../services/auth-client";
import { listMyReservations, requestReturn, type Reservation } from "../services/reservations-client";

const loginPrompt = document.querySelector<HTMLParagraphElement>("#login-prompt")!;
const reservationsSection = document.querySelector<HTMLElement>("#reservations-section")!;
const emptyMessage = document.querySelector<HTMLParagraphElement>("#empty-message")!;
const returnMessage = document.querySelector<HTMLParagraphElement>("#return-message")!;
const reservationsList = document.querySelector<HTMLUListElement>("#reservations-list")!;

function showReturnMessage(text: string, kind: "error" | "success"): void {
  returnMessage.textContent = text;
  returnMessage.className = `message ${kind}`;
}

async function handleRequestReturn(reservation: Reservation, dateInput: HTMLInputElement): Promise<void> {
  const preferredReturnDate = dateInput.value;
  if (!preferredReturnDate) {
    showReturnMessage("Pick a preferred return date first.", "error");
    return;
  }

  const result = await requestReturn(reservation.id, preferredReturnDate);

  if (result.status === 200) {
    showReturnMessage("Return requested — thanks for letting us know.", "success");
    void renderReservations();
    return;
  }
  if (result.status === 404) {
    showReturnMessage("That reservation could not be found.", "error");
    return;
  }
  if (result.status === 409) {
    showReturnMessage("That reservation isn't checked out, so a return can't be requested.", "error");
    return;
  }
  if (result.status === 401) {
    showReturnMessage("Please log in to request a return.", "error");
    return;
  }
  showReturnMessage("Couldn't submit the return request. Please try again.", "error");
}

function renderReservationItem(reservation: Reservation): HTMLLIElement {
  const item = document.createElement("li");
  item.className = "reservation";

  const status = document.createElement("strong");
  status.textContent = reservation.status;
  item.appendChild(status);

  const details = document.createElement("span");
  details.textContent = ` — requested ${reservation.requestedDate}${
    reservation.agreedDate ? `, agreed ${reservation.agreedDate}` : ""
  }${reservation.checkedOutAt ? `, checked out ${reservation.checkedOutAt}` : ""}`;
  item.appendChild(details);

  if (reservation.status === "checked_out") {
    const dateInput = document.createElement("input");
    dateInput.type = "date";
    dateInput.setAttribute("aria-label", "Preferred return date");

    const returnButton = document.createElement("button");
    returnButton.type = "button";
    returnButton.textContent = "Request Return";
    returnButton.addEventListener("click", () => void handleRequestReturn(reservation, dateInput));

    item.append(document.createElement("br"), dateInput, returnButton);
  }

  return item;
}

async function renderReservations(): Promise<void> {
  const result = await listMyReservations();
  if (result.status !== 200 || !("reservations" in result.data)) {
    return;
  }

  const reservations = result.data.reservations;
  reservationsList.innerHTML = "";
  emptyMessage.hidden = reservations.length > 0;
  for (const reservation of reservations) {
    reservationsList.appendChild(renderReservationItem(reservation));
  }
}

function init(): void {
  if (!getToken()) {
    loginPrompt.hidden = false;
    reservationsSection.hidden = true;
    return;
  }

  loginPrompt.hidden = true;
  reservationsSection.hidden = false;
  void renderReservations();
}

init();
