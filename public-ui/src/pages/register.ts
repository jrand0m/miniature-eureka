// T014 + T016: registration form, wired to an immediately-authenticated state on success.
import { register, setToken } from "../services/auth-client";

const form = document.querySelector<HTMLFormElement>("#register-form")!;
const message = document.querySelector<HTMLParagraphElement>("#message")!;

function showMessage(text: string, kind: "error" | "success") {
  message.textContent = text;
  message.className = `message ${kind}`;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = (form.elements.namedItem("email") as HTMLInputElement).value.trim();
  const password = (form.elements.namedItem("password") as HTMLInputElement).value;

  const result = await register(email, password);

  if (result.status === 201 && "token" in result.data) {
    setToken(result.data.token);
    showMessage("Account created — you're logged in.", "success");
    window.location.href = "/";
    return;
  }

  if (result.status === 409) {
    showMessage("That email is already registered. Try logging in instead.", "error");
    return;
  }

  showMessage("Registration failed. Check your email and password and try again.", "error");
});
