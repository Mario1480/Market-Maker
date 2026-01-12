import "./globals.css";

export const metadata = { title: "Market Maker UI" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body className="app-body">
        <div className="app-shell">
          <h1 className="app-title">Market Maker</h1>
          {children}
        </div>
      </body>
    </html>
  );
}
