"use client";

import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";

type AuthResponse = { success?: boolean; error?: string };

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.name === "NotAllowedError") {
    return "Passkey request cancelled. You can try again.";
  }
  if (error instanceof Error && error.name === "NotSupportedError") {
    return "This browser or device does not support passkeys.";
  }
  if (error instanceof TypeError) {
    return "Could not reach the server. Check your connection and try again.";
  }
  return error instanceof Error
    ? error.message
    : "Passkey authentication could not be completed.";
}

async function postJson<T>(
  path: string,
  body: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = (await response.json()) as AuthResponse & T;

  if (!response.ok) {
    throw new Error(result.error ?? "The request could not be completed.");
  }

  return result;
}

function supportsPasskeys(): boolean {
  return (
    typeof window !== "undefined" &&
    window.isSecureContext &&
    typeof window.PublicKeyCredential !== "undefined"
  );
}

export function AuthForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"register" | "login" | null>(null);

  async function handleRegister() {
    setError(null);
    setBusy("register");

    try {
      if (!supportsPasskeys()) {
        throw new Error("This browser or device does not support passkeys.");
      }

      const options = await postJson<PublicKeyCredentialCreationOptionsJSON>(
        "/api/auth/register-options",
        { username },
      );
      const response: RegistrationResponseJSON = await startRegistration({
        optionsJSON: options,
      });

      await postJson<AuthResponse>("/api/auth/register-verify", {
        username,
        response,
      });
      router.replace("/");
      router.refresh();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(null);
    }
  }

  async function handleLogin() {
    setError(null);
    setBusy("login");

    try {
      if (!supportsPasskeys()) {
        throw new Error("This browser or device does not support passkeys.");
      }

      const options = await postJson<PublicKeyCredentialRequestOptionsJSON>(
        "/api/auth/login-options",
        { username },
      );
      const response: AuthenticationResponseJSON = await startAuthentication({
        optionsJSON: options,
      });

      await postJson<AuthResponse>("/api/auth/login-verify", {
        username,
        response,
      });
      router.replace("/");
      router.refresh();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="auth-form">
      <label htmlFor="username">Username</label>
      <input
        id="username"
        name="username"
        autoComplete="username webauthn"
        minLength={3}
        maxLength={32}
        pattern="[A-Za-z0-9._-]{3,32}"
        required
        value={username}
        onChange={(event) => setUsername(event.target.value)}
      />
      {error && (
        <p className="message error-message" role="alert">
          {error}
        </p>
      )}
      <button
        className="primary-button"
        type="button"
        disabled={busy !== null || username.trim().length < 3}
        onClick={handleRegister}
      >
        {busy === "register" ? "Registering..." : "Register"}
      </button>
      <button
        className="secondary-button"
        type="button"
        disabled={busy !== null || username.trim().length < 3}
        onClick={handleLogin}
      >
        {busy === "login" ? "Signing in..." : "Login"}
      </button>
    </div>
  );
}
