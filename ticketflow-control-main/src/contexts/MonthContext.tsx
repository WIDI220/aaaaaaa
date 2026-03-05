import { createContext, useContext, useState, ReactNode } from 'react';

interface MonthContextType {
  activeMonth: string;
  setActiveMonth: (month: string) => void;
}

const MonthContext = createContext<MonthContextType | undefined>(undefined);

function getDefaultMonth(): string {
  const now = new Date();
  const currentYear = now.getFullYear();
  const stored = localStorage.getItem('widi_active_month');
  if (stored) {
    const parts = stored.split('-');
    const storedYear = parseInt(parts[0], 10);
    const storedMonth = parseInt(parts[1], 10);
    // Schutz: Jahr darf nicht in der Zukunft oder zu weit in der Vergangenheit liegen
    if (
      storedYear >= 2020 &&
      storedYear <= currentYear &&
      storedMonth >= 1 &&
      storedMonth <= 12
    ) {
      return stored;
    }
    // Ungültiger Wert → reset
    localStorage.removeItem('widi_active_month');
  }
  return `${currentYear}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function MonthProvider({ children }: { children: ReactNode }) {
  const [activeMonth, setActiveMonthState] = useState(getDefaultMonth);

  const setActiveMonth = (month: string) => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const parts = month.split('-');
    const year = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    // Schutz: niemals ein Jahr in der Zukunft setzen
    if (year > currentYear || year < 2020 || m < 1 || m > 12) return;
    setActiveMonthState(month);
    localStorage.setItem('widi_active_month', month);
  };

  return (
    <MonthContext.Provider value={{ activeMonth, setActiveMonth }}>
      {children}
    </MonthContext.Provider>
  );
}

export function useMonth() {
  const context = useContext(MonthContext);
  if (!context) throw new Error('useMonth must be used within MonthProvider');
  return context;
}
