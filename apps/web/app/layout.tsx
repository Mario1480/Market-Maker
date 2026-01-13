import Link from "next/link";
import "./globals.css";

export const metadata = { title: "Market Maker UI" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body>
        <header className="appHeader">
          <div className="container appHeaderInner">
            <Link href="/" className="appLogo" aria-label="Market Maker">
              <img src="/images/logo.png" alt="uLiquid logo" className="appLogoMark" />
              <span className="appLogoText">uLiquid</span>
            </Link>
            <nav className="appNav">
              <Link href="/" className="btn">Dashboard</Link>
              <Link href="/bots" className="btn">Bots</Link>
              <Link href="/settings" className="btn btnPrimary">Settings</Link>
            </nav>
          </div>
        </header>
        <main className="container appMain">{children}</main>
        <footer className="appFooter">
          <div className="container appFooterInner">
            <div className="appFooterCopy">© 2026 uLiquid Market-Maker</div>
            <div className="appFooterLinks">
              <a href="#" aria-label="Link 1">Link 1</a>
              <a href="#" aria-label="Link 2">Link 2</a>
              <a href="#" aria-label="Link 3">Link 3</a>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
