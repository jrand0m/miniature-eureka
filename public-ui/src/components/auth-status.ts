// T022: authenticated-state indicator + logout action, shared by any page that needs it.
import { getToken, logout } from "../services/auth-client";

export function renderAuthStatus(container: HTMLElement): void {
  container.innerHTML = "";

  const status = document.createElement("p");
  const token = getToken();
  status.textContent = token ? "You are logged in." : "You are not logged in.";
  container.appendChild(status);

  if (token) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Log out";
    button.addEventListener("click", async () => {
      await logout();
      renderAuthStatus(container);
    });
    container.appendChild(button);
  }
}
