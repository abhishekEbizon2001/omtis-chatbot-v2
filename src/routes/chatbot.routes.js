import express from 'express';
const router = express.Router();
import { planQuery } from '../controllers/chatbot.controller.js';

// POST /api/chatbot/query - Plan and execute query from natural language
router.post('/query', planQuery);

export default router;

