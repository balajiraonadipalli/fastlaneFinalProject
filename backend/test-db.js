// Test script to verify MongoDB connection and test API endpoints
const mongoose = require('mongoose');

const MONGODB_URI = 'mongodb://localhost:27017/fastlane';

async function testConnection() {
  console.log('🧪 Testing MongoDB Connection...\n');
  
  try {
    // Connect to MongoDB
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    console.log('✅ MongoDB Connected Successfully!');
    console.log(`📊 Database: ${mongoose.connection.name}`);
    console.log(`🔗 Host: ${mongoose.connection.host}`);
    console.log(`⚡ Port: ${mongoose.connection.port}`);
    console.log(`📁 Connection State: ${mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected'}\n`);
    
    // List all collections
    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log('📚 Collections in database:');
    if (collections.length === 0) {
      console.log('   (No collections yet - will be created when first document is saved)');
    } else {
      collections.forEach(col => {
        console.log(`   - ${col.name}`);
      });
    }
    
    // Count documents in users collection if it exists
    const User = require('./models/User');
    const userCount = await User.countDocuments();
    console.log(`\n👥 Total users in database: ${userCount}`);
    
    if (userCount > 0) {
      const users = await User.find().select('-password');
      console.log('\n📋 Users:');
      users.forEach((user, index) => {
        console.log(`   ${index + 1}. ${user.name} (${user.email}) - Role: ${user.role}`);
      });
    }
    
    console.log('\n✅ Database test completed successfully!');
    
  } catch (error) {
    console.error('\n❌ MongoDB Connection Failed!');
    console.error('Error:', error.message);
    console.error('\n💡 Troubleshooting:');
    console.error('   1. Make sure MongoDB is installed');
    console.error('   2. Start MongoDB service:');
    console.error('      - Windows: net start MongoDB');
    console.error('      - Mac: brew services start mongodb-community');
    console.error('      - Linux: sudo systemctl start mongod');
    console.error('   3. Or run: mongod');
  } finally {
    await mongoose.connection.close();
    console.log('\n👋 Connection closed');
    process.exit(0);
  }
}

testConnection();

