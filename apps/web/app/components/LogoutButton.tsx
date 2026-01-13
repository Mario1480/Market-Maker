"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiPost } from "../../lib/api";

export default function LogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function logout() {
    setLoading(true);
    try {
      await apiPost("/auth/logout");
    } finally {
      router.push("/login");
      setLoading(false);
    }
  }

  return (
    <button className="btn" onClick={logout} disabled={loading}>
      {loading ? "Logging out..." : "Logout"}
    </button>
  );
}
