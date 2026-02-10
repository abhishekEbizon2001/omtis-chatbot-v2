import OpenAI from "openai";
import { executeQuery } from "../services/queryExecutor.js";
import { InventoryItemEnums, CustomerEnums } from "../config/enums.js";
import { Schemas } from "../config/schemas.js";

// Lazy initialization of OpenAI client
const getOpenAIClient = () => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY environment variable is not set");
  }
  return new OpenAI({ apiKey });
};

export const planQuery = async (req, res, next) => {
  try {
    const { userMessage } = req.body;

    if (!userMessage) {
      return res.status(400).json({
        success: false,
        message: "userMessage is required",
      });
    }

    // Check for API key before proceeding
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        success: false,
        message: "OPENAI_API_KEY environment variable is not configured",
      });
    }

    const openai = getOpenAIClient();

    // Convert enums and schemas to readable strings for prompt
    const inventoryEnumStrings = Object.entries(InventoryItemEnums)
      .map(([field, values]) => `InventoryItem.${field}: ${values.join(", ")}`)
      .join("\n  ");

    const customerEnumStrings = Object.entries(CustomerEnums)
      .map(([field, values]) => `Customer.${field}: ${values.join(", ")}`)
      .join("\n  ");

    const enumStrings =
      inventoryEnumStrings +
      (customerEnumStrings ? "\n  " + customerEnumStrings : "");

    const schemaStrings = Object.entries(Schemas)
      .map(([entity, fields]) => `${entity}: ${fields.join(", ")}`)
      .join("\n  ");

    const prompt = `
You are a MongoDB query planner. Your job is to analyze user queries and return ONLY the fields that are relevant to answering their question.

CRITICAL OUTPUT RULES:
- Output MUST be valid JSON
- Do NOT wrap in markdown or triple backticks
- Do NOT add explanations
- Return RAW JSON ONLY
- Only return fields that are present in the schema below
- ALWAYS be selective with returnFields - only include what's needed to answer the query

SCHEMAS:
${schemaStrings}

ENUM FIELDS:
${enumStrings}

RELATIONSHIPS:
- SalesOrder.customerId → Customer.internalId (references Customer entity, both are same type)
- SalesOrder.items[].itemId → InventoryItem.internalId (references InventoryItem entity)
  * CRITICAL: SalesOrder.items[].itemId is a STRING, but InventoryItem.internalId is a NUMBER
  * MUST convert itemId to number before $lookup: use $addFields with $toInt or $convert to convert "items.itemId" to number
  * Example conversion: { "$addFields": { "items.itemIdAsNumber": { "$toInt": "$items.itemId" } } }
- When querying across entities (e.g., "most sold items", "top customers"), use aggregation with $lookup to join related data


USER QUERY:
"${userMessage}"

RULES:

0. ENUM MATCHING AND NORMALIZATION
- Enum matching is CASE-INSENSITIVE.
- Normalize matched enum values to the exact casing used in ENUM FIELDS.
- Plural/singular forms are considered equivalent ("wine" == "wines").

0.5. INVENTORY SUBCATEGORY MAPPING - CRITICAL
- For InventoryItem.inventorySubcategory, map common user queries to exact enum values:
  * "free", "free items", "free item" → "Free (F)"
  * "defected", "defected items", "defected item", "defect", "defects" → "Defected (D)"
  * "consigned", "consigned items", "consigned item" → "Consigned (C)"
  * "normal", "normal items", "normal item" → "Normal"
- When user queries mention these terms (e.g., "find free items", "show defected items"), automatically map to the exact enum value including the parentheses notation.
- The matching should work even if the user doesn't mention the letter code (F, D, C).

1. ENUM RESOLUTION
- Identify enum values from the user query.
- For InventoryItem.inventorySubcategory, use the mapping rules in section 0.5 above.
- If a value matches exactly one enum field, assign it as a filter for that enum.
- If a value matches multiple enum fields:
    a) If the user explicitly specifies which enum, use that.
    b) Otherwise, create filters for all matching enums (OR-style) or prepare aggregation covering all of them.
- Do NOT ask for clarification unless there is complete ambiguity (no clear matches).

2. ENTITY SELECTION
- Always choose the entity where the data resides:
  - Counts, revenue, order history, sales analytics → SalesOrder
  - Customer metadata → Customer
  - Inventory metadata → InventoryItem
- For queries about "most sold", "top sellers", "best selling", "most ordered" items → Start with SalesOrder
- For queries about "customers who ordered most", "top customers" → Start with SalesOrder

2.5. CUSTOMER OPT-OUT STATUS
- IMPORTANT: In Customer entity, if globalSubscriptionStatus field is "Soft Opt-Out", it means the customer has opted out.
- When querying for customers, consider opt-out status:
  - If user asks for "active customers", "subscribed customers", "customers who haven't opted out", or similar → automatically exclude opted-out customers by adding filter: { "globalSubscriptionStatus": { "$ne": "Soft Opt-Out" } }
  - If user explicitly asks for "opted out customers", "customers who opted out", or similar → add filter: { "globalSubscriptionStatus": "Soft Opt-Out" }
  - If user doesn't specify opt-out preference, include all customers (no opt-out filter)
- This rule applies to both direct Customer queries and queries that join Customer data (e.g., SalesOrder queries that join Customer)

3. FILTER RULES
- Use filters for direct field matching on the root entity.
- Use aggregation for:
  - Counts, totals, grouping, or summaries
  - Joining related entities using $lookup (e.g., to get item details from InventoryItem or customer details from Customer)
  - Unwinding arrays (e.g., SalesOrder.items array)
  - Sorting and limiting results (top N queries)
- IMPORTANT: When joining SalesOrder.items[].itemId with InventoryItem, MUST convert itemId from string to number using $toInt before $lookup

4. RETURN FIELDS - CRITICAL: BE SELECTIVE AND SMART
- FIRST: Analyze what the user is actually asking for in their query.
- SECOND: Identify which fields from the schema are needed to answer that specific question.
- THIRD: Only include those relevant fields in returnFields.
- RULES:
  * Any field used in filters MUST be included in returnFields.
  * Always include the primary identifier (internalId) for reference.
  * Include fields that directly answer the question (e.g., if asking about price, include price-related fields).
  * Include fields that provide necessary context (e.g., itemName when showing items).
  * DO NOT include fields that are not relevant to the query.
  * DO NOT return all fields unless user explicitly asks for "all fields", "everything", or "complete details".
- EXAMPLES:
  * Query: "show red wines" → returnFields: ["internalId", "itemName", "type", "inventoryCategory", "price", "totalQuantity"]
  * Query: "wine prices" → returnFields: ["internalId", "itemName", "price", "currency", "pricing"]
  * Query: "customer orders" → returnFields: ["internalId", "transactionNumber", "customerId", "orderDate", "totalAmount", "items"]
  * Query: "inventory by location" → returnFields: ["internalId", "itemName", "locations", "totalQuantity"]
  * Query: "list all wines with details" → returnFields: [all relevant fields for wine items]
  * Query: "top 5 most sold wines" → returnFields: ["internalId", "itemName", "type", "inventoryCategory", "count", "totalQuantity"] (use aggregation with $lookup to join InventoryItem)
  * Query: "which customer has ordered the most" → returnFields: ["internalId", "name", "companyName", "orderCount", "totalAmount"] (use aggregation with $lookup to join Customer)
  * Query: "find free items" → filters: {"inventorySubcategory": "Free (F)"}, returnFields: ["internalId", "itemName", "inventorySubcategory", "price", "totalQuantity"]
  * Query: "show defected items" → filters: {"inventorySubcategory": "Defected (D)"}, returnFields: ["internalId", "itemName", "inventorySubcategory", "price", "totalQuantity"]
  * Query: "list consigned items" → filters: {"inventorySubcategory": "Consigned (C)"}, returnFields: ["internalId", "itemName", "inventorySubcategory", "price", "totalQuantity"]

5. REQUIRED OUTPUT FORMAT
- If clarification is absolutely required:
{
  "clarificationRequired": true,
  "matchingEnums": ["<enumField1>", "<enumField2>"],
  "value": "<ambiguous value>"
}

- Otherwise:
{
  "entity": "<RootEntity>",
  "aggregation": [<MongoDB aggregation pipeline stages as objects>],
  "filters": { "<enumField>": "<normalizedValue>", ... },
  "returnFields": ["<field1>", "<field2>", "..."],
  "limit": <number>,
  "clarificationRequired": false
}

- aggregation array should contain MongoDB aggregation pipeline stages as objects (e.g., $unwind, $group, $lookup, $sort, $limit, $match, $project, $addFields, $expr)
- For queries requiring joins, use $lookup to join related entities:
  * Collection names in $lookup are lowercase plural: "inventoryitems", "customers", "salesorders"
  * IMPORTANT TYPE CONVERSION: When joining SalesOrder.items[].itemId (string) with InventoryItem.internalId (number):
    - First: $unwind the items array
    - Second: $addFields to convert itemId string to number: { "$addFields": { "itemIdNumber": { "$toInt": "$items.itemId" } } }
    - Third: $lookup using the converted number field: { "$lookup": { "from": "inventoryitems", "localField": "itemIdNumber", "foreignField": "internalId", "as": "itemDetails" } }
  * Example for Customer join (no conversion needed): { "$lookup": { "from": "customers", "localField": "customerId", "foreignField": "internalId", "as": "customerDetails" } }
- For counting array lengths or comparing computed values:
  * Use $addFields with $size to count array elements: { "$addFields": { "orderCount": { "$size": "$orders" } } }
  * Then use $match with $expr for comparisons: { "$match": { "$expr": { "$gt": ["$orderCount", 1] } } }
  * Example: "customers with more than 1 order" → $lookup orders, $addFields orderCount with $size, $match with $expr $gt
- limit must be a positive integer (at least 1). Default to 100 if not specified. Never use 0.
- filters apply to the root entity before aggregation (use $match in aggregation for filters on joined entities or computed values)
- Add $project stage if lookup is used in aggregation.
- For simple queries without joins or grouping, aggregation can be empty array []


`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "system", content: prompt }],
      temperature: 0,
    });

    let queryPlan;
    try {
      queryPlan = JSON.parse(response.choices[0].message.content);
    } catch (parseError) {
      return res.status(500).json({
        success: false,
        message: "Failed to parse query plan from AI response",
        error: parseError.message,
        rawResponse: response.choices[0].message.content,
      });
    }

    if (queryPlan.clarificationRequired) {
      return res.json({
        success: true,
        clarificationRequired: true,
        queryPlan,
      });
    }

    // Automatically include filter fields in returnFields
    const allowedFields = Schemas[queryPlan.entity] || [];
    const filterFields = Object.keys(queryPlan.filters || {}).filter((f) =>
      allowedFields.includes(f),
    );
    queryPlan.returnFields = [
      ...new Set([...(queryPlan.returnFields || []), ...filterFields]),
    ];

    // Validate and fix limit - must be positive integer, default to 100
    if (!queryPlan.limit || queryPlan.limit < 1) {
      queryPlan.limit = 100;
    } else {
      queryPlan.limit = Math.floor(queryPlan.limit);
    }

    console.log("query->", queryPlan);
    let result;

    try {
      result = await executeQuery(queryPlan);
    } catch (queryError) {
      return res.status(500).json({
        success: false,
        message: "Query execution failed",
        error: queryError.message,
        query: queryPlan,
        stack:
          process.env.NODE_ENV === "development" ? queryError.stack : undefined,
      });
    }
    return res.json({
      success: true,
      query: queryPlan,
      result,
      count: result.length,
    });
  } catch (error) {
    // Catch any other unexpected errors
    return res.status(500).json({
      success: false,
      message: "An unexpected error occurred",
      error: error.message,
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
};
