import { createContext, useContext, useState, ReactNode } from 'react';

interface MonthContextType {
  activeMonth: string; // Format: "YYYY-MM"
  setActiveMonth: (month: string) => void;
}

const MonthContext = createContext<MonthContextType | undefined>(undefined);

function getDefaultMonth(): string {
  const stored = localStorage.getItem('widi_active_month');
  if (stored) return stored;
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function MonthProvider({ children }: { children: ReactNode }) {
  const [activeMonth, setActiveMonthState] = useState(getDefaultMonth);

  const setActiveMonth = (month: string) => {
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
