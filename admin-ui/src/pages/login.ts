// T028: admin login form. Logs in via the same /auth/login used by public-ui, then
// confirms the account is actually an administrator before granting access to the
// Admin UI (a non-admin token is valid but gets 403 from every /admin/* route).
import { login, listUsers, setToken, clearToken } from "../services/admin-api-client";

const form = document.querySelector<HTMLFormElement>("#login-form")!;
const message = document.querySelector<HTMLParagraphElement>("#message")!;

function showMessage(text: string, kind: "error" | "success") {
  message.textContent = text;
  message.className = `message ${kind}`;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = (form.elements.namedItem("email") as HTMLInputElement).value.trim();
  const password = (form.elements.namedItem("password") as HTMLInputElement).value;

  const result = await login(email, password);
  if (result.status !== 200 || !("token" in result.data)) {
    showMessage(
      result.status === 403 ? "This account has been disabled." : "Incorrect email or password.",
      "error",
    );
    return;
  }

  setToken(result.data.token);

  const check = await listUsers();
  if (!check.ok) {
    clearToken();
    showMessage("This account does not have administrator access.", "error");
    return;
  }

  window.location.href = "/users.html";
});
