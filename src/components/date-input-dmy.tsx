import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";

function digitsOnly(v: string): string {
  return v.replace(/\D/g, "");
}

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

// A day/month/year triplet, always in that display order. A native
// <input type="date"> formats itself by the browser's own UI language, not
// this app's lang/dir — so on an English-locale browser it shows
// mm/dd/yyyy even inside this Arabic, RTL app, regardless of the page's own
// language toggle. This renders the order explicitly instead. The value
// stays the same ISO "yyyy-mm-dd" string every caller already expects
// (empty string while the three segments aren't all filled in yet).
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
        inputMode="numeric"
        placeholder="YYYY"
        maxLength={4}
        className="w-16 text-center"
      />
    </div>
  );
}
