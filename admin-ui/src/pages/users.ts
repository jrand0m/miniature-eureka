// T029 + T031: user list with disable/enable controls.
import {
  listUsers,
  disableUser,
  enableUser,
  clearToken,
  type AdminUser,
} from "../services/admin-api-client";

const body = document.querySelector<HTMLTableSectionElement>("#users-body")!;
const message = document.querySelector<HTMLParagraphElement>("#message")!;
const logoutButton = document.querySelector<HTMLButtonElement>("#logout-button")!;

function showMessage(text: string, kind: "error" | "success") {
  message.textContent = text;
  message.className = `message ${kind}`;
}

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleString() : "Never";
}

function renderRow(user: AdminUser): HTMLTableRowElement {
  const row = document.createElement("tr");

  const cells = [
    user.email,
    user.role,
    formatDate(user.registeredAt),
    formatDate(user.lastLoginAt),
  ];
  for (const text of cells) {
    const td = document.createElement("td");
    td.textContent = text;
    row.appendChild(td);
  }

  const statusCell = document.createElement("td");
  statusCell.textContent = user.enabled ? "Enabled" : "Disabled";
  if (!user.enabled) statusCell.className = "badge-disabled";
  row.appendChild(statusCell);

  const actionCell = document.createElement("td");
  if (user.role === "admin") {
    actionCell.textContent = "—"; // FR-013: the sole administrator can't be disabled
  } else {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = user.enabled ? "Disable" : "Enable";
    button.addEventListener("click", async () => {
      const result = user.enabled ? await disableUser(user.id) : await enableUser(user.id);
      if (!result.ok) {
        showMessage("That action failed. Please try again.", "error");
        return;
      }
      await loadUsers();
    });
    actionCell.appendChild(button);
  }
  row.appendChild(actionCell);

  return row;
}

async function loadUsers(): Promise<void> {
  const result = await listUsers();
  if (!result.ok || !("users" in result.data)) {
    clearToken();
    window.location.href = "/login.html";
    return;
  }

  body.innerHTML = "";
  for (const user of result.data.users) {
    body.appendChild(renderRow(user));
  }
}

logoutButton.addEventListener("click", () => {
  clearToken();
  window.location.href = "/login.html";
});

loadUsers();
