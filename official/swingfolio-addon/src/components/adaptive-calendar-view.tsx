import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  GainAmount,
  GainPercent,
  Icons,
  Separator,
} from "@wealthfolio/ui";
import type {
  CalendarDay,
  CalendarMonth,
  CalendarWeekStartPreference,
  ClosedTrade,
  SwingDashboardPeriod,
} from "../types";
import {
  addMonths,
  addYears,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
  subMonths,
  subYears,
} from "date-fns";
import { useMemo, useState } from "react";
import { cn } from "../lib/utils";
import { TickerAvatar } from "./ticker-avatar";

type CalendarViewType = "daily" | "yearly";
type WeekStartsOn = 0 | 1 | 2 | 3 | 4 | 5 | 6;

interface AdaptiveCalendarViewProps {
  calendar: CalendarMonth[];
  closedTrades: ClosedTrade[];
  selectedPeriod: SwingDashboardPeriod;
  selectedYear: Date;
  onYearChange: (date: Date) => void;
  onPeriodChange: (period: SwingDashboardPeriod) => void;
  currency: string;
  calendarWeekStart: CalendarWeekStartPreference;
}

function getPreferredLocale() {
  if (typeof navigator === "undefined") {
    return "en-US";
  }

  return navigator.languages?.[0] || navigator.language || "en-US";
}

const SUNDAY_START_REGIONS = new Set([
  "US",
  "CA",
  "CN",
  "HK",
  "IL",
  "JP",
  "KR",
  "MO",
  "MX",
  "PH",
  "SA",
  "SG",
  "TH",
  "TW",
]);

function getLocaleRegion(locale: string) {
  const normalizedLocale = locale.replace("_", "-");

  try {
    type LocaleWithRegion = { region?: string };
    const LocaleConstructor = (Intl as unknown as {
      Locale?: new (locale: string) => LocaleWithRegion;
    }).Locale;
    const region = LocaleConstructor ? new LocaleConstructor(normalizedLocale).region : null;

    if (region) {
      return region.toUpperCase();
    }
  } catch {
    // Fall through to a conservative locale-tag parser.
  }

  const region = normalizedLocale
    .split("-")
    .slice(1)
    .find((part) => /^[A-Za-z]{2}$/.test(part) || /^\d{3}$/.test(part));

  return region?.toUpperCase();
}

function getFallbackWeekStartsOn(locale: string): WeekStartsOn {
  const region = getLocaleRegion(locale);
  return region && !SUNDAY_START_REGIONS.has(region) ? 1 : 0;
}

function getSystemWeekStartsOn(): WeekStartsOn {
  const locale = getPreferredLocale();

  try {
    type LocaleWithWeekInfo = { weekInfo?: { firstDay?: number } };
    const LocaleConstructor = (Intl as unknown as {
      Locale?: new (locale: string) => LocaleWithWeekInfo;
    }).Locale;
    const firstDay = LocaleConstructor ? new LocaleConstructor(locale).weekInfo?.firstDay : null;

    if (typeof firstDay === "number" && firstDay >= 1 && firstDay <= 7) {
      return (firstDay % 7) as WeekStartsOn;
    }
  } catch {
    // Fall through when Intl.Locale.weekInfo is unavailable.
  }

  return getFallbackWeekStartsOn(locale);
}

function resolveWeekStartsOn(preference: CalendarWeekStartPreference): WeekStartsOn {
  if (preference === "monday") return 1;
  if (preference === "sunday") return 0;
  return getSystemWeekStartsOn();
}

function formatCompactAmount(value: number, locale: string) {
  const sign = value >= 0 ? "+" : "";
  return (
    sign +
    new Intl.NumberFormat(locale, {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(value)
  );
}

function formatCurrency(value: number, currency: string, locale: string) {
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return value.toLocaleString(locale);
  }
}

function formatQuantity(value: number, locale: string) {
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: 4,
  }).format(value);
}

function getWeekdayLabels(locale: string, weekStartsOn: WeekStartsOn) {
  const formatter = new Intl.DateTimeFormat(locale, { weekday: "short" });
  const sunday = new Date(2024, 0, 7);

  return Array.from({ length: 7 }, (_, index) => {
    const weekday = (weekStartsOn + index) % 7;
    const date = new Date(sunday);
    date.setDate(sunday.getDate() + weekday);
    return formatter.format(date);
  });
}

function getMonthName(month: number, locale: string) {
  return new Intl.DateTimeFormat(locale, { month: "short" }).format(new Date(2024, month - 1, 1));
}

function formatMonthYear(date: Date, locale: string) {
  return new Intl.DateTimeFormat(locale, { month: "short", year: "numeric" }).format(date);
}

function formatLongDate(date: Date, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

/**
 * Adaptive calendar that shows different granularity based on selected period:
 * - 1M: Daily calendar for current month
 * - 3M, 6M, YTD, 1Y, ALL: Yearly calendar for selected year
 */
export function AdaptiveCalendarView({
  calendar,
  closedTrades,
  selectedPeriod,
  selectedYear,
  onYearChange,
  onPeriodChange,
  currency,
  calendarWeekStart,
}: AdaptiveCalendarViewProps) {
  const locale = getPreferredLocale();
  const weekStartsOn = resolveWeekStartsOn(calendarWeekStart);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedDaySummaryPL, setSelectedDaySummaryPL] = useState<number | null>(null);

  const tradesByExitDate = useMemo(() => {
    const map = new Map<string, ClosedTrade[]>();

    for (const trade of closedTrades) {
      const dateKey = format(trade.exitDate, "yyyy-MM-dd");
      const existing = map.get(dateKey) ?? [];
      existing.push(trade);
      map.set(dateKey, existing);
    }

    return map;
  }, [closedTrades]);

  const selectedTrades = selectedDate ? tradesByExitDate.get(selectedDate) ?? [] : [];
  const selectedDateObject = selectedDate ? new Date(`${selectedDate}T12:00:00`) : null;

  const viewType: CalendarViewType = selectedPeriod === "1M" ? "daily" : "yearly";

  return (
    <>
      {viewType === "daily" ? (
        <DailyCalendarView
          calendar={calendar}
          selectedYear={selectedYear}
          onYearChange={onYearChange}
          currency={currency}
          locale={locale}
          weekStartsOn={weekStartsOn}
          tradesByExitDate={tradesByExitDate}
          onSelectDate={(date, realizedPL) => {
            setSelectedDate(date);
            setSelectedDaySummaryPL(realizedPL);
          }}
        />
      ) : (
        <YearlyCalendarView
          calendar={calendar}
          selectedYear={selectedYear}
          onYearChange={onYearChange}
          onPeriodChange={onPeriodChange}
          currency={currency}
          locale={locale}
        />
      )}

      <TradeDetailsDialog
        open={selectedTrades.length > 0}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedDate(null);
            setSelectedDaySummaryPL(null);
          }
        }}
        trades={selectedTrades}
        summaryPL={selectedDaySummaryPL}
        date={selectedDateObject}
        currency={currency}
        locale={locale}
      />
    </>
  );
}

interface DailyCalendarViewProps
  extends Pick<AdaptiveCalendarViewProps, "calendar" | "selectedYear" | "onYearChange" | "currency"> {
  locale: string;
  weekStartsOn: WeekStartsOn;
  tradesByExitDate: Map<string, ClosedTrade[]>;
  onSelectDate: (date: string, realizedPL: number) => void;
}

/**
 * Daily calendar view for 1M period
 */
function DailyCalendarView({
  calendar,
  selectedYear,
  onYearChange,
  currency,
  locale,
  weekStartsOn,
  tradesByExitDate,
  onSelectDate,
}: DailyCalendarViewProps) {
  const currentMonth = selectedYear.getMonth();
  const currentYear = selectedYear.getFullYear();

  const monthData = calendar.find(
    (cal) => cal.year === currentYear && cal.month === currentMonth + 1,
  );

  const monthStart = startOfMonth(selectedYear);
  const monthEnd = endOfMonth(selectedYear);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn });
  const calendarDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  const weekdayLabels = getWeekdayLabels(locale, weekStartsOn);

  const tradingDataMap = new Map<string, CalendarDay>();
  if (monthData) {
    monthData.days.forEach((day) => {
      tradingDataMap.set(day.date, day);
    });
  }

  const monthlyPL = monthData?.monthlyPL || 0;
  const monthlyTrades = monthData?.totalTrades || 0;

  const getDayColor = (day: CalendarDay | undefined, date: Date): string => {
    if (!day || day.tradeCount === 0) {
      return isToday(date) ? "bg-primary/10" : "bg-muted/5";
    }

    if (day.realizedPL > 0) {
      return "bg-success/20 hover:bg-success/30";
    }

    return "bg-destructive/20 hover:bg-destructive/30";
  };

  const handlePreviousMonth = () => {
    onYearChange(subMonths(selectedYear, 1));
  };

  const handleNextMonth = () => {
    onYearChange(addMonths(selectedYear, 1));
  };

  return (
    <div>
      <div className="mb-2 flex items-start justify-between gap-2 sm:mb-4">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold sm:text-base">Daily Calendar</h3>
          <div className="text-muted-foreground flex items-center gap-1 text-xs">
            <span>{monthlyTrades} trades</span>
            <span>-</span>
            <GainAmount value={monthlyPL} currency={currency} className="text-xs" />
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={handlePreviousMonth}
            className="rounded-full"
          >
            <Icons.ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="px-2 text-xs font-medium sm:px-3 sm:text-sm">
            {formatMonthYear(selectedYear, locale)}
          </span>
          <Button variant="outline" size="sm" onClick={handleNextMonth} className="rounded-full">
            <Icons.ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="pt-2 sm:p-4">
        <div className="flex w-full justify-center">
          <div className="w-full max-w-2xl">
            <table className="border-border/50 w-full table-fixed border-collapse overflow-hidden rounded-lg border">
              <thead>
                <tr className="border-border/50 border-b">
                  {weekdayLabels.map((day, index) => (
                    <th
                      key={`${day}-${index}`}
                      className={cn(
                        "text-muted-foreground bg-muted/20 w-[14.28%] py-2 text-center text-xs font-medium",
                        index < 6 && "border-border/50 border-r",
                      )}
                    >
                      {day}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {Array.from({ length: Math.ceil(calendarDays.length / 7) }, (_, weekIndex) => (
                  <tr
                    key={weekIndex}
                    className={cn(
                      weekIndex < Math.ceil(calendarDays.length / 7) - 1 &&
                        "border-border/50 border-b",
                    )}
                  >
                    {Array.from({ length: 7 }, (_, dayIndex) => {
                      const date = calendarDays[weekIndex * 7 + dayIndex];

                      if (!date) {
                        return (
                          <td
                            key={dayIndex}
                            className={cn(
                              "bg-background h-14 w-[14.28%] p-0 align-top sm:h-20",
                              dayIndex < 6 && "border-border/50 border-r",
                            )}
                          />
                        );
                      }

                      const dateStr = format(date, "yyyy-MM-dd");
                      const dayData = tradingDataMap.get(dateStr);
                      const dayTrades = tradesByExitDate.get(dateStr) ?? [];
                      const isCurrentDay = isToday(date);
                      const isCurrentMonthDay = isSameMonth(date, selectedYear);
                      const canDrillDown =
                        isCurrentMonthDay && dayData && dayData.tradeCount > 0 && dayTrades.length > 0;
                      const dayContent = (
                        <>
                          <div
                            className={cn(
                              "mb-1 text-xs font-medium",
                              isCurrentDay && "text-primary font-bold",
                              !isCurrentMonthDay && "text-muted-foreground/50",
                            )}
                          >
                            {new Intl.NumberFormat(locale).format(date.getDate())}
                          </div>

                          {isCurrentMonthDay && dayData && dayData.tradeCount > 0 ? (
                            <div className="flex flex-col items-center space-y-0.5 text-center">
                              <span
                                className={cn(
                                  "text-[10px] font-medium leading-tight",
                                  dayData.realizedPL >= 0 ? "text-success" : "text-destructive",
                                )}
                              >
                                {formatCompactAmount(dayData.realizedPL, locale)}
                              </span>
                              <div className="text-muted-foreground text-[9px] leading-tight">
                                {dayData.tradeCount}
                              </div>
                            </div>
                          ) : isCurrentMonthDay && isCurrentDay ? (
                            <div className="text-muted-foreground/50 text-[10px]">.</div>
                          ) : null}
                        </>
                      );

                      return (
                        <td
                          key={dayIndex}
                          className={cn(
                            "relative h-14 w-[14.28%] p-0 align-top sm:h-20",
                            dayIndex < 6 && "border-border/50 border-r",
                          )}
                        >
                          {canDrillDown ? (
                            <button
                              type="button"
                              onClick={() => onSelectDate(dateStr, dayData.realizedPL)}
                              aria-label={`Show ${dayData.tradeCount} trade${
                                dayData.tradeCount === 1 ? "" : "s"
                              } for ${formatLongDate(date, locale)}`}
                              className={cn(
                                "absolute inset-0 flex flex-col items-center justify-start p-2 text-xs transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset",
                                getDayColor(dayData, date),
                                isCurrentDay && "ring-primary/60 ring-2 ring-inset",
                                !isCurrentMonthDay && "opacity-50",
                              )}
                            >
                              {dayContent}
                            </button>
                          ) : (
                            <div
                              className={cn(
                                "absolute inset-0 flex flex-col items-center justify-start p-2 text-xs transition-all duration-200",
                                isCurrentMonthDay ? getDayColor(dayData, date) : "bg-muted/10",
                                isCurrentDay && "ring-primary/60 ring-2 ring-inset",
                                !isCurrentMonthDay && "opacity-50",
                              )}
                            >
                              {dayContent}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

interface YearlyCalendarViewProps
  extends Pick<AdaptiveCalendarViewProps, "calendar" | "selectedYear" | "onYearChange" | "currency"> {
  onPeriodChange: (period: SwingDashboardPeriod) => void;
  locale: string;
}

/**
 * Yearly calendar view for longer periods
 */
function YearlyCalendarView({
  calendar,
  selectedYear,
  onYearChange,
  onPeriodChange,
  currency,
  locale,
}: YearlyCalendarViewProps) {
  const year = selectedYear.getFullYear();
  const calendarMap = new Map(
    calendar.filter((cal) => cal.year === year).map((cal) => [cal.month, cal]),
  );
  const yearlyData: CalendarMonth[] = Array.from({ length: 12 }, (_, i) => {
    const month = i + 1;
    return (
      calendarMap.get(month) ?? {
        year,
        month,
        monthlyPL: 0,
        monthlyReturnPercent: 0,
        totalTrades: 0,
        days: [],
      }
    );
  });

  const yearlyPL = yearlyData.reduce((sum, month) => sum + month.monthlyPL, 0);
  const yearlyTrades = yearlyData.reduce((sum, month) => sum + month.totalTrades, 0);

  const getMonthColor = (month: CalendarMonth): string => {
    if (month.totalTrades === 0) return "bg-muted/10 hover:bg-muted/20";

    if (month.monthlyPL > 0) {
      return "bg-success/20 hover:bg-success/30";
    }

    return "bg-destructive/20 hover:bg-destructive/30";
  };

  const handlePreviousYear = () => {
    onYearChange(subYears(selectedYear, 1));
  };

  const handleNextYear = () => {
    onYearChange(addYears(selectedYear, 1));
  };

  const handleMonthSelect = (month: CalendarMonth) => {
    onYearChange(new Date(month.year, month.month - 1, 1));
    onPeriodChange("1M");
  };

  return (
    <div>
      <div className="mb-2 flex items-start justify-between gap-2 sm:mb-4">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold sm:text-base">Yearly Calendar</h3>
          <div className="text-muted-foreground flex items-center gap-1 text-xs">
            <span>{yearlyTrades} trades</span>
            <span>-</span>
            <GainAmount value={yearlyPL} currency={currency} className="text-xs" />
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button variant="outline" size="sm" onClick={handlePreviousYear} className="rounded-full">
            <Icons.ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="px-2 text-xs font-medium sm:px-3 sm:text-sm">
            {new Intl.NumberFormat(locale, { useGrouping: false }).format(year)}
          </span>
          <Button variant="outline" size="sm" onClick={handleNextYear} className="rounded-full">
            <Icons.ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="pt-2 sm:p-4">
        <div className="flex w-full justify-center">
          <div className="w-full max-w-2xl">
            <table className="border-border/50 w-full table-fixed border-collapse overflow-hidden rounded-lg border">
              <tbody>
                {Array.from({ length: Math.ceil(yearlyData.length / 3) }, (_, rowIndex) => (
                  <tr
                    key={rowIndex}
                    className={cn(
                      rowIndex < Math.ceil(yearlyData.length / 3) - 1 &&
                        "border-border/50 border-b",
                    )}
                  >
                    {Array.from({ length: 3 }, (_, colIndex) => {
                      const monthIndex = rowIndex * 3 + colIndex;
                      const month = yearlyData[monthIndex];

                      if (!month) {
                        return (
                          <td
                            key={colIndex}
                            className={cn(
                              "h-24 w-[33.33%] p-0 align-top sm:h-32",
                              colIndex < 2 && "border-border/50 border-r",
                            )}
                          />
                        );
                      }

                      const monthName = getMonthName(month.month, locale);
                      const isCurrentMonth =
                        new Date().getMonth() + 1 === month.month &&
                        new Date().getFullYear() === month.year;

                      return (
                        <td
                          key={colIndex}
                          className={cn(
                            "relative h-24 w-[33.33%] p-0 align-top sm:h-32",
                            colIndex < 2 && "border-border/50 border-r",
                          )}
                        >
                          <button
                            type="button"
                            onClick={() => handleMonthSelect(month)}
                            aria-label={`Open ${monthName} ${month.year} daily calendar`}
                            className={cn(
                              "absolute inset-0 flex cursor-pointer flex-col items-center justify-center p-4 text-xs transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset",
                              getMonthColor(month),
                              isCurrentMonth && "ring-primary/40 ring-2 ring-inset",
                            )}
                          >
                            <div className="mb-2 text-center text-sm font-semibold">
                              {monthName}
                            </div>

                            <div className="space-y-1 text-center">
                              {month.totalTrades > 0 ? (
                                <>
                                  <GainAmount value={month.monthlyPL} currency={currency} />
                                  <div className="text-muted-foreground text-xs">
                                    {month.totalTrades} trade{month.totalTrades !== 1 ? "s" : ""}
                                  </div>
                                </>
                              ) : (
                                <div className="text-muted-foreground/60 text-xs">No trades</div>
                              )}
                            </div>
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

interface TradeDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trades: ClosedTrade[];
  summaryPL: number | null;
  date: Date | null;
  currency: string;
  locale: string;
}

function TradeDetailsDialog({
  open,
  onOpenChange,
  trades,
  summaryPL,
  date,
  currency,
  locale,
}: TradeDetailsDialogProps) {
  const totalPL = summaryPL ?? trades.reduce((sum, trade) => sum + trade.realizedPL, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        side="bottom"
        className="max-h-[85vh] overflow-y-auto"
        mobileClassName="max-h-[85vh] overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle>{date ? formatLongDate(date, locale) : "Trading Day"}</DialogTitle>
          <DialogDescription>
            {trades.length} closed trade{trades.length === 1 ? "" : "s"}
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 space-y-4">
          <div className="bg-muted/40 flex items-center justify-between rounded-lg border p-3">
            <span className="text-muted-foreground text-sm">Realized P/L</span>
            <GainAmount value={totalPL} currency={currency} className="text-base font-semibold" />
          </div>

          <div className="space-y-3">
            {trades.map((trade, index) => (
              <div key={`${trade.id}-${index}`} className="rounded-lg border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <TickerAvatar symbol={trade.symbol} className="h-8 w-8" />
                    <div className="min-w-0">
                      <div className="truncate font-medium">{trade.symbol}</div>
                      <div className="text-muted-foreground truncate text-xs">
                        {trade.accountName}
                      </div>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <GainAmount
                      value={trade.realizedPL}
                      currency={trade.currency}
                      className="text-sm font-semibold"
                    />
                    <GainPercent value={trade.returnPercent} className="text-xs" />
                  </div>
                </div>

                <Separator className="my-3" />

                <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
                  <TradeDetail label="Quantity" value={formatQuantity(trade.quantity, locale)} />
                  <TradeDetail
                    label="Entry"
                    value={new Intl.DateTimeFormat(locale, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    }).format(trade.entryDate)}
                  />
                  <TradeDetail
                    label="Exit"
                    value={new Intl.DateTimeFormat(locale, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    }).format(trade.exitDate)}
                  />
                  <TradeDetail
                    label="Entry Price"
                    value={formatCurrency(trade.entryPrice, trade.currency, locale)}
                  />
                  <TradeDetail
                    label="Exit Price"
                    value={formatCurrency(trade.exitPrice, trade.currency, locale)}
                  />
                  <TradeDetail label="Hold" value={`${trade.holdingPeriodDays}d`} />
                </div>

                {(trade.totalFees > 0 || trade.totalDividends > 0) && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {trade.totalFees > 0 && (
                      <Badge variant="outline">
                        Fees {formatCurrency(trade.totalFees, trade.currency, locale)}
                      </Badge>
                    )}
                    {trade.totalDividends > 0 && (
                      <Badge variant="outline">
                        Dividends {formatCurrency(trade.totalDividends, trade.currency, locale)}
                      </Badge>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TradeDetail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-muted-foreground">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}
