import { Injectable, signal } from '@angular/core';

/** A static credential the demo accepts. */
interface Credential {
  username: string;
  password: string;
}

/**
 * Static, front-end-only authentication for the demo.
 *
 * Two hard-coded credentials share the same password. There is no backend
 * involved — this only gates the UI so the optimizer/story pages sit behind a
 * login screen. The signed-in username is persisted in localStorage so a
 * refresh keeps the session.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  /** Shared password for every demo account. */
  private static readonly PASSWORD = 'opptra2026';

  /** The two accounts the demo accepts. */
  private static readonly CREDENTIALS: Credential[] = [
    { username: 'admin', password: AuthService.PASSWORD },
    { username: 'analyst', password: AuthService.PASSWORD },
  ];

  private static readonly STORAGE_KEY = 'opptra.auth.user';

  private readonly _user = signal<string | null>(this.restore());

  /** The currently signed-in username, or null. */
  readonly user = this._user.asReadonly();

  /** Whether a user is currently signed in. */
  isAuthenticated(): boolean {
    return this._user() !== null;
  }

  /**
   * Attempt to sign in. Returns true on success and persists the session.
   */
  login(username: string, password: string): boolean {
    const match = AuthService.CREDENTIALS.find(
      (c) => c.username === username.trim().toLowerCase() && c.password === password,
    );
    if (!match) {
      return false;
    }
    this._user.set(match.username);
    localStorage.setItem(AuthService.STORAGE_KEY, match.username);
    return true;
  }

  /** Sign out and clear the persisted session. */
  logout(): void {
    this._user.set(null);
    localStorage.removeItem(AuthService.STORAGE_KEY);
  }

  /** Restore a previously persisted session, if any. */
  private restore(): string | null {
    const saved = localStorage.getItem(AuthService.STORAGE_KEY);
    if (!saved) {
      return null;
    }
    return AuthService.CREDENTIALS.some((c) => c.username === saved) ? saved : null;
  }
}
