import express from 'express';
const router = express.Router();

// Import route modules
import chatbotRoutes from './chatbot.routes.js';

// Mount routes
router.use('/chatbot', chatbotRoutes);

// API info route
router.get('/', (req, res) => {
  res.json({
    message: 'API is working',
    version: '1.0.0',
    endpoints: {
      chatbot: '/api/chatbot/query'
    }
  });
});

export default router;

