import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { holidayDB } from "@/lib/db";
import { errorResponse } from "@/lib/http";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return errorResponse("Not authenticated", 401);
  }

  const searchParams = request.nextUrl.searchParams;
  const year = searchParams.get("year");
  const month = searchParams.get("month");
  if ((year === null) !== (month === null)) {
    return errorResponse("Both year and month are required when scoping holidays", 400);
  }
  if (year === null || month === null) {
    return NextResponse.json({ holidays: holidayDB.findAll() });
  }
  if (!/^\d{4}$/.test(year) || !/^\d{2}$/.test(month)) {
    return errorResponse("Year and month must use YYYY and MM formats", 400);
  }

  const yearNumber = Number(year);
  const monthNumber = Number(month);
  if (yearNumber < 1 || yearNumber > 9999 || monthNumber < 1 || monthNumber > 12) {
    return errorResponse("Year or month is out of range", 400);
  }

  return NextResponse.json({
    holidays: holidayDB.findByMonth(yearNumber, monthNumber),
  });
}
