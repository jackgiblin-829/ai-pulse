import "./globals.css";

export const metadata = {
  title: "AI Pulse — GEO Visibility | 829 Studios",
  description:
    "Generative engine visibility, share of voice, and PR intelligence across ChatGPT, Gemini, and Claude.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
