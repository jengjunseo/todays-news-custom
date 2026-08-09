"use client";

import { useState } from "react";

export function LoginForm() {
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError("");

    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: form.get("password") }),
    });

    if (response.ok) {
      window.location.assign("/");
      return;
    }

    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    setError(body?.error ?? "로그인할 수 없습니다.");
    setPending(false);
  }

  return (
    <form className="login-form" onSubmit={onSubmit}>
      <label htmlFor="password">비밀번호</label>
      <input
        id="password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        maxLength={256}
      />
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <button type="submit" disabled={pending}>
        {pending ? "확인 중…" : "브리핑 열기"}
      </button>
    </form>
  );
}
