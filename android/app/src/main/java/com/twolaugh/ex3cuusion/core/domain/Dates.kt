package com.twolaugh.ex3cuusion.core.domain

import java.time.LocalDate
import java.time.temporal.ChronoUnit

// Port of the parts of src/lib/dates.ts the planner/day-list brain needs. Wire formats are
// identical to the web: dates are "YYYY-MM-DD" strings, clock times are "HH:MM" strings.
// java.time is used internally; nothing here ever consults the device clock or timezone.

private val DATE_RE = Regex("""^\d{4}-\d{2}-\d{2}$""")
private val TIME_RE = Regex("""^\d{2}:\d{2}$""")

fun validDate(value: String?): Boolean = value != null && DATE_RE.matches(value)

fun validTime(value: String?): Boolean = value != null && TIME_RE.matches(value)

fun addDays(dateOnly: String, days: Int): String =
    LocalDate.parse(dateOnly).plusDays(days.toLong()).toString()

// TS getUTCDay(): 0 = Sunday .. 6 = Saturday. java.time DayOfWeek is 1 = Monday .. 7 = Sunday.
fun dayOfWeek(dateOnly: String): Int = LocalDate.parse(dateOnly).dayOfWeek.value % 7

// Monday-start weeks, exactly like the TS startOfWeek/endOfWeek/weekRange/nextWeekRange.
data class DateRange(val startDate: String, val endDate: String)

fun startOfWeek(dateOnly: String): String {
    val day = dayOfWeek(dateOnly)
    val mondayOffset = if (day == 0) -6 else 1 - day
    return addDays(dateOnly, mondayOffset)
}

fun endOfWeek(dateOnly: String): String = addDays(startOfWeek(dateOnly), 6)

fun weekRange(dateOnly: String): DateRange = DateRange(startOfWeek(dateOnly), endOfWeek(dateOnly))

fun nextWeekRange(dateOnly: String): DateRange {
    val startDate = addDays(startOfWeek(dateOnly), 7)
    return DateRange(startDate, addDays(startDate, 6))
}

// TS returns Number.POSITIVE_INFINITY for a missing toDate; Int.MAX_VALUE plays the same role
// for every comparison the brain makes (due boosts, cooldowns, staleness).
fun daysUntil(fromDate: String, toDate: String?): Int {
    if (toDate == null) return Int.MAX_VALUE
    return ChronoUnit.DAYS.between(LocalDate.parse(fromDate), LocalDate.parse(toDate)).toInt()
}

// TS: Boolean(dateOnly && dateOnly >= startDate && dateOnly <= endDate) — lexicographic compare,
// so an empty endDate (the `?? ""` callers) makes the range empty, exactly like the web.
fun isDateInRange(dateOnly: String?, startDate: String, endDate: String): Boolean =
    !dateOnly.isNullOrEmpty() && dateOnly >= startDate && dateOnly <= endDate

fun timeToMinutes(time: String): Int {
    val parts = time.split(":")
    return parts[0].toInt() * 60 + parts[1].toInt()
}

// Wraps past midnight like the TS version (% 24h).
fun addMinutes(time: String, minutes: Int): String {
    val total = timeToMinutes(time) + minutes
    val nextHours = Math.floorDiv(total, 60) % 24
    val nextMinutes = Math.floorMod(total, 60)
    return "%02d:%02d".format(nextHours, nextMinutes)
}

fun maxTime(left: String, right: String): String =
    if (timeToMinutes(left) >= timeToMinutes(right)) left else right
