import { ReactNode } from "react";

interface CardProps {
  children: ReactNode;
  className?: string;
}

export function Card({ children, className = "" }: CardProps) {
  return (
    <div
      className={`rounded-2xl p-5 ${className}`}
      style={{
        background: "var(--card)",
        border: "1px solid var(--card-border)",
      }}
    >
      {children}
    </div>
  );
}

export function CardHeader({ children }: { children: ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between">{children}</div>
  );
}

export function CardTitle({ children }: { children: ReactNode }) {
  return (
    <h2
      className="text-sm font-medium uppercase tracking-widest"
      style={{ color: "var(--muted)", letterSpacing: "0.1em" }}
    >
      {children}
    </h2>
  );
}
