import "./globals.css";

export const metadata = {
  title: "Browser Automation Agent",
  description: "Stage-1 Browser Automation Agent with streaming screenshots",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
