import { AlertTriangle, CalendarClock, Clock } from "lucide-react";
import { shortDateLabel } from "@/lib/format";
import type { LoanDueInfo } from "@/lib/loans";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const DUE_BADGE_STYLES = {
  overdue: {
    icon: AlertTriangle,
    className: "bg-red-500/15 text-red-700 dark:text-red-400",
    label: (date: string | null) => (date ? `Overdue · ${shortDateLabel(date)}` : "Overdue"),
  },
  "due-soon": {
    icon: Clock,
    className: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
    label: (date: string | null) => (date ? `Due ${shortDateLabel(date)}` : "Due soon"),
  },
  "due-this-month": {
    icon: Clock,
    className: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
    label: () => "Due this month",
  },
  scheduled: {
    icon: CalendarClock,
    className: "bg-muted text-muted-foreground",
    label: (date: string | null) => (date ? `Due ${shortDateLabel(date)}` : "Scheduled"),
  },
} as const;

export function DueBadge({ dueInfo }: { dueInfo: LoanDueInfo }) {
  const spec = DUE_BADGE_STYLES[dueInfo.status];
  const Icon = spec.icon;
  return (
    <Badge className={cn("gap-1 border-transparent", spec.className)}>
      <Icon className="size-3" /> {spec.label(dueInfo.date)}
    </Badge>
  );
}
