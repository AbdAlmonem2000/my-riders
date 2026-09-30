import { useEffect, useRef, useState } from "react";
import { CalendarIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

function digitsOnly(v: string): string {
  return v.replace(/\D/g, "");
}

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

// A day/month/year triplet, always in that display order. A native
// <input type="date"> formats itself by the browser's own UI language, not
// this app's lang/dir — so on an English-locale browser it shows
// mm/dd/yyyy even inside this Arabic, RTL app, regardless of the page's own
// language toggle. This renders the order explicitly instead, plus a
// calendar button for picking a date visually — either one updates the
// same ISO "yyyy-mm-dd" string every caller already expects (empty string
// while the three typed segments aren't all filled in yet).
export function DateInputDMY({
  value,
  onChange,
  id,
}: {
  value: string;
  onChange: (value: string) => void;
  id?: string;
}) {
  const parsed = ISO_RE.exec(value || "");
  const [day, setDay] = useState(parsed ? parsed[3] : "");
  const [month, setMonth] = useState(parsed ? parsed[2] : "");
  const [year, setYear] = useState(parsed ? parsed[1] : "");
  const [calendarOpen, setCalendarOpen] = useState(false);

  // Stays in sync when the parent resets/loads a different value, e.g.
  // switching which document's date is being edited.
  useEffect(() => {
    const p = ISO_RE.exec(value || "");
    setDay(p ? p[3] : "");
    setMonth(p ? p[2] : "");
    setYear(p ? p[1] : "");
  }, [value]);

  const monthRef = useRef<HTMLInputElement>(null);
  const yearRef = useRef<HTMLInputElement>(null);
  const dayRef = useRef<HTMLInputElement>(null);

  // A single digit already means something ("4" is the 4th month) — padded
  // to two digits here for the emitted ISO value even before the field is
  // padded on screen, so leaving it at one digit never wrongly reads as an
  // incomplete/invalid date.
  const emit = (d: string, m: string, y: string) => {
    const complete =
      d.length >= 1 && d.length <= 2 && m.length >= 1 && m.length <= 2 && y.length === 4;
    onChange(complete ? `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}` : "");
  };

  const padOnBlur = (v: string, set: (v: string) => void) => {
    if (v.length === 1) set(v.padStart(2, "0"));
  };

  // A field that already holds a full value (editing an existing date)
  // selects itself on focus, so the very next keystroke replaces it
  // outright instead of inserting into it — typing into an already-"02"
  // day field without this would jump to the next field after just one new
  // digit (the field reads as "full" again immediately), never letting a
  // second digit land.
  const selectOnFocus = (e: React.FocusEvent<HTMLInputElement>) => e.target.select();

  const selectedDate =
    day.length === 2 && month.length === 2 && year.length === 4
      ? new Date(Number(year), Number(month) - 1, Number(day))
      : undefined;

  const handleCalendarSelect = (date: Date | undefined) => {
    if (!date) return;
    const d = String(date.getDate()).padStart(2, "0");
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const y = String(date.getFullYear());
    setDay(d);
    setMonth(m);
    setYear(y);
    onChange(`${y}-${m}-${d}`);
    setCalendarOpen(false);
  };

  return (
    <div id={id} dir="ltr" className="flex items-center gap-1.5">
      <Input
        ref={dayRef}
        value={day}
        onChange={(e) => {
          const v = digitsOnly(e.target.value).slice(0, 2);
          setDay(v);
          emit(v, month, year);
          if (v.length === 2) monthRef.current?.focus();
        }}
        onFocus={selectOnFocus}
        onBlur={() => padOnBlur(day, setDay)}
        inputMode="numeric"
        placeholder="DD"
        maxLength={2}
        className="w-12 text-center"
      />
      <span className="text-muted-foreground">/</span>
      <Input
        ref={monthRef}
        value={month}
        onChange={(e) => {
          const v = digitsOnly(e.target.value).slice(0, 2);
          setMonth(v);
          emit(day, v, year);
          if (v.length === 2) yearRef.current?.focus();
        }}
        onKeyDown={(e) => {
          if (e.key === "Backspace" && month === "") dayRef.current?.focus();
        }}
        onFocus={selectOnFocus}
        onBlur={() => padOnBlur(month, setMonth)}
        inputMode="numeric"
        placeholder="MM"
        maxLength={2}
        className="w-12 text-center"
      />
      <span className="text-muted-foreground">/</span>
      <Input
        ref={yearRef}
        value={year}
        onChange={(e) => {
          const v = digitsOnly(e.target.value).slice(0, 4);
          setYear(v);
          emit(day, month, v);
        }}
        onKeyDown={(e) => {
          if (e.key === "Backspace" && year === "") monthRef.current?.focus();
        }}
        onFocus={selectOnFocus}
        inputMode="numeric"
        placeholder="YYYY"
        maxLength={4}
        className="w-16 text-center"
      />
      <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" size="icon" className="h-9 w-9 shrink-0">
            <CalendarIcon className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            captionLayout="dropdown"
            selected={selectedDate}
            onSelect={handleCalendarSelect}
            defaultMonth={selectedDate}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
