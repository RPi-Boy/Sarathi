# Sarathi

AI travel assistant. Express + SQLite (`node:sqlite`, Node ≥ 22.5), OpenRouter for the LLM.

## Run
    npm install
    cp .env.example .env     # add OPENROUTER_API_KEY (or set SARATHI_LLM_MOCK=1 to run offline)
    npm start                # creates and seeds data/sarathi.db on first boot
    npm run seed             # re-seed the catalog (users/searches/saved items are kept)

## Database (`db/`)
`schema.sql` — cities, airports, stations; flights; trains / train_stops / train_classes; hotels /
amenities / hotel_amenities; users, searches, itineraries, itinerary_items. FKs, CHECKs, UNIQUEs and indexes
are enforced. Existing `data/users.json` accounts are imported once on first boot.

**Seed data is sample data**: real airports, stations, train numbers and hotel names, with generated
(deterministic) schedules, fares, ratings and prices. It is not live inventory.

## How recommendations work
1. `POST /api/recommendations` sends the user's free-text preferences to the LLM with a fixed filter schema
   (`services/filters.js`). The model replies with JSON only; on failure it retries once, then falls back to
   rule-based extraction.
2. `sanitizeFilters` whitelists and coerces every field. Model output never reaches SQL except as bound parameters.
3. `services/recommend.js` queries flights, trains and hotels, ranks them (price / duration / rating), and
   relaxes price caps with a note when nothing matches. Chosen picks are fed into the itinerary prompt.

## Trips and bookings
Core entities and keys: `users.id`, `flights.flight_number`, `trains.number`, `hotels.id`. `itineraries` is a trip:
a user-chosen name (unique per user), destination, `start_at` (earliest departure/check-in among its bookings)
and the AI plan text. `itinerary_items` links a trip to exactly one flight, train or hotel (enforced by a CHECK)
with a snapshot of the price. A user can have many trips to the same destination.

Booking decrements seats/rooms in a transaction; cancelling restores them and recomputes `start_at`.
Prices are always computed server-side. The trip page builds a timeline of departures, arrivals, check-ins and
check-outs (hotel check-in 14:00, check-out 11:00).

`listing_url` on flights/trains/hotels is the provider's booking site (airline site, IRCTC, hotel-chain site).
These are not deep links to one specific flight/room; put real deep links in that column if you get partner access.

Endpoints: `GET /api/details/:type/:ref`, `POST /api/bookings` (`itinerary_id` or `new_trip_name`, plus `date`),
`DELETE /api/bookings/:id`, `GET /api/itineraries[?summary=1]`, `GET /api/cities`. Page: `/itineraries#trip-<id>`.
