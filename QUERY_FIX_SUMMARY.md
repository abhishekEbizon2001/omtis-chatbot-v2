# Fix for Nested Aggregation Operators Issue

## Problem
The chatbot was generating invalid MongoDB queries by nesting aggregation operators (`$lookup`, `$match`) inside filter operators (`$in`). This resulted in errors like:

```
"cannot nest $ under $in"
```

### Example of Invalid Query (BEFORE):
```json
{
  "entity": "SalesOrder",
  "filters": {
    "customerId": {
      "$in": [
        {
          "$lookup": {
            "from": "customers",
            "localField": "customerId",
            "foreignField": "internalId",
            "as": "customerDetails"
          }
        },
        {
          "$match": {
            "category": "Corporate"
          }
        }
      ]
    }
  }
}
```

This is **syntactically invalid** in MongoDB. You cannot nest pipeline operators inside filter operators.

## Solution

### 1. Updated Prompt (promptBuilder.js)
Added comprehensive documentation in the system prompt to clarify:

- **Section 3 (FILTER RULES)**: Explicitly states that `filters` can ONLY contain simple field matching on root entity fields
- **Never nest aggregation operators** inside filter operators
- Clear examples of WRONG vs CORRECT patterns
- **Section 5 (COMMON MISTAKES)**: Added a dedicated section with visual indicators (❌ WRONG, ✓ CORRECT) showing common mistakes
- **Section 4 (EXAMPLES)**: Added specific example for "corporate customers" query showing the correct aggregation pipeline structure

### 2. Added Validation (queryExecutor.js)
Added `validateFilters()` function that:
- Checks if filters contain any aggregation operators
- Throws clear, descriptive error messages if invalid nesting is detected
- Provides guidance on how to fix the issue
- Acts as a safety net in case the LLM still makes mistakes

## Correct Pattern for Related Entity Filtering

When you need to filter based on a related entity (e.g., "corporate customers"), use this pattern:

```json
{
  "entity": "SalesOrder",
  "aggregation": [
    {
      "$match": {
        "orderDate": {
          "$gte": "2024-02-11T00:00:00.000Z",
          "$lt": "2026-02-11T00:00:00.000Z"
        }
      }
    },
    {
      "$lookup": {
        "from": "customers",
        "localField": "customerId",
        "foreignField": "internalId",
        "as": "customerDetails"
      }
    },
    {
      "$unwind": "$customerDetails"
    },
    {
      "$match": {
        "customerDetails.category": "Corporate"
      }
    },
    {
      "$group": {
        "_id": null,
        "totalSales": {
          "$sum": "$totalAmount"
        },
        "totalOrders": {
          "$sum": 1
        }
      }
    },
    {
      "$project": {
        "_id": 0,
        "totalSales": 1,
        "totalOrders": 1
      }
    }
  ],
  "filters": {},
  "returnFields": ["totalSales", "totalOrders"]
}
```

## Key Principles

### Use `filters` for:
- ✓ Simple field matching on root entity only
- ✓ Example: `{ "status": "Completed" }`
- ✓ Example: `{ "orderDate": { "$gte": "2024-01-01T00:00:00.000Z" } }`

### Use `aggregation` for:
- ✓ Filtering based on related/joined entities
- ✓ Counts, totals, grouping, summaries
- ✓ Any query requiring data from multiple collections
- ✓ Complex queries with joins, unwinding arrays, etc.

### Pipeline Order for Related Entity Filtering:
1. `$match` - Filter on root entity fields first (for performance)
2. `$lookup` - Join with related entity
3. `$unwind` - Unwind the joined array
4. `$match` - Filter on joined entity fields
5. `$group` - Aggregate results
6. `$project` - Shape the output

## Testing

To test the fix, try the original failing query:
```
"What is the growth of sales for the corporate customers in past 2 years?"
```

Expected: Should now generate a valid aggregation pipeline without nesting operators inside filters.

## Error Messages

If invalid nesting is still detected, you'll now see clear error messages like:

```
Invalid query: Aggregation operator "$lookup" found in "filters.customerId.$in[0]".
Cannot nest aggregation operators inside filter operators.
Move "$lookup", "$match", and other pipeline stages to the "aggregation" array.
```

This helps diagnose issues quickly and provides guidance on how to fix them.
