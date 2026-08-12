// T012: notification bell/badge/panel — shared by every Public UI page, mounted into the nav.
// Follows components/auth-status.ts's "render into a passed container, no-op when logged out"
// pattern.
import { getToken } from "../services/auth-client";
import {
  listNotifications,
  markNotificationRead,
  openNotificationStream,
  type Notification,
} from "../services/notifications-client";

function formatTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
}

export function mountNotifications(container: HTMLElement): void {
  container.innerHTML = "";

  const token = getToken();
  if (!token) {
    // Signed-out visitors never see the bell, badge, or any notification data (spec FR-009,
    // SC-005).
    return;
  }

  let notifications: Notification[] = [];
  let panelOpen = false;

  const wrapper = document.createElement("div");
  wrapper.className = "notifications";

  const toggleButton = document.createElement("button");
  toggleButton.type = "button";
  toggleButton.className = "notifications-toggle";
  toggleButton.setAttribute("aria-label", "Notifications");

  const bellLabel = document.createElement("span");
  bellLabel.textContent = "🔔";

  const badge = document.createElement("span");
  badge.className = "notifications-badge";
  badge.hidden = true;

  toggleButton.append(bellLabel, badge);

  const panel = document.createElement("div");
  panel.className = "notifications-panel";
  panel.hidden = true;

  const list = document.createElement("ul");
  list.className = "notifications-list";

  const emptyMessage = document.createElement("p");
  emptyMessage.className = "notifications-empty message";
  emptyMessage.textContent = "No notifications yet.";
  emptyMessage.hidden = true;

  panel.append(emptyMessage, list);
  wrapper.append(toggleButton, panel);
  container.appendChild(wrapper);

  function unreadCount(): number {
    return notifications.filter((n) => n.readAt === null).length;
  }

  function updateBadge(): void {
    const count = unreadCount();
    badge.textContent = String(count);
    badge.hidden = count === 0;
  }

  function renderList(): void {
    list.innerHTML = "";
    emptyMessage.hidden = notifications.length > 0;

    for (const notification of notifications) {
      const item = document.createElement("li");
      item.className = `notification ${notification.readAt ? "notification-read" : "notification-unread"}`;

      const text = document.createElement("p");
      text.textContent = notification.message;
      item.appendChild(text);

      const time = document.createElement("span");
      time.className = "notification-time";
      time.textContent = formatTime(notification.createdAt);
      item.appendChild(time);

      if (!notification.readAt) {
        const markReadButton = document.createElement("button");
        markReadButton.type = "button";
        markReadButton.textContent = "Mark read";
        markReadButton.addEventListener("click", () => void handleMarkRead(notification.id));
        item.appendChild(markReadButton);
      }

      list.appendChild(item);
    }
  }

  async function handleMarkRead(id: string): Promise<void> {
    const result = await markNotificationRead(id);
    if (result.status === 200 && "notification" in result.data) {
      const readAt = result.data.notification.readAt;
      notifications = notifications.map((n) => (n.id === id ? { ...n, readAt } : n));
      renderList();
      updateBadge();
    }
  }

  function addNotification(notification: Notification): void {
    // Avoid duplicating a notification that's already present (e.g. one already fetched via
    // history right before the stream delivered the same one).
    if (notifications.some((n) => n.id === notification.id)) return;
    notifications = [notification, ...notifications];
    renderList();
    updateBadge();
  }

  toggleButton.addEventListener("click", () => {
    panelOpen = !panelOpen;
    panel.hidden = !panelOpen;
  });

  async function init(): Promise<void> {
    const result = await listNotifications();
    if (result.status === 200 && "notifications" in result.data) {
      notifications = result.data.notifications;
      renderList();
      updateBadge();
    }

    openNotificationStream((notification) => addNotification(notification));
  }

  void init();
}
