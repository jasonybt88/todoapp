"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { CalendarView } from "@/components/CalendarView";
import { parseCalendarMonth } from "@/lib/calendar";

export function CalendarPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const monthParam = searchParams.get("month");
  const { year, month } = useMemo(() => parseCalendarMonth(monthParam), [monthParam]);

  function navigate(nextYear: number, nextMonth: number) {
    const monthValue = String(nextMonth).padStart(2, "0");
    router.replace(`/calendar?month=${nextYear}-${monthValue}`);
  }

  return (
    <CalendarView
      year={year}
      month={month}
      onNavigate={navigate}
    />
  );
}
