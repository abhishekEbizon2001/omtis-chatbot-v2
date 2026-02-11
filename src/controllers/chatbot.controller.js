/**
 * Chatbot Controller
 * Handles chatbot query planning and execution
 */

import { executeQuery } from "../services/queryExecutor.js";
import { generateQueryPlan } from "../services/openai.service.js";
import { buildQueryPlannerPrompt } from "../services/promptBuilder.js";
import { convertDatesToObjects } from "../utils/dateConverter.js";
import { Schemas } from "../config/schemas.js";

/**
 * Validates if OpenAI API key is configured
 * @param {Object} res - Express response object
 * @returns {boolean} - True if configured, sends error response if not
 */
const validateApiKey = (res) => {
  if (!process.env.OPENAI_API_KEY) {
    res.status(500).json({
      success: false,
      message: "OPENAI_API_KEY environment variable is not configured",
    });
    return false;
  }
  return true;
};

/**
 * Validates and normalizes the limit value
 * @param {number} limit - The limit value from query plan
 * @returns {number} - Valid limit (minimum 1, default 100)
 */
const validateLimit = (limit) => {
  if (!limit || limit < 1) {
    return 100;
  }
  return Math.floor(limit);
};

/**
 * Ensures filter fields are included in return fields
 * @param {Object} queryPlan - The query plan object
 * @returns {Array<string>} - Updated return fields array
 */
const mergeFilterFieldsWithReturnFields = (queryPlan) => {
  const allowedFields = Schemas[queryPlan.entity] || [];
  const filterFields = Object.keys(queryPlan.filters || {}).filter((f) =>
    allowedFields.includes(f)
  );
  return [...new Set([...(queryPlan.returnFields || []), ...filterFields])];
};

/**
 * Processes and normalizes the query plan
 * @param {Object} queryPlan - Raw query plan from LLM
 * @returns {Object} - Processed query plan
 */
const processQueryPlan = (queryPlan) => {
  // Convert ISO date strings to Date objects in filters and aggregation
  if (queryPlan.filters) {
    queryPlan.filters = convertDatesToObjects(queryPlan.filters);
  }
  if (queryPlan.aggregation && Array.isArray(queryPlan.aggregation)) {
    queryPlan.aggregation = convertDatesToObjects(queryPlan.aggregation);
  }

  // Merge filter fields into return fields
  queryPlan.returnFields = mergeFilterFieldsWithReturnFields(queryPlan);

  // Validate and fix limit
  queryPlan.limit = validateLimit(queryPlan.limit);

  return queryPlan;
};

/**
 * Main controller for planning and executing chatbot queries
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
export const planQuery = async (req, res, next) => {
  try {
    const { userMessage } = req.body;

    // Validate request
    if (!userMessage) {
      return res.status(400).json({
        success: false,
        message: "userMessage is required",
      });
    }

    // Check API key
    if (!validateApiKey(res)) {
      return; // Response already sent
    }

    // Build prompt and generate query plan
    let queryPlan;
    try {
      const prompt = buildQueryPlannerPrompt(userMessage);
      queryPlan = await generateQueryPlan(prompt);
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: "Failed to generate query plan from AI",
        error: error.message,
      });
    }

    // Handle clarification requests
    if (queryPlan.clarificationRequired) {
      const prompt = `
${userMessage}

Classify this query into one of the following entities:
1. inventoryitems
2. salesorders
3. customers

Return ONLY valid JSON in this exact format:

{
  "entity": "inventoryitems" | "salesorders" | "customers",
  "confidence": "low" | "medium" | "high"
}
`;
      const answer = await generateQueryPlan(prompt)

      return res.json({
        success: true,
        clarificationRequired: true,
        queryPlan,
        answer,
      });
    }

    // Process and normalize query plan
    queryPlan = processQueryPlan(queryPlan);

    console.log("query->", queryPlan);

    // Execute query
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

    // Return successful response
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
