// T016 + T022: shows the authenticated/unauthenticated state and, when logged in, a
// logout action.
import { renderAuthStatus } from "../components/auth-status";
import { mountNotifications } from "../components/notifications";

const container = document.querySelector<HTMLDivElement>("#auth-status")!;
renderAuthStatus(container);

// T014 (006-notifications): bell/badge/panel, visible only when signed in.
mountNotifications(document.querySelector<HTMLDivElement>("#notifications-root")!);
