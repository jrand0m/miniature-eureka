// T020: login form.
import { login, setToken } from "../services/auth-client";

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

  if (result.status === 200 && "token" in result.data) {
    setToken(result.data.token);
    showMessage("Logged in.", "success");
    window.location.href = "/";
    return;
  }

  if (result.status === 403) {
    showMessage("This account has been disabled.", "error");
    return;
  }

  // 401 invalid_credentials and any other failure share one generic message (FR-007).
  showMessage("Incorrect email or password.", "error");
});
