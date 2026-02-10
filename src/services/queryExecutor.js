import SalesOrder from "../models/SalesOrder.model.js";
import Customer from "../models/Customer.model.js";
import InventoryItem from "../models/InventoryItem.model.js";
import { Schemas } from "../config/schemas.js";
import { InventoryItemEnums, CustomerEnums } from "../config/enums.js";

const ENTITY_MAP = { SalesOrder, Customer, InventoryItem };

export const executeQuery = async (queryPlan) => {
    const { entity, filters = {}, aggregation = [], returnFields = [], limit = 100 } = queryPlan;
    const Model = ENTITY_MAP[entity];

    if (!Model) {
        throw new Error(`Unknown entity: ${entity}`);
    }

    // Validate and fix limit - must be positive
    const validLimit = Math.max(1, limit || 100);

    // -----------------------------
    // ENUM VALIDATION
    // -----------------------------
    if (entity === "InventoryItem") {
        for (const [field, validValues] of Object.entries(InventoryItemEnums)) {
            if (filters[field] && !validValues.includes(filters[field])) {
                console.warn(`Invalid enum value for ${field}: ${filters[field]}. Removing filter.`);
                delete filters[field];
            }
        }
    }

    if (entity === "Customer") {
        for (const [field, validValues] of Object.entries(CustomerEnums)) {
            if (filters[field] && !validValues.includes(filters[field])) {
                console.warn(`Invalid enum value for ${field}: ${filters[field]}. Removing filter.`);
                delete filters[field];
            }
        }
    }

    // -----------------------------
    // SANITIZE RETURN FIELDS AGAINST SCHEMA
    // -----------------------------
    const allowedFields = Schemas[entity];

    // Automatically include filter fields in returnFields
    const filterFields = Object.keys(filters).filter(f => allowedFields.includes(f));
    const combinedReturnFields = [...new Set([...returnFields, ...filterFields])];

    // Aggregation path
    if (aggregation.length > 0) {
        // For aggregation, don't filter returnFields against schema because aggregation
        // may create computed fields, joined fields, or aggregated values that aren't in the base schema
        const fieldsToReturn = combinedReturnFields.length > 0
            ? combinedReturnFields
            : ['_id']; // Default to just _id if nothing specified

        const pipeline = [...aggregation];

        // Check if pipeline already has $project stage
        const hasProject = pipeline.some(stage => stage.$project !== undefined);

        // Check if pipeline already has $limit stage
        const hasLimit = pipeline.some(stage => stage.$limit !== undefined);

        // Add $project only if not already present and we have fields to return
        if (!hasProject && fieldsToReturn.length > 0) {
            const project = {};
            fieldsToReturn.forEach(f => (project[f] = 1));
            pipeline.push({ $project: project });
        }

        // Add $limit only if not already present
        if (!hasLimit) {
            pipeline.push({ $limit: validLimit });
        }

        try {
            return await Model.aggregate(pipeline);
        } catch (error) {
            // Provide more context for aggregation errors
            throw new Error(`Aggregation pipeline failed: ${error.message}. Pipeline: ${JSON.stringify(pipeline)}`);
        }
    }

    // For simple find queries, filter against schema
    const sanitizedReturnFields = combinedReturnFields.filter(f => allowedFields.includes(f));

    // If no return fields specified, return only essential identifier fields
    // This ensures we don't return all fields unnecessarily
    const fieldsToReturn = sanitizedReturnFields.length > 0
        ? sanitizedReturnFields
        : ['internalId']; // Default to just the ID if nothing specified

    // Simple find - only return specified fields
    try {
        return await Model.find(filters)
            .select(fieldsToReturn.join(" "))
            .limit(validLimit)
            .lean();
    } catch (error) {
        // Provide more context for find query errors
        throw new Error(`Find query failed: ${error.message}. Filters: ${JSON.stringify(filters)}`);
    }
};

