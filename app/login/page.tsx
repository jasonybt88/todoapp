"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";

export default function LoginPage() {
  const router = useRouter();

  useEffect(() => {
    let active = true;

    void fetch("/api/auth/me")
      .then((response) => {
        if (response.ok && active) {
          router.replace("/");
        }
      })
      .catch(() => {
        if (active) {
          router.refresh();
        }
      });

    return () => {
      active = false;
    };
  }, [router]);

  return (
    <main className="page-shell">
      <section className="auth-card" aria-labelledby="login-title">
        <p className="eyebrow">Todo App</p>
        <h1 id="login-title">Your passkey, your account</h1>
        <p className="muted">
          Register with a passkey or use one you have already saved. No password
          is needed.
        </p>
        <AuthForm />
      </section>
    </main>
  );
}
