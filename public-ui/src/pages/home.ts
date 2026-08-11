// T016 + T022: shows the authenticated/unauthenticated state and, when logged in, a
// logout action.
import { renderAuthStatus } from "../components/auth-status";

const container = document.querySelector<HTMLDivElement>("#auth-status")!;
renderAuthStatus(container);
