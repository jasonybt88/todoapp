"use client";

import { startRegistration } from "@simplewebauthn/browser";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type {
  PublicKeyCredentialCreationOptionsJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";

interface AuthHomeProps {
  username: string;
}

interface ApiResponse {
  error?: string;
}

async function postJson<T>(
  path: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const result = (await response.json()) as ApiResponse & T;

  if (!response.ok) {
    throw new Error(result.error ?? "The request could not be completed.");
  }

  return result;
}

export function AuthHome({ username }: AuthHomeProps) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function addPasskey() {
    setError(null);
    setMessage(null);
    setBusy(true);

    try {
      if (!window.isSecureContext || !window.PublicKeyCredential) {
        throw new Error("This browser or device does not support passkeys.");
      }

      const options = await postJson<PublicKeyCredentialCreationOptionsJSON>(
        "/api/auth/register-options",
        { username },
      );
      const response: RegistrationResponseJSON = await startRegistration({
        optionsJSON: options,
      });
      await postJson("/api/auth/register-verify", { username, response });
      setMessage("Passkey added");
    } catch (cause) {
      setError(
        cause instanceof Error && cause.name === "NotAllowedError"
          ? "Passkey request cancelled. You can try again."
          : cause instanceof Error
            ? cause.message
            : "Passkey could not be added.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    setError(null);
    setBusy(true);

    try {
      await postJson("/api/auth/logout");
      router.replace("/login");
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Logout could not be completed.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page-shell">
      <section className="home-card" aria-labelledby="home-title">
        <p className="eyebrow">Todo App</p>
        <h1 id="home-title">Welcome back</h1>
        <p className="muted">Signed in as {username}</p>
        {message && (
          <p className="message success-message" role="status">
            {message}
          </p>
        )}
        {error && (
          <p className="message error-message" role="alert">
            {error}
          </p>
        )}
        <div className="home-actions">
          <button
            className="primary-button"
            type="button"
            disabled={busy}
            onClick={addPasskey}
          >
            {busy ? "Working..." : "Add another passkey"}
          </button>
          <button
            className="secondary-button"
            type="button"
            disabled={busy}
            onClick={logout}
          >
            Logout
          </button>
        </div>
      </section>
    </main>
  );
}
