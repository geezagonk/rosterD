import type { Metadata } from "next";
import "./globals.css";
import { StoreProvider } from "@/lib/store";
import Sidebar from "@/components/Sidebar";

export const metadata: Metadata = {
  title: "Rostered",
  description:
    "Contractor register, FTE capacity, cost run rate and vendor comms for an IT department",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en-NZ">
      <body>
        <StoreProvider>
          <div className="shell">
            <Sidebar />
            <main className="main">{children}</main>
          </div>
        </StoreProvider>
      </body>
    </html>
  );
}
