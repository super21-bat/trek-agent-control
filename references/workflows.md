# Research and synchronization workflows

## Research a new trip

1. Collect hard constraints: travelers, ages, accessibility, origin, dates, fixed bookings, work/school windows, budget and transport.
2. Verify time-sensitive claims online. Prefer official attraction, venue, carrier, hotel, government and map sources.
3. Use `search_place` for each real destination. In Mainland China pass `market: "china"` and an administrative region such as `深圳` or `清远`; overseas pass `market: "global"` and a two-letter country code such as `JP` or `FR`.
4. Design each day around geography, opening windows, heat/rain, meals, rest and transfer buffers. Extract every planned POI/activity into `expectedAssignmentsByDate`; do not leave locations only in narrative text.
5. Mark every item as confirmed, recommended, optional or pending confirmation.
6. Preview the plan before creating data.

## Create or update a trip

1. `list_trips` and normalize titles/dates to detect an existing trip.
2. Create only when no match exists; otherwise use the current trip ID.
3. `get_trip_summary` and map its day IDs to ISO dates.
4. Create/reuse places, then assign every expected POI/activity to the correct day with start/end time, duration, transport mode and assignment notes. New place: `create_and_assign_place`; existing place: `assign_place_to_day`.
5. Add reservations/accommodations only from evidence. Accommodation tools create a date range, not a daily assignment; if the hotel/check-in is part of the visible daily plan, also assign the hotel place to that day.
6. Add costs as estimates unless receipts/orders establish actual values.
7. Add packing items for traveler and destination needs.
8. Add todos for unresolved bookings, deadlines, safety checks and missing documents. Use due dates and priority.
9. Add collaboration notes for cross-cutting instructions that must remain visible.
10. When adding a trip cover or place image, upload the image, write the returned authenticated `file.url` to `trip.cover_image` or `place.image_url`, and verify both values on readback. A successful file upload without the entity field is incomplete.
11. Read back and compare each date's normalized assignment place names/IDs to `expectedAssignmentsByDate`. Any planned day with zero assignments, any expected place missing, or any POI present only in day-note text is a failed synchronization. Fix it before reporting completion. Intentional rest/location-free travel days must be marked explicitly.

Save the full expected checklist as a JSON object when using the bundled audit command. An empty array explicitly marks a rest/location-free day:

```json
{
  "2026-09-23": ["金门大桥", "Presidio"],
  "2026-09-24": [],
  "2026-09-25": ["Stanford University", "Apple Park Visitor Center"]
}
```

Run `node scripts/trek-mcp.mjs audit-plan <trip-id> /absolute/path/expected-assignments.json`. Exit code `2` means at least one date is missing, has missing assignments, or contains unexpected assignments; do not report completion.

## Collaborative planning

Use proposals before formal itinerary writes when a group has not decided:

1. `create_trip_proposal`
2. `react_trip_proposal`
3. `decide_trip_proposal` only after the owner confirms
4. `schedule_trip_proposal` only after choosing a day
5. `list_trip_proposals` to verify final status

Use polls for broad group choices and proposals for candidate places that may become scheduled items.

### Add one pending place

Prefer the semantic tool; do not assemble this from primitive writes:

1. If the place is already in 收藏, obtain its ID from `list_places`.
2. Call `add_pending_place({ tripId, placeId, title, ... })`; `placeId` is preferred
   for an existing saved place and prevents duplicate data.
   For a new candidate, pass `description`, `imageUrl`, `website`, `phone` and
   `placeNotes` when verified. Keep `reason` short and specific to this trip.
3. Require `persisted: true`, `destination: "pending"`, and an `open` proposal
   in the returned readback.
4. To remove it from active discussion but keep it saved, call
   `move_pending_place_to_saved({ tripId, proposalId })` after user confirmation.

Do not use `create_place`: a saved place is not the mini program's “待决定” item.
Do not report success without the semantic tool's persisted readback.

## Change an existing trip safely

Create a diff with:

- current value
- proposed value
- reason/source
- affected reservations, costs, members and travel time

Get confirmation before deleting, moving fixed bookings, changing financial data, or replacing confirmed reservations. Apply changes in dependency order and read back after each group.

## Daily briefing

Read the trip summary, today's day, reservations, todos and weather. Return:

- next fixed event and departure deadline
- route and buffer
- weather/clothing
- tickets/documents
- meal plan
- unresolved high-priority todo

Do not write anything for a briefing unless the user explicitly asks to update the trip.

## Evidence policy

- A map result establishes name/address/coordinates, not quality or current opening hours.
- A social post is a recommendation signal, not proof of current policy.
- A reservation is confirmed only with user/order evidence.
- If exact time, address, price, phone or booking status is unknown, preserve the uncertainty in a todo or note.
