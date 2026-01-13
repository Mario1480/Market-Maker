import AppHeader from "./components/AppHeader";
import "./globals.css";

export const metadata = { title: "Market Maker UI" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body>
        <AppHeader />
        <main className="container appMain">{children}</main>
        <footer className="appFooter">
          <div className="container appFooterInner">
            <div className="appFooterCopy">© 2026 uLiquid Market-Maker</div>
            <div className="appFooterLinks">
              <a href="https://uliquid.vip" aria-label="Link 1">uliquid.vip</a>
              <a href="#" aria-label="Link 2">Link 2</a>
              <a href="#" aria-label="Link 3">Link 3</a>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
