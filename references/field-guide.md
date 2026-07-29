# Dynamic tool and field guide

Always discover the live schemas with `tools/list`. The server evolves and the live schema is authoritative.

## Core read path

- `list_trips`: identify accessible trips.
- `get_trip_summary`: trip, days, assignments, reservations, accommodations, budget, packing, todos, notes and members.
- Relevant `list_*`: obtain full records before editing or deleting.

## Common write groups

- Trip: `create_trip`, `update_trip`, `delete_trip`.
- Schedule: day, place and assignment tools.
- Search: `search_place` with `query`, explicit `market` (`china` or `global`), and either a Mainland `region` or overseas ISO `countryCode`.
- Decisions: `*_trip_proposal` and collaboration polls.
- Logistics: reservation and accommodation tools.
- Money: budget item, member, payer and settlement tools.
- Preparation: packing and todo tools.
- Collaboration: note, poll and chat tools when enabled.

## Idempotency keys for agent reasoning

The MCP tools do not promise a universal idempotency token. Before creating, compare:

- trip: normalized title + start/end dates
- place: normalized name + address + coordinates
- assignment: day ID + place ID + start time
- reservation: type + title + linked day/place
- accommodation: place + start/end day
- cost: category + name + amount
- packing/todo: normalized name
- note: normalized title

Reuse/update a match instead of creating a duplicate.

## Itinerary detail and ticket fields

The mini program opens an itinerary detail sheet when the user taps a day assignment. To make agent-written plans useful there:

- Route fields by ownership instead of putting everything into one note:

| User meaning | MCP field/tool | Mini program visibility |
| --- | --- | --- |
| Instructions for this specific visit | `update_assignment_time.notes` | `本次安排` in the assignment detail |
| Stable POI introduction | `create_place.description` / `update_place.description` | `地点信息 → 地点介绍`, shown automatically when non-empty |
| Reusable POI caveat | `create_place.notes` / `update_place.notes` | `地点信息 → 地点备注`, shown automatically when non-empty |
| Address and contact | place `address`, `phone`, `website` | Primary address facts plus direct phone/website actions |
| Booked time and voucher facts | reservation `reservation_time`, `reservation_end_time`, `confirmation_number`, `notes`, `url` | `预订信息`, linked through `assignment_id` |
| Expense | budget `name`, `total_price`, `category`, `currency`, `expense_date`, `payers`, `member_ids`, `note` | Top-level `费用` tab |
| Ticket image or PDF | `upload_trip_file` / `link_trip_file` with `assignment_id` or `reservation_id` | `票据与附件` in the assignment detail |

- Put arrival instructions, meeting points, age restrictions, what to bring, and other readable guidance in the assignment or reservation `notes`.
- Use `update_assignment_time.notes` for guidance specific to this visit. Use `update_place.notes` only for reusable place notes, and `update_place.description` for the public place introduction.
- Keep the UI visibility contract intact: assignment `notes` appear as "本次安排"; place `address` appears in the primary facts; place `phone` and `website` appear as direct actions. Since mini program 0.2.18, place `description` and `notes` are shown directly in "地点信息" when at least one exists; the section is hidden when both are empty.
- Treat every written field as a readback obligation. After `create_place`, `create_and_assign_place`, `update_place`, or `update_assignment_time`, call `list_places` or `get_trip_summary` and verify the exact value. Do not write opaque data to fields that the user cannot reach in the mini program.
- Create a reservation for a ticket, restaurant, tour, study activity, or event and link it with `assignment_id`.
- Use `confirmation_number` only for a real order/booking code.
- Use `reservation_time` and `reservation_end_time` for the booked time window.
- Use `url` for the official voucher, ticket, or booking page.
- Uploaded images and PDFs remain trip files. Link them to the reservation or assignment instead of placing base64 data or long image URLs in notes.
- Use `upload_trip_file` for an attachment up to 10 MB, or the bundled `upload-file` command so raw base64 never appears in terminal output. Use `list_trip_files` for readback, `link_trip_file` to add another relationship, and `trash_trip_file` to remove it from the active trip.
- Keep the reservation `pending` until the user supplies booking evidence; then update it to `confirmed`.
- The mini program's "预订" tab is the single editable reservation inventory. Legacy `day_assignments.reservation_*` fields are read-only compatibility data; do not write new booking data there.
- Use fixed budget category keys such as `accommodation`, `food`, `transport`, `activities`, `shopping`, or `other`. Record `expense_date`, currency and payers when known.

## Batch file format

`scripts/trek-mcp.mjs batch` accepts a JSON array:

```json
[
  {
    "label": "Inspect current trips",
    "tool": "list_trips",
    "arguments": { "include_archived": false }
  },
  {
    "label": "Search official hotel POI",
    "tool": "search_place",
    "arguments": { "query": "清远狮子湖喜来登度假酒店", "market": "china", "region": "清远", "countryCode": "CN" }
  }
]
```

Without `--apply`, the client prints the planned calls and performs no tools. With `--apply`, calls run sequentially and stop on the first error. Tool names containing delete/remove/decide/schedule/settle/restore/rotate require `--confirm-high-risk`.

## Readback checklist

Verify:

- exact trip dates and day count
- actual assignments by date/place equal the pre-write `expectedAssignmentsByDate` checklist
- every detailed-plan POI/activity is a visible assignment, not only day-note text
- any planned day with zero assignments is treated as a failure; intentional rest/location-free travel days are explicitly marked
- a hotel listed as a daily activity has both its accommodation range and a day assignment
- fixed assignments retain start/end times
- chronological order places untimed items last
- coordinates and addresses belong to the intended city
- reservations use honest status and no fabricated confirmation number
- assignment-linked reservations expose confirmation numbers, notes, voucher URLs and files in the mini program detail sheet
- accommodation day span and check-in/out
- budget currency, amount, persons/days and notes
- every expense and reservation created by the agent is editable and visible in the mini program's corresponding top-level tab
- no duplicate packing/todo/note names
- unresolved facts remain todos or explicit notes
