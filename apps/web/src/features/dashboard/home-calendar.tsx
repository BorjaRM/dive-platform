'use client';

import type { DatesSetArg, EventInput } from '@fullcalendar/core';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import listPlugin from '@fullcalendar/list';
import luxonPlugin from '@fullcalendar/luxon3';
import FullCalendar from '@fullcalendar/react';
import timeGridPlugin from '@fullcalendar/timegrid';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { type ReactNode, useRef, useState } from 'react';
import { Button } from '../../components/ui/controls';
import type { CalendarViewName } from './calendar-navigation';
import styles from './home-calendar.module.css';

export type HomeCalendarRange = { from: string; to: string };

const viewOptions: { id: CalendarViewName; label: string }[] = [
  { id: 'timeGridDay', label: 'Day' },
  { id: 'timeGridWeek', label: 'Week' },
  { id: 'dayGridMonth', label: 'Month' },
  { id: 'listWeek', label: 'List' },
];

export default function HomeCalendar({
  events,
  timeZone,
  actions,
  legend,
  status,
  onRangeChange,
  onSelectSlot,
}: {
  events: EventInput[];
  timeZone: string;
  actions: ReactNode;
  legend: ReactNode;
  status: ReactNode;
  onRangeChange: (range: HomeCalendarRange) => void;
  onSelectSlot: (slotId: string) => void;
}) {
  const calendarRef = useRef<FullCalendar>(null);
  const [view, setView] = useState<string>('dayGridMonth');
  const [periodTitle, setPeriodTitle] = useState('');

  const move = (direction: 'prev' | 'next' | 'today') => {
    calendarRef.current?.getApi()[direction]();
  };

  const handleDatesSet = (info: DatesSetArg) => {
    setPeriodTitle(info.view.title);
    setView(info.view.type);
    onRangeChange({
      from: info.start.toISOString(),
      to: info.end.toISOString(),
    });
  };

  return (
    <>
      <div className="border-b border-line p-4 sm:p-5">
        <div className="flex flex-col gap-4 @2xl:flex-row @2xl:items-center">
          <div className="flex items-center gap-3">
            <div>
              <h3 className="text-base font-bold sm:text-lg">{periodTitle}</h3>
              <p className="text-xs text-muted sm:text-sm">
                Scheduled sessions · {timeZone}
              </p>
            </div>
            <div className="ml-2 flex rounded-xl border border-line bg-slate-50 p-1">
              <button
                type="button"
                onClick={() => move('prev')}
                className="rounded-lg p-1.5 text-muted hover:bg-white hover:text-ink hover:shadow-sm"
                aria-label="Previous period"
              >
                <ChevronLeft className="size-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => move('next')}
                className="rounded-lg p-1.5 text-muted hover:bg-white hover:text-ink hover:shadow-sm"
                aria-label="Next period"
              >
                <ChevronRight className="size-4" aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 @2xl:ml-auto">
            <Button variant="secondary" onClick={() => move('today')}>
              Today
            </Button>
            <div className="flex rounded-xl bg-slate-100 p-1">
              {viewOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={view === option.id}
                  onClick={() =>
                    calendarRef.current?.getApi().changeView(option.id)
                  }
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition sm:text-sm ${
                    view === option.id
                      ? 'bg-white text-ink shadow-sm'
                      : 'text-muted hover:text-ink'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            {actions}
          </div>
        </div>
        {legend}
      </div>

      {status}

      <div className={styles.calendar}>
        <FullCalendar
          ref={calendarRef}
          plugins={[
            dayGridPlugin,
            timeGridPlugin,
            listPlugin,
            luxonPlugin,
            interactionPlugin,
          ]}
          initialView="dayGridMonth"
          timeZone={timeZone}
          locale="en"
          headerToolbar={false}
          firstDay={1}
          height="auto"
          dayMaxEvents={3}
          nowIndicator
          editable={false}
          selectable={false}
          eventInteractive
          events={events}
          eventClick={(info) => onSelectSlot(info.event.id)}
          dateClick={(info) => {
            if (info.view.type === 'dayGridMonth')
              info.view.calendar.changeView('timeGridDay', info.dateStr);
          }}
          datesSet={handleDatesSet}
          displayEventEnd
          eventTimeFormat={{
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          }}
          slotLabelFormat={{
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          }}
          allDaySlot={false}
        />
      </div>
    </>
  );
}
