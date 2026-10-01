'use client';

import type { DatesSetArg, EventInput } from '@fullcalendar/core';
import dayGridPlugin from '@fullcalendar/daygrid';
import listPlugin from '@fullcalendar/list';
import luxonPlugin from '@fullcalendar/luxon3';
import FullCalendar from '@fullcalendar/react';
import timeGridPlugin from '@fullcalendar/timegrid';
import { Temporal } from '@js-temporal/polyfill';
import { useEffect, useRef } from 'react';
import { Select } from '../../components/ui/controls';
import styles from './calendar.module.css';
import type { CalendarViewName } from './calendar-navigation';

export type CalendarRange = {
  from: string;
  to: string;
  view: CalendarViewName;
  date: string;
};

export type CalendarViewProps = {
  events: EventInput[];
  timeZone: string;
  view: CalendarViewName;
  date: string;
  onRangeChange: (range: CalendarRange) => void;
  onSelectSlot: (slotId: string) => void;
};

export default function CalendarView({
  events,
  timeZone,
  view,
  date,
  onRangeChange,
  onSelectSlot,
}: CalendarViewProps) {
  const calendarRef = useRef<FullCalendar>(null);
  useEffect(() => {
    const calendar = calendarRef.current?.getApi();
    if (!calendar) return;
    if (calendar.view.type !== view) calendar.changeView(view, date);
    else if (
      Temporal.Instant.from(calendar.getDate().toISOString())
        .toZonedDateTimeISO(timeZone)
        .toPlainDate()
        .toString() !== date
    )
      calendar.gotoDate(date);
  }, [view, date, timeZone]);
  const handleDatesSet = (range: DatesSetArg) => {
    onRangeChange({
      from: range.start.toISOString(),
      to: range.end.toISOString(),
      view: range.view.type as CalendarViewName,
      date: Temporal.Instant.from(range.view.calendar.getDate().toISOString())
        .toZonedDateTimeISO(timeZone)
        .toPlainDate()
        .toString(),
    });
  };
  return (
    <div className={styles.calendar}>
      <label className={styles.viewControl} htmlFor="calendar-view">
        <span>View</span>
        <Select
          id="calendar-view"
          value={view}
          onChange={(event) => {
            calendarRef.current?.getApi().changeView(event.target.value);
          }}
        >
          <option value="dayGridMonth">Month</option>
          <option value="timeGridWeek">Week</option>
          <option value="timeGridDay">Day</option>
          <option value="listWeek">Agenda</option>
        </Select>
      </label>
      <FullCalendar
        ref={calendarRef}
        plugins={[dayGridPlugin, timeGridPlugin, listPlugin, luxonPlugin]}
        initialView={view}
        initialDate={date}
        timeZone={timeZone}
        locale="en"
        firstDay={1}
        headerToolbar={{ left: 'prev,next today', center: 'title', right: '' }}
        buttonText={{ today: 'Today' }}
        buttonHints={{
          prev: 'Previous period',
          next: 'Next period',
          today: 'Current period',
        }}
        height="auto"
        allDaySlot={false}
        dayMaxEvents={true}
        displayEventEnd={true}
        eventTimeFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
        slotLabelFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
        events={events}
        editable={false}
        selectable={false}
        eventInteractive={true}
        datesSet={handleDatesSet}
        eventClick={(event) => onSelectSlot(event.event.id)}
        eventContent={(event) => (
          <div
            className={styles.event}
            data-status={event.event.extendedProps.status}
          >
            <span>{event.timeText}</span>
            <strong>{event.event.title}</strong>
            <span>{event.event.extendedProps.status}</span>
            <span>
              {event.event.extendedProps.confirmedSeats} confirmed ·{' '}
              {event.event.extendedProps.heldSeats} held
            </span>
            <span>
              {event.event.extendedProps.remainingSeats === null
                ? 'Remaining unavailable'
                : `${event.event.extendedProps.remainingSeats} remaining`}
            </span>
          </div>
        )}
      />
    </div>
  );
}
