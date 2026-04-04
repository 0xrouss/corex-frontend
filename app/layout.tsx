import type { Metadata } from "next";
import { Space_Grotesk, Outfit } from "next/font/google";
import { headers } from "next/headers";
import ContextProvider from "@/context/context-provider";
import { Navbar } from "@/components/navbar";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Corex — Dark Pool",
  description: "Corex TEE-secured dark pool orderbook on Flare",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const headersList = await headers();
  const cookies = headersList.get("cookie");

  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${outfit.variable} h-full`}
    >
      <body className="min-h-full flex flex-col">
        <ContextProvider cookies={cookies}>
          <Navbar />
          <main className="pt-12">{children}</main>
        </ContextProvider>
      </body>
    </html>
  );
}
