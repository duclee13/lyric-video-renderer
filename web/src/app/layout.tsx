import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Montserrat } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-inter",
  display: "swap",
});

const montserrat = Montserrat({
  subsets: ["latin", "vietnamese"],
  weight: ["700", "800", "900"],
  variable: "--font-montserrat",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Lyric Video Studio · WhisperX + Remotion",
  description:
    "Upload an MP3 and optional lyrics to render retro-pop kinetic typography lyric videos on GitHub Actions with WhisperX and Remotion v4.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${montserrat.variable} ${jetbrainsMono.variable}`}
    >
      <body className="antialiased selection:bg-[#D29BFF]/30 selection:text-[#F6F1FC]">
        {children}
      </body>
    </html>
  );
}
