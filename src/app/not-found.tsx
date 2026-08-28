import Link from "next/link";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-4 text-center">
        <div className="space-y-1.5">
          <p className="text-sm font-medium text-muted-foreground">404</p>
          <h1 className="text-lg font-semibold">Page not found</h1>
          <p className="text-sm text-muted-foreground">
            That page doesn&rsquo;t exist or has moved.
          </p>
        </div>
        <Link href="/dashboard" className={cn(buttonVariants({ size: "sm" }))}>
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
