import { Suspense } from "react";
import { CalendarPageContent } from "@/components/CalendarPageContent";

export default function CalendarPage() {
  return (
    <Suspense fallback={<main className="calendar-shell"><p role="status">Loading calendar...</p></main>}>
      <CalendarPageContent />
    </Suspense>
  );
}
