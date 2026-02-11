import SalesOrder from "../models/SalesOrder.model.js";
import Customer from "../models/Customer.model.js";
import InventoryItem from "../models/InventoryItem.model.js";
import { Schemas } from "../config/schemas.js";
import { InventoryItemEnums, CustomerEnums } from "../config/enums.js";

const ENTITY_MAP = { SalesOrder, Customer, InventoryItem };

/**
 * Validates that filters don't contain nested aggregation operators
 * @param {Object} filters - The filters object from query plan
 * @throws {Error} If invalid nesting is detected
 */
const validateFilters = (filters) => {
    const aggregationOperators = ['$lookup', '$match', '$group', '$unwind', '$project', '$sort', '$limit', '$addFields', '$expr', '$facet', '$graphLookup'];
    
    const checkForNestedOperators = (obj, path = 'filters') => {
        if (!obj || typeof obj !== 'object') return;
        
        for (const [key, value] of Object.entries(obj)) {
            // Check if key is an aggregation operator
            if (aggregationOperators.includes(key)) {
                throw new Error(
                    `Invalid query: Aggregation operator "${key}" cannot be used inside "${path}". ` +
                    `Aggregation operators like $lookup, $match, $group must be in the "aggregation" array, not in "filters". ` +
                    `Use "filters" only for simple field matching on the root entity.`
                );
            }
            
            // Check if value is an array containing aggregation operators
            if (Array.isArray(value)) {
                value.forEach((item, index) => {
                    if (item && typeof item === 'object') {
                        for (const itemKey of Object.keys(item)) {
                            if (aggregationOperators.includes(itemKey)) {
                                throw new Error(
                                    `Invalid query: Aggregation operator "${itemKey}" found in "${path}.${key}[${index}]". ` +
                                    `Cannot nest aggregation operators inside filter operators. ` +
                                    `Move "$lookup", "$match", and other pipeline stages to the "aggregation" array.`
                                );
                            }
                        }
                        checkForNestedOperators(item, `${path}.${key}[${index}]`);
                    }
                });
            } else if (value && typeof value === 'object') {
                checkForNestedOperators(value, `${path}.${key}`);
            }
        }
    };
    
    checkForNestedOperators(filters);
};

export const executeQuery = async (queryPlan) => {
    const { entity, filters = {}, aggregation = [], returnFields = [], limit = 100 } = queryPlan;
    const Model = ENTITY_MAP[entity];

    if (!Model) {
        throw new Error(`Unknown entity: ${entity}`);
    }

    // Validate filters don't contain nested aggregation operators
    validateFilters(filters);

    // Validate and fix limit - must be positive
    const validLimit = Math.max(1, limit || 100);

    // -----------------------------
    // ENUM VALIDATION
    // -----------------------------
    const validateEnumField = (field, filterValue, validValues) => {
        // Handle single value
        if (typeof filterValue === 'string') {
            if (!validValues.includes(filterValue)) {
                console.warn(`Invalid enum value for ${field}: ${filterValue}. Removing filter.`);
                return false;
            }
            return true;
        }
        
        // Handle $in operator with array of values
        if (filterValue && typeof filterValue === 'object' && filterValue.$in && Array.isArray(filterValue.$in)) {
            const invalidValues = filterValue.$in.filter(val => !validValues.includes(val));
            if (invalidValues.length > 0) {
                console.warn(`Invalid enum values for ${field}: ${invalidValues.join(', ')}. Removing filter.`);
                return false;
            }
            return true;
        }
        
        return true;
    };

    if (entity === "InventoryItem") {
        for (const [field, validValues] of Object.entries(InventoryItemEnums)) {
            if (filters[field]) {
                if (!validateEnumField(field, filters[field], validValues)) {
                    delete filters[field];
                }
            }
        }
    }

    if (entity === "Customer") {
        for (const [field, validValues] of Object.entries(CustomerEnums)) {
            if (filters[field]) {
                if (!validateEnumField(field, filters[field], validValues)) {
                    delete filters[field];
                }
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

        // CRITICAL FIX: Apply filters to aggregation pipeline
        // Check if pipeline already has a $match stage at the beginning
        const hasInitialMatch = pipeline.length > 0 && pipeline[0].$match !== undefined;

        // If filters exist and no initial $match, prepend $match stage with filters
        if (Object.keys(filters).length > 0 && !hasInitialMatch) {
            pipeline.unshift({ $match: filters });
        } else if (Object.keys(filters).length > 0 && hasInitialMatch) {
            // If $match exists, merge filters with existing $match
            pipeline[0].$match = { ...pipeline[0].$match, ...filters };
        }

        // Check if pipeline already has $project stage
        const hasProject = pipeline.some(stage => stage.$project !== undefined);

        // Check if pipeline already has $limit stage
        const hasLimit = pipeline.some(stage => stage.$limit !== undefined);

        // Check if pipeline uses grouped pattern (has $group with items field using $$ROOT)
        // This pattern is used for per-category limiting with $setWindowFields
        const hasGroupedPattern = pipeline.some(stage => {
            if (stage.$group) {
                const groupStage = stage.$group;
                // Check if any field in the $group uses $push with "$$ROOT"
                return Object.values(groupStage).some(value => {
                    if (value && typeof value === 'object' && value.$push === "$$ROOT") {
                        return true;
                    }
                    return false;
                });
            }
            return false;
        });

        // Add $project only if:
        // 1. Not already present
        // 2. We have fields to return
        // 3. NOT using grouped pattern (because $$ROOT already includes all fields)
        if (!hasProject && fieldsToReturn.length > 0 && !hasGroupedPattern) {
            const project = {};
            fieldsToReturn.forEach(f => (project[f] = 1));
            pipeline.push({ $project: project });
        }

        // Add $limit only if:
        // 1. Not already present
        // 2. NOT using grouped pattern (per-category limiting already handled via rank)
        if (!hasLimit && !hasGroupedPattern) {
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

