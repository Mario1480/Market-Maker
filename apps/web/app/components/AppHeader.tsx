"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import LogoutButton from "./LogoutButton";

export default function AppHeader() {
  const pathname = usePathname();
  if (pathname === "/login") return null;

  return (
    <header className="appHeader">
      <div className="container appHeaderInner">
        <Link href="/" className="appLogo" aria-label="Market Maker">
          <img src="/images/logo.png" alt="uLiquid logo" className="appLogoMark" />
          <span className="appLogoText">uLiquid</span>
        </Link>
        <nav className="appNav">
          <Link href="/" className="btn">Dashboard</Link>
          <Link href="/settings" className="btn btnPrimary">Settings</Link>
          <LogoutButton />
        </nav>
      </div>
    </header>
  );
}
