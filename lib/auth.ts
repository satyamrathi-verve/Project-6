/*
  Front-end-only session helpers for the Sign In gate. No backend, no `users`
  table — just a flag in localStorage. Shared by the sign-in page, the nav
  sign-out button, and the layout gate.
*/

export const AR_SESSION_KEY = "ar_signed_in";

export function isSignedIn(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(AR_SESSION_KEY) === "1";
}

export function signIn() {
  localStorage.setItem(AR_SESSION_KEY, "1");
}

export function signOut() {
  localStorage.removeItem(AR_SESSION_KEY);
}
