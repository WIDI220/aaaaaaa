import { NavLink as RouterNavLink } from "react-router-dom";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  to: string;
  icon: LucideIcon;
  children: React.ReactNode;
}

export function NavLink({ to, icon: Icon, children }: Props) {
  return (
    <RouterNavLink
      to={to}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors w-full",
          isActive
            ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
            : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
        )
      }
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span>{children}</span>
    </RouterNavLink>
  );
}

export default NavLink;
