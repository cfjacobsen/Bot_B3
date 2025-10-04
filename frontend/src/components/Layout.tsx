import { ReactNode } from "react";
import { clsx } from "clsx";

interface LayoutProps {
  header: ReactNode;
  sidebar?: ReactNode;
  children: ReactNode;
}

export function Layout({ header, sidebar, children }: LayoutProps) {
  return (
    <div className="min-h-screen bg-background text-gray-100">
      <div className="max-w-7xl mx-auto px-6 py-6">
        {header}
        <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[320px_1fr]">
          {sidebar && <div className="space-y-6">{sidebar}</div>}
          <div className={clsx("space-y-6", sidebar ? "" : "xl:col-span-2")}>{children}</div>
        </div>
      </div>
    </div>
  );
}
