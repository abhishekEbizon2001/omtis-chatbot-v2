/**
 * Date Conversion Utilities
 * Handles conversion of ISO date strings to Date objects for MongoDB queries
 */

/**
 * Checks if a string is a valid ISO 8601 date string
 * @param {string} str - String to check
 * @returns {boolean} - True if valid ISO date string
 */
export const isISODateString = (str) => {
  // ISO 8601 date format regex: YYYY-MM-DDTHH:mm:ss.sssZ or YYYY-MM-DDTHH:mm:ssZ
  const isoDateRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/;
  if (!isoDateRegex.test(str)) {
    return false;
  }
  // Verify it's a valid date
  const date = new Date(str);
  return date instanceof Date && !isNaN(date.getTime());
};

/**
 * Recursively converts ISO date strings to Date objects in MongoDB query objects
 * This handles dates in filters, aggregation pipelines, and nested structures
 * @param {any} obj - Object to process (can be object, array, or primitive)
 * @returns {any} - Processed object with Date objects instead of date strings
 */
export const convertDatesToObjects = (obj) => {
  if (!obj || typeof obj !== "object") {
    return obj;
  }

  // Handle arrays
  if (Array.isArray(obj)) {
    return obj.map((item) => convertDatesToObjects(item));
  }

  // Handle objects
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    // If value is a string that looks like an ISO date, convert it to Date
    if (typeof value === "string" && isISODateString(value)) {
      result[key] = new Date(value);
    }
    // Recursively process nested objects and arrays
    else if (value && typeof value === "object") {
      result[key] = convertDatesToObjects(value);
    }
    // Keep primitive values as-is
    else {
      result[key] = value;
    }
  }
  return result;
};

