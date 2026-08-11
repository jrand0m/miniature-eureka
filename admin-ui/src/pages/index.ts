import { getToken } from "../services/admin-api-client";

window.location.href = getToken() ? "/users.html" : "/login.html";
