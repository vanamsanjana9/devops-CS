import { useMemo, useState } from 'react'

const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function toDateKey(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function parseDate(value) {
  if (typeof value !== 'string') return null
  const [year, month, day] = value.slice(0, 10).split('-').map(Number)
  if (!year || !month || !day) return null
  const date = new Date(year, month - 1, day)
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
    ? date
    : null
}

function getEasterSunday(year) {
  const century = Math.floor(year / 100)
  const yearOfCentury = year % 100
  const yearCycle = year % 19
  const leapCentury = Math.floor(century / 4)
  const centuryRemainder = century % 4
  const lunarCorrection = Math.floor((century + 8) / 25)
  const solarCorrection = Math.floor((century - lunarCorrection + 1) / 3)
  const epact = (19 * yearCycle + century - leapCentury - solarCorrection + 15) % 30
  const leapYears = Math.floor(yearOfCentury / 4)
  const yearRemainder = yearOfCentury % 4
  const weekdayCorrection = (32 + 2 * centuryRemainder + 2 * leapYears - epact - yearRemainder) % 7
  const dateCorrection = Math.floor((yearCycle + 11 * epact + 22 * weekdayCorrection) / 451)
  const easterMonth = Math.floor((epact + weekdayCorrection - 7 * dateCorrection + 114) / 31)
  const easterDay = ((epact + weekdayCorrection - 7 * dateCorrection + 114) % 31) + 1
  return new Date(year, easterMonth - 1, easterDay)
}

function getIndiaGeneralHolidays(year) {
  if (year === 2026) {
    return [
      { date: '2026-01-01', name: 'New Year' },
      { date: '2026-01-14', name: 'Bhogi' },
      { date: '2026-01-15', name: 'Sankranti / Pongal' },
      { date: '2026-01-16', name: 'Kanumu' },
      { date: '2026-01-26', name: 'Republic Day' },
      { date: '2026-02-15', name: 'Maha Shivaratri' },
      { date: '2026-03-03', name: 'Holi' },
      { date: '2026-03-19', name: 'Ugadi' },
      { date: '2026-03-21', name: 'Eid-ul-Fitr (Ramzan)' },
      { date: '2026-03-22', name: 'Following day of Ramzan' },
      { date: '2026-03-27', name: 'Sri Rama Navami' },
      { date: '2026-03-31', name: 'Mahaveer Jayanti' },
      { date: '2026-04-03', name: 'Good Friday' },
      { date: '2026-04-05', name: "Babu Jagjivan Ram's Birthday" },
      { date: '2026-04-14', name: 'Dr. B.R. Ambedkar\'s Birthday' },
      { date: '2026-05-01', name: 'Buddha Purnima' },
      { date: '2026-05-27', name: 'Eid-ul-Azha (Bakrid)' },
      { date: '2026-06-26', name: 'Moharram' },
      { date: '2026-07-16', name: 'Ratha Yathra' },
      { date: '2026-08-10', name: 'Bonalu' },
      { date: '2026-08-15', name: 'Independence Day' },
      { date: '2026-08-26', name: 'Eid Milad-un-Nabi' },
      { date: '2026-08-28', name: 'Sravana Purnima / Rakhi Purnima' },
      { date: '2026-09-04', name: 'Sri Krishnashtami' },
      { date: '2026-09-14', name: 'Vinayaka Chavithi' },
      { date: '2026-10-02', name: 'Mahatma Gandhi Jayanthi' },
      { date: '2026-10-18', name: 'Saddula Bathukamma' },
      { date: '2026-10-19', name: 'Maharnavami' },
      { date: '2026-10-20', name: 'Vijaya Dasami (Dussehra)' },
      { date: '2026-10-21', name: 'Following day of Vijaya Dasami' },
      { date: '2026-10-26', name: 'Hazrath Syed Mohd. Juvanpuri Birthday' },
      { date: '2026-11-08', name: 'Deepavali' },
      { date: '2026-11-24', name: 'Karthika Pournami' },
      { date: '2026-12-24', name: 'Christmas Eve' },
      { date: '2026-12-25', name: 'Christmas' },
      { date: '2026-12-26', name: 'Boxing Day' },
    ]
  }

  const easterSunday = getEasterSunday(year)
  return [
    { date: new Date(year, 0, 1), name: "New Year's Day" },
    { date: new Date(year, 0, 26), name: 'Republic Day' },
    { date: new Date(easterSunday.getFullYear(), easterSunday.getMonth(), easterSunday.getDate() - 2), name: 'Good Friday' },
    { date: new Date(year, 7, 15), name: 'Independence Day' },
    { date: new Date(year, 9, 2), name: 'Gandhi Jayanti' },
    { date: new Date(year, 11, 25), name: 'Christmas Day' },
  ].map((holiday) => ({ ...holiday, date: toDateKey(holiday.date) }))
}

function DeadlineCalendar({ tasks }) {
  const [selectedDate, setSelectedDate] = useState(() => new Date())
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1))

  const deadlinesByDate = useMemo(() => {
    const deadlines = new Map()
    tasks.forEach((task) => {
      const dueDate = parseDate(task.dueDate)
      if (!dueDate) return
      const key = toDateKey(dueDate)
      deadlines.set(key, [...(deadlines.get(key) || []), task])
    })
    return deadlines
  }, [tasks])

  const holidaysByDate = useMemo(() => {
    const holidays = new Map()
    const years = new Set([month.getFullYear() - 1, month.getFullYear(), month.getFullYear() + 1])
    years.forEach((year) => {
      getIndiaGeneralHolidays(year).forEach((holiday) => {
        holidays.set(holiday.date, [...(holidays.get(holiday.date) || []), holiday])
      })
    })
    return holidays
  }, [month])

  const calendarDays = useMemo(() => {
    const firstOfMonth = new Date(month.getFullYear(), month.getMonth(), 1)
    const mondayOffset = (firstOfMonth.getDay() + 6) % 7
    const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
    const visibleDayCount = Math.ceil((mondayOffset + daysInMonth) / 7) * 7
    return Array.from({ length: visibleDayCount }, (_, index) =>
      new Date(month.getFullYear(), month.getMonth(), index - mondayOffset + 1)
    )
  }, [month])

  const selectedKey = toDateKey(selectedDate)
  const selectedDeadlines = deadlinesByDate.get(selectedKey) || []
  const selectedHolidays = holidaysByDate.get(selectedKey) || []
  const todayKey = toDateKey(new Date())
  const monthLabel = month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })

  const changeMonth = (offset) => {
    const nextMonth = new Date(month.getFullYear(), month.getMonth() + offset, 1)
    setMonth(nextMonth)
    setSelectedDate(nextMonth)
  }

  return (
    <section className="panel deadline-calendar-panel" aria-labelledby="deadline-calendar-title">
      <div className="panel-header deadline-calendar-header">
        <div>
          <p className="eyebrow">Dates to keep in view</p>
          <h2 id="deadline-calendar-title">Deadline calendar</h2>
        </div>
        <div className="calendar-month-controls" aria-label="Calendar month navigation">
          <button type="button" className="calendar-nav-btn" onClick={() => changeMonth(-1)} aria-label="Previous month" title="Previous month">
            ‹
          </button>
          <strong aria-live="polite">{monthLabel}</strong>
          <button type="button" className="calendar-nav-btn" onClick={() => changeMonth(1)} aria-label="Next month" title="Next month">
            ›
          </button>
        </div>
      </div>

      <div className="deadline-calendar-layout">
        <div className="calendar-month-view">
          <div className="calendar-grid calendar-weekdays" aria-hidden="true">
            {weekDays.map((day) => <span key={day}>{day}</span>)}
          </div>
          <div className="calendar-grid calendar-days">
            {calendarDays.map((date) => {
              const key = toDateKey(date)
              const deadlineCount = deadlinesByDate.get(key)?.length || 0
              const holidays = holidaysByDate.get(key) || []
              const classes = [
                'calendar-day',
                date.getMonth() === month.getMonth() ? '' : 'outside-month',
                key === todayKey ? 'today' : '',
                key === selectedKey ? 'selected' : '',
                deadlineCount ? 'has-deadline' : '',
                holidays.length ? 'has-holiday' : '',
              ].filter(Boolean).join(' ')

              return (
                <button
                  type="button"
                  key={key}
                  className={classes}
                  aria-label={`${date.toLocaleDateString()}${holidays.length ? `, ${holidays.map((holiday) => holiday.name).join(', ')}` : ''}${deadlineCount ? `, ${deadlineCount} deadline${deadlineCount === 1 ? '' : 's'}` : ''}`}
                  aria-pressed={key === selectedKey}
                  onClick={() => setSelectedDate(date)}
                >
                  <span>{date.getDate()}</span>
                  {(holidays.length > 0 || deadlineCount > 0) && (
                    <span className="calendar-day-markers" aria-hidden="true">
                      {holidays.length > 0 && <i className="holiday-indicator" />}
                      {deadlineCount > 0 && <i className="task-indicator" />}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
          <div className="calendar-legend" aria-label="Calendar markers">
            <span><i className="holiday-indicator" /> Holiday</span>
            <span><i className="task-indicator" /> Task deadline</span>
          </div>
        </div>

        <aside className="calendar-deadline-list" aria-live="polite">
          <div className="calendar-deadline-heading">
            <div>
              <p className="eyebrow">Selected day</p>
              <h3>{selectedDate.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}</h3>
            </div>
            <div className="calendar-event-counts">
              <span className="pill">{selectedHolidays.length} holiday{selectedHolidays.length === 1 ? '' : 's'}</span>
              <span className="pill">{selectedDeadlines.length} due</span>
            </div>
          </div>
          {selectedHolidays.length || selectedDeadlines.length ? (
            <ul>
              {selectedHolidays.map((holiday) => (
                <li className="calendar-holiday-item" key={holiday.name}>
                  <span className="calendar-deadline-dot holiday-dot" aria-hidden="true" />
                  <div>
                    <strong>{holiday.name}</strong>
                    <span>Holiday</span>
                  </div>
                </li>
              ))}
              {selectedDeadlines.map((task) => (
                <li key={task.id}>
                  <span className="calendar-deadline-dot" aria-hidden="true" />
                  <div>
                    <strong>{task.title}</strong>
                    <span>{task.team}{task.status ? ` · ${task.status}` : ''}</span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty-state calendar-empty-state">No holidays or deadlines on this day.</p>
          )}
        </aside>
      </div>
    </section>
  )
}

export default DeadlineCalendar