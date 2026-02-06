# OpenAPI tags for RTK Query cache invalidation

The frontend generates RTK Query API slices from our OpenAPI spec. Cache **providesTags** and **invalidatesTags** are derived automatically from each operation’s **`tags`** array. This doc describes what the backend must provide so most invalidations can be generated without manual overrides.

## What the codegen does

- **Queries** (GET, etc.): `tags` → `providesTags`. “This response belongs to these cache groups.”
- **Mutations** (POST, PUT, PATCH, DELETE): `tags` → `invalidatesTags`. “After this mutation, these cache groups are stale.”

So the only thing the backend controls for automatic invalidation is **the `tags` array on each operation** in the OpenAPI spec.

## What the backend must provide

### 1. Tags on every operation

- **Every query** that returns cacheable data should have a `tags` array.
- **Every mutation** that changes data should have a `tags` array listing every cache group it invalidates.

Missing tags mean no automatic `providesTags`/`invalidatesTags` for that endpoint.

### 2. Consistent tag names

Use the **same tag names** for “this data” and “invalidate this data”:

- If a GET uses `tags: ["Orders"]`, any mutation that should refetch that list must include `"Orders"` in its `tags`.
- Use a small, stable set of tag names (e.g. `"Orders"`, `"Order"`, `"Offers"`, `"Contractors"`, `"Market"`) and reuse them across operations.

### 3. Mutations list all invalidated tags

For each mutation, list **every** tag that should be refetched after the mutation:

- Creating an order might invalidate both the orders list and related offers: `tags: ["Orders", "Offers"]`.
- Updating a contractor might invalidate that contractor and contractor lists: `tags: ["Contractors", "Contractor"]` (if you use both list and single-entity tags).

If a mutation affects multiple resources (e.g. order + offer + notifications), include all of their tags so the frontend refetches the right queries.

### 4. No extra schema or extensions required

The RTK Query codegen only reads the standard OpenAPI **`tags`** field. It does **not** use:

- Tag types with IDs (e.g. “invalidate only Order 123”).
- Custom extensions (e.g. `x-invalidatesTags`).

So for automatic invalidation we only need: **correct, consistent `tags` on every operation.**

## Summary

| Goal                                      | Backend action                                                                                      |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Automatic `providesTags` for queries      | Set `tags` on every cacheable GET (and other reads).                                                |
| Automatic `invalidatesTags` for mutations | Set `tags` on every mutation with the full list of cache groups to invalidate.                      |
| Consistent behavior                       | Use the same tag names for “provides” and “invalidates”; keep a small, documented set of tag names. |

With that, most invalidations can be generated automatically from the OpenAPI spec. Edge cases (e.g. ID-based invalidation or overrides) are handled on the frontend via codegen config or `enhanceEndpoints`.
