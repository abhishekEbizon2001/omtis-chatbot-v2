import dotenv from 'dotenv';
dotenv.config();
import app from './src/app.js';
import connectDB from './src/config/database.js';

const PORT = process.env.PORT || 3000;

// Connect to MongoDB
connectDB();

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

