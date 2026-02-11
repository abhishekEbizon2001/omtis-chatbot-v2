/**
 * OpenAI Service
 * Handles OpenAI client initialization and API calls
 */

import OpenAI from "openai";

/**
 * Lazy initialization of OpenAI client
 * @returns {OpenAI} - OpenAI client instance
 * @throws {Error} - If OPENAI_API_KEY is not set
 */
export const getOpenAIClient = () => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        throw new Error("OPENAI_API_KEY environment variable is not set");
    }
    return new OpenAI({ apiKey });
};

/**
 * Calls OpenAI API to generate a query plan based on the prompt
 * @param {string} prompt - The system prompt for the LLM
 * @returns {Promise<Object>} - The parsed query plan from OpenAI
 * @throws {Error} - If API call fails or response cannot be parsed
 */
export const generateQueryPlan = async (prompt) => {
    const openai = getOpenAIClient();

    const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "system", content: prompt }],
        temperature: 0,
    });

    const content = response.choices[0].message.content;
    console.log("content->", content);
    try {
        return JSON.parse(content);
    } catch (parseError) {
        throw new Error(
            `Failed to parse query plan: ${parseError.message}. Raw response: ${content}`
        );
    }
};

