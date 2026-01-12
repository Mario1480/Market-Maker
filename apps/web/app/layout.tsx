export const metadata = { title: "Market Maker UI" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body style={{ fontFamily: "system-ui", margin: 0, padding: 20 }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <h1 style={{ marginTop: 0 }}>Market Maker</h1>
          {children}
        </div>
      </body>
    </html>
  );
}