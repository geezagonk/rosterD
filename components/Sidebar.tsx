"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  Building2,
  FileText,
  FolderKanban,
  LayoutDashboard,
  Mail,
  Receipt,
  Settings,
  UserCheck,
  Users,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { openReminders } from "@/lib/reminders";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/contractors", label: "Register", icon: Users },
  { href: "/approvals", label: "Approvals", icon: UserCheck },
  { href: "/invoices", label: "Invoices", icon: Receipt },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/vendors", label: "Vendors", icon: Building2 },
  { href: "/comms", label: "Comms", icon: Mail },
  { href: "/reminders", label: "Reminders", icon: Bell },
  { href: "/reports", label: "Reports", icon: FileText },
  { href: "/settings", label: "Settings", icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { data, ready } = useStore();
  const overdue = ready
    ? openReminders(data).filter(
        (r) => r.severity === "overdue" || r.severity === "due"
      ).length
    : 0;

  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="mark">
          <Users size={18} />
        </span>
        <span>
          <strong>Rostered</strong>
          <span>Contingent workforce</span>
        </span>
      </div>
      <nav className="nav">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active =
            href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link key={href} href={href} className={active ? "active" : ""}>
              <Icon size={16} />
              {label}
              {href === "/reminders" && overdue > 0 ? (
                <span className="count">{overdue}</span>
              ) : null}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
