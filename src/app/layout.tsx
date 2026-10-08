import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";

const display = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

const telemetry = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-telemetry",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Relâmpago",
  description: "Assistente de voz para a sua agenda.",
  applicationName: "Relâmpago",
  icons: { icon: "/icon.svg" },
  appleWebApp: {
    capable: true,
    title: "Relâmpago",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#050506",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${display.variable} ${telemetry.variable}`}>
      <body>{children}</body>
    </html>
  );
}
